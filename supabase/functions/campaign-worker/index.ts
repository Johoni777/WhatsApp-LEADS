// supabase/functions/campaign-worker/index.ts
// Processes campaign message queue with rate limiting and retry

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SEND_FUNCTION_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`;
const MAX_RETRY = 3;
const BATCH_SIZE = 50;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { campaign_id } = await req.json();

    if (!campaign_id) {
      return jsonResponse({ error: "campaign_id required" }, 400);
    }

    // Get campaign
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .single();

    if (campaignError || !campaign) {
      return jsonResponse({ error: "Campaign not found" }, 404);
    }

    // Mark as running
    await supabase
      .from("campaigns")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", campaign_id);

    // Get queued logs in batches
    const rateLimit = campaign.rate_limit_per_second || 80;
    const delayBetweenMessages = Math.ceil(1000 / rateLimit); // ms between each message
    let processed = 0;
    let hasMore = true;

    while (hasMore) {
      // Check if campaign was paused
      const { data: currentStatus } = await supabase
        .from("campaigns")
        .select("status")
        .eq("id", campaign_id)
        .single();

      if (currentStatus?.status === "paused") {
        console.log("⏸️ Campaign paused");
        return jsonResponse({ message: "Campaign paused", processed });
      }

      // Get next batch
      const { data: logs, error: logsError } = await supabase
        .from("campaign_logs")
        .select("*, contacts(*)")
        .eq("campaign_id", campaign_id)
        .eq("status", "queued")
        .lt("retry_count", MAX_RETRY)
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);

      if (logsError || !logs || logs.length === 0) {
        hasMore = false;
        break;
      }

      // Process batch
      for (const log of logs) {
        try {
          // Mark as sending
          await supabase
            .from("campaign_logs")
            .update({ status: "sending" })
            .eq("id", log.id);

          // Build template components with variable substitution
          const components = substituteVariables(
            campaign.template_components,
            campaign.variable_mapping,
            log.contacts
          );

          // Call whatsapp-send function
          const sendResponse = await fetch(SEND_FUNCTION_URL, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              workspace_id: campaign.workspace_id,
              to: log.contacts.phone,
              type: "template",
              template_name: campaign.template_name,
              template_language: campaign.template_language,
              template_components: components,
              campaign_log_id: log.id,
            }),
          });

          const sendResult = await sendResponse.json();

          if (!sendResponse.ok) {
            console.error(`❌ Failed for ${log.contacts.phone}:`, sendResult.error);
            
            // Retry logic
            await supabase
              .from("campaign_logs")
              .update({
                status: log.retry_count + 1 >= MAX_RETRY ? "failed" : "queued",
                retry_count: log.retry_count + 1,
                error_details: sendResult,
              })
              .eq("id", log.id);
          }

          processed++;

          // Rate limiting delay
          await sleep(delayBetweenMessages);
        } catch (err) {
          console.error(`❌ Error processing log ${log.id}:`, err);
          await supabase
            .from("campaign_logs")
            .update({
              status: "queued",
              retry_count: log.retry_count + 1,
              error_details: { message: String(err) },
            })
            .eq("id", log.id);
        }
      }
    }

    // Mark campaign as completed
    await supabase
      .from("campaigns")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", campaign_id);

    console.log(`✅ Campaign ${campaign_id} completed. Processed: ${processed}`);
    return jsonResponse({ success: true, processed });
  } catch (error) {
    console.error("❌ Campaign worker error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

function substituteVariables(
  templateComponents: unknown[],
  variableMapping: Record<string, string>,
  contact: Record<string, unknown>
): unknown[] {
  if (!templateComponents || !Array.isArray(templateComponents)) return [];

  return templateComponents.map((comp: unknown) => {
    const component = comp as Record<string, unknown>;
    if (!component.parameters) return component;

    const params = (component.parameters as unknown[]).map((param: unknown) => {
      const p = param as Record<string, unknown>;
      if (p.type === "text" && typeof p.text === "string") {
        // Replace {{variable}} with contact field
        let text = p.text;
        for (const [variable, field] of Object.entries(variableMapping)) {
          const value = String(contact[field] || contact.custom_fields?.[field as keyof typeof contact.custom_fields] || variable);
          text = text.replace(`{{${variable}}}`, value);
        }
        return { ...p, text };
      }
      return p;
    });

    return { ...component, parameters: params };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
