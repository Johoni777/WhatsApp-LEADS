// supabase/functions/whatsapp-send/index.ts
// Sends messages via WhatsApp Cloud API

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WHATSAPP_API_VERSION = "v22.0";
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface SendRequest {
  workspace_id: string;
  to: string; // phone number
  type: "text" | "template" | "image" | "audio" | "document";
  content?: string;
  template_name?: string;
  template_language?: string;
  template_components?: unknown[];
  media_url?: string;
  conversation_id?: string;
  campaign_log_id?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body: SendRequest = await req.json();
    const { workspace_id, to, type } = body;

    // Get WhatsApp account for workspace
    const { data: waAccount, error: waError } = await supabase
      .from("whatsapp_accounts")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("status", "active")
      .single();

    if (waError || !waAccount) {
      return jsonResponse({ error: "No active WhatsApp account found" }, 400);
    }

    // Build payload based on type
    let payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: to,
    };

    switch (type) {
      case "text":
        payload.type = "text";
        payload.text = { body: body.content };
        break;

      case "template":
        payload.type = "template";
        payload.template = {
          name: body.template_name,
          language: { code: body.template_language || "pt_BR" },
        };
        if (body.template_components && body.template_components.length > 0) {
          payload.template = {
            ...payload.template as Record<string, unknown>,
            components: body.template_components,
          };
        }
        break;

      case "image":
        payload.type = "image";
        payload.image = { link: body.media_url };
        if (body.content) {
          (payload.image as Record<string, unknown>).caption = body.content;
        }
        break;

      case "audio":
        payload.type = "audio";
        payload.audio = { link: body.media_url };
        break;

      case "document":
        payload.type = "document";
        payload.document = {
          link: body.media_url,
          filename: body.content || "document",
        };
        break;
    }

    // Send to WhatsApp API
    const apiUrl = `${WHATSAPP_API_BASE}/${waAccount.phone_number_id}/messages`;
    
    console.log(`📤 Sending ${type} to ${to}`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${waAccount.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ WhatsApp API error:", JSON.stringify(result));

      // Update message status to failed
      if (body.conversation_id) {
        await supabase.from("messages").insert({
          conversation_id: body.conversation_id,
          workspace_id,
          direction: "outbound",
          type,
          content: body.content,
          status: "failed",
          error_details: result.error,
        });
      }

      // Update campaign log if applicable
      if (body.campaign_log_id) {
        await supabase
          .from("campaign_logs")
          .update({ status: "failed", error_details: result.error })
          .eq("id", body.campaign_log_id);
      }

      return jsonResponse({ error: result.error?.message || "API error", details: result }, 502);
    }

    const wamid = result.messages?.[0]?.id;
    console.log(`✅ Message sent: ${wamid}`);

    // Save message to DB
    if (body.conversation_id) {
      await supabase.from("messages").insert({
        conversation_id: body.conversation_id,
        workspace_id,
        direction: "outbound",
        type,
        content: body.content,
        media_url: body.media_url,
        wamid,
        status: "sent",
      });
    }

    // Update campaign log
    if (body.campaign_log_id) {
      await supabase
        .from("campaign_logs")
        .update({ status: "sent", wamid, sent_at: new Date().toISOString() })
        .eq("id", body.campaign_log_id);
    }

    return jsonResponse({ success: true, wamid });
  } catch (error) {
    console.error("❌ Send error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
