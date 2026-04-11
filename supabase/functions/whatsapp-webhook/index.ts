// supabase/functions/whatsapp-webhook/index.ts
// Handles incoming webhooks from WhatsApp Cloud API

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "zapflow_default_token";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ===== GET: Webhook Verification =====
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token) {
      if (token === VERIFY_TOKEN) {
        console.log("✅ Webhook verified successfully (ENV)");
        return new Response(challenge, { status: 200 });
      }
      
      // Validação Multi-tenant 
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
        if (!supabaseUrl || !supabaseKey) {
           console.warn("Missing Supabase env vars, cannot verify via DB.");
           return new Response("Forbidden", { status: 403 });
        }
        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data } = await supabase
          .from("whatsapp_accounts")
          .select("id")
          .or(`display_name.eq.${token},webhook_verify_token.eq.${token}`)
          .limit(1);

        if (data && data.length > 0) {
          console.log("✅ Webhook verified successfully (DB Match)");
          return new Response(challenge, { status: 200 });
        }
      } catch (err) {
        console.error("DB check error", err);
      }
    }

    console.warn("❌ Webhook verification failed");
    return new Response("Forbidden", { status: 403 });
  }

  // ===== POST: Incoming Messages & Status Updates =====
  if (req.method === "POST") {
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");
      if (!supabaseUrl || !supabaseKey) {
          console.error("Missing SUPABASE env vars inside POST");
          return new Response("Server config error", { status: 500 });
      }
      const supabase = createClient(supabaseUrl, supabaseKey);
      const body = await req.json();
      console.log("📩 Webhook received:", JSON.stringify(body).slice(0, 500));

      const entry = body?.entry?.[0];
      if (!entry) return new Response("OK", { status: 200 });

      const changes = entry.changes?.[0];
      if (!changes) return new Response("OK", { status: 200 });

      const value = changes.value;
      const phoneNumberId = value?.metadata?.phone_number_id;

      // Find WhatsApp account
      const { data: waAccount } = await supabase
        .from("whatsapp_accounts")
        .select("id, workspace_id")
        .eq("phone_number_id", phoneNumberId)
        .single();

      if (!waAccount) {
        console.warn("⚠️ No WhatsApp account found for phone_number_id:", phoneNumberId);
        return new Response("OK", { status: 200 });
      }

      // Handle incoming messages
      if (value.messages) {
        for (const msg of value.messages) {
          await handleIncomingMessage(waAccount, msg, value.contacts?.[0]);
        }
      }

      // Handle status updates
      if (value.statuses) {
        for (const status of value.statuses) {
          await handleStatusUpdate(status);
        }
      }

      return new Response("EVENT_RECEIVED", { status: 200 });
    } catch (error) {
      console.error("❌ Webhook error:", error);
      return new Response("Error", { status: 200 }); // Always return 200 to avoid retries
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});

async function handleIncomingMessage(
  waAccount: { id: string; workspace_id: string },
  msg: Record<string, unknown>,
  contactInfo: Record<string, unknown> | undefined
) {
  const phone = String(msg.from);
  const contactName = contactInfo?.profile
    ? String((contactInfo.profile as Record<string, unknown>).name)
    : null;

  // Upsert contact
  const { data: contact } = await supabase
    .from("contacts")
    .upsert(
      {
        workspace_id: waAccount.workspace_id,
        phone,
        name: contactName,
        source: "api",
      },
      { onConflict: "workspace_id,phone" }
    )
    .select("id")
    .single();

  if (!contact) return;

  // Upsert conversation
  const { data: conversation } = await supabase
    .from("conversations")
    .upsert(
      {
        workspace_id: waAccount.workspace_id,
        contact_id: contact.id,
        whatsapp_account_id: waAccount.id,
        status: "active",
      },
      { onConflict: "workspace_id,contact_id" }
    )
    .select("id")
    .single();

  if (!conversation) return;

  // Parse message content
  const messageType = String(msg.type);
  let content = null;
  let mediaUrl = null;
  let mediaType = null;

  switch (messageType) {
    case "text":
      content = String((msg.text as Record<string, unknown>)?.body || "");
      break;
    case "image":
      content = String((msg.image as Record<string, unknown>)?.caption || "");
      mediaType = "image";
      break;
    case "audio":
      mediaType = "audio";
      break;
    case "video":
      content = String((msg.video as Record<string, unknown>)?.caption || "");
      mediaType = "video";
      break;
    case "document":
      content = String((msg.document as Record<string, unknown>)?.filename || "Documento");
      mediaType = "document";
      break;
    case "sticker":
      mediaType = "sticker";
      break;
    case "location":
      const loc = msg.location as Record<string, unknown>;
      content = `📍 ${loc?.latitude}, ${loc?.longitude}`;
      break;
    default:
      content = `[${messageType}]`;
  }

  // Insert message
  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    workspace_id: waAccount.workspace_id,
    direction: "inbound",
    type: messageType,
    content,
    media_url: mediaUrl,
    media_type: mediaType,
    wamid: String(msg.id),
    status: "delivered",
    metadata: { timestamp: msg.timestamp },
  });

  console.log(`✅ Message saved: ${messageType} from ${phone}`);
}

async function handleStatusUpdate(status: Record<string, unknown>) {
  const wamid = String(status.id);
  const statusValue = String(status.status);

  const statusMap: Record<string, string> = {
    sent: "sent",
    delivered: "delivered",
    read: "read",
    failed: "failed",
  };

  const mappedStatus = statusMap[statusValue];
  if (!mappedStatus) return;

  // Update message status
  await supabase
    .from("messages")
    .update({
      status: mappedStatus,
      error_details: statusValue === "failed" ? status.errors : null,
    })
    .eq("wamid", wamid);

  // Update campaign_log if exists
  const updateData: Record<string, unknown> = { status: mappedStatus };
  if (mappedStatus === "delivered") updateData.delivered_at = new Date().toISOString();
  if (mappedStatus === "read") updateData.read_at = new Date().toISOString();
  if (mappedStatus === "failed") updateData.error_details = status.errors;

  await supabase
    .from("campaign_logs")
    .update(updateData)
    .eq("wamid", wamid);

  console.log(`📊 Status updated: ${wamid} → ${mappedStatus}`);
}
