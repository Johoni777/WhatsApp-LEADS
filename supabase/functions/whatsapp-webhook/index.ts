import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const WHATSAPP_API_VERSION = "v22.0";
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;
const PROCESS_AGENT_JOBS_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-agent-jobs`;

function getSupabaseClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function runAsync(task: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(task);
  } else {
    task.catch((error) => console.error("Async task failed:", error));
  }
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // ===== GET: Webhook Verification (multi-tenant) =====
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token && challenge) {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase
          .from("whatsapp_accounts")
          .select("id")
          .eq("webhook_verify_token", token)
          .limit(1);

        if (data && data.length > 0) {
          console.log("Webhook verified for account:", data[0].id);
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain" },
          });
        }
      } catch (err) {
        console.error("DB verify error:", err);
      }
    }

    console.warn("Webhook verification failed");
    return new Response("Forbidden", { status: 403 });
  }

  // ===== POST: Incoming Messages & Status Updates =====
  if (req.method === "POST") {
    try {
      const supabase = getSupabaseClient();
      const body = await req.json();
      const entries = Array.isArray(body?.entry) ? body.entry : [];
      if (entries.length === 0) return new Response("OK", { status: 200 });

      for (const entry of entries) {
        const changes = Array.isArray((entry as Record<string, unknown>)?.changes)
          ? ((entry as Record<string, unknown>).changes as Record<string, unknown>[])
          : [];

        for (const change of changes) {
          const value = (change as Record<string, unknown>)?.value as Record<string, unknown> | undefined;
          const phoneNumberId = String((value?.metadata as Record<string, unknown> | undefined)?.phone_number_id || "");
          if (!phoneNumberId) continue;

          const { data: waAccount } = await supabase
            .from("whatsapp_accounts")
            .select("id, workspace_id, access_token")
            .eq("phone_number_id", phoneNumberId)
            .single();

          if (!waAccount) {
            console.warn("No WhatsApp account for phone_number_id:", phoneNumberId);
            continue;
          }

          const messages = Array.isArray(value?.messages) ? value.messages : [];
          const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
          const contactInfo = Array.isArray(value?.contacts) ? value.contacts[0] : undefined;

          for (const msg of messages) {
            await handleIncomingMessage(supabase, waAccount, msg as Record<string, unknown>, contactInfo as Record<string, unknown> | undefined);
          }

          for (const status of statuses) {
            await handleStatusUpdate(supabase, status as Record<string, unknown>);
          }
        }
      }

      return new Response("EVENT_RECEIVED", { status: 200 });
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});

async function handleIncomingMessage(
  supabase: SupabaseClient,
  waAccount: { id: string; workspace_id: string; access_token?: string },
  msg: Record<string, unknown>,
  contactInfo: Record<string, unknown> | undefined
) {
  const phone = String(msg.from);
  const contactName = contactInfo?.profile
    ? String((contactInfo.profile as Record<string, unknown>).name)
    : null;

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

  const messageType = String(msg.type);
  let content = null;
  let mediaUrl = null;
  let mediaType = null;

  const downloadIncomingMedia = async (
    media: Record<string, unknown> | undefined,
    fallbackKind: string
  ) => {
    if (!media || !waAccount.access_token) return null;

    const mediaId = String(media.id || "");
    const directUrl = String(media.url || "");
    const mimeType = String(media.mime_type || "");

    let resolvedUrl = directUrl;
    if (!resolvedUrl && mediaId) {
      const meta = await fetch(`${WHATSAPP_API_BASE}/${mediaId}`, {
        headers: { Authorization: `Bearer ${waAccount.access_token}` },
      });
      if (meta.ok) {
        const metaJson = await meta.json();
        resolvedUrl = metaJson.url || "";
      }
    }

    if (!resolvedUrl) return null;

    const mediaResponse = await fetch(resolvedUrl, {
      headers: { Authorization: `Bearer ${waAccount.access_token}` },
    });
    if (!mediaResponse.ok) return null;

    const blob = await mediaResponse.blob();
    const effectiveMime = mimeType || mediaResponse.headers.get("content-type") || "application/octet-stream";
    const ext =
      effectiveMime.includes("ogg") ? "ogg" :
      effectiveMime.includes("mpeg") ? "mp3" :
      effectiveMime.includes("mp4") ? "mp4" :
      effectiveMime.includes("jpeg") ? "jpg" :
      effectiveMime.includes("png") ? "png" :
      effectiveMime.includes("pdf") ? "pdf" :
      fallbackKind;

    const path = `${waAccount.workspace_id}/inbound/${Date.now()}-${mediaId || crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(path, blob, { contentType: effectiveMime, upsert: true });

    if (uploadError) {
      console.error("Failed to store inbound media:", uploadError);
      return null;
    }

    const { data } = supabase.storage.from("media").getPublicUrl(path);
    return data.publicUrl;
  };

  switch (messageType) {
    case "text":
      content = String((msg.text as Record<string, unknown>)?.body || "");
      break;
    case "image":
      content = String((msg.image as Record<string, unknown>)?.caption || "");
      mediaType = "image";
      mediaUrl = await downloadIncomingMedia(msg.image as Record<string, unknown> | undefined, "jpg");
      break;
    case "audio":
      mediaType = "audio";
      mediaUrl = await downloadIncomingMedia(msg.audio as Record<string, unknown> | undefined, "ogg");
      break;
    case "video":
      content = String((msg.video as Record<string, unknown>)?.caption || "");
      mediaType = "video";
      mediaUrl = await downloadIncomingMedia(msg.video as Record<string, unknown> | undefined, "mp4");
      break;
    case "document":
      content = String((msg.document as Record<string, unknown>)?.filename || "Documento");
      mediaType = "document";
      mediaUrl = await downloadIncomingMedia(msg.document as Record<string, unknown> | undefined, "bin");
      break;
    case "sticker":
      mediaType = "sticker";
      break;
    case "location": {
      const loc = msg.location as Record<string, unknown>;
      content = `${loc?.latitude}, ${loc?.longitude}`;
      break;
    }
    default:
      content = `[${messageType}]`;
  }

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

  await supabase
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: content || `[${messageType}]`,
    })
    .eq("id", conversation.id);

  // Enqueue AI job if active
  try {
    const { data: conv } = await supabase
      .from("conversations")
      .select("is_ai_active")
      .eq("id", conversation.id)
      .single();

    if (conv?.is_ai_active && messageType === "text" && content) {
      const { data: settings } = await supabase
        .from("agent_settings")
        .select("is_active, quiet_window_seconds")
        .eq("workspace_id", waAccount.workspace_id)
        .maybeSingle();

      if (!settings?.is_active) {
        console.log("Skipping AI enqueue because workspace agent is disabled");
        return;
      }

      const quietWindowSeconds = Math.max(0, Number(settings.quiet_window_seconds || 15));
      const now = Date.now();
      const nowIso = new Date(now).toISOString();
      const nextAttemptAt = new Date(now + quietWindowSeconds * 1000).toISOString();

      await supabase
        .from("conversations")
        .update({
          ai_pending_message_wamid: String(msg.id),
          ai_pending_since: nowIso,
        })
        .eq("id", conversation.id)

      const { data: existingJobs } = await supabase
        .from("agent_jobs")
        .select("id, status, batch_started_at")
        .eq("conversation_id", conversation.id)
        .in("status", ["pending", "retry", "processing"])
        .order("created_at", { ascending: false })
        .limit(1);

      const existingJob = existingJobs?.[0];

      if (existingJob && (existingJob.status === "pending" || existingJob.status === "retry")) {
        await supabase
          .from("agent_jobs")
          .update({
            contact_id: contact.id,
            contact_name: contactName || phone,
            latest_message: content,
            message_id: String(msg.id),
            status: "pending",
            next_attempt_at: nextAttemptAt,
            batch_started_at: existingJob.status === "retry" ? nowIso : existingJob.batch_started_at,
            attempt_count: existingJob.status === "retry" ? 0 : undefined,
            locked_at: null,
            locked_by: null,
            last_error: null,
            last_error_code: null,
            last_error_details: {},
            fallback_reason: null,
            fallback_sent_at: null,
            completed_at: null,
          })
          .eq("id", existingJob.id);
      } else {
        await supabase
          .from("agent_jobs")
          .insert({
            workspace_id: waAccount.workspace_id,
            conversation_id: conversation.id,
            contact_id: contact.id,
            contact_name: contactName || phone,
            latest_message: content,
            message_id: String(msg.id),
            batch_started_at: nowIso,
            status: "pending",
            next_attempt_at: nextAttemptAt,
          });
      }

      runAsync(fetch(PROCESS_AGENT_JOBS_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "new_inbound_message",
          conversation_id: conversation.id,
        }),
      }));
    }
  } catch (err) {
    console.error("AI agent trigger error:", err);
  }

  console.log(`Message saved: ${messageType} from ${phone}`);
}

async function handleStatusUpdate(
  supabase: SupabaseClient,
  status: Record<string, unknown>
) {
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

  await supabase
    .from("messages")
    .update({
      status: mappedStatus,
      error_details: statusValue === "failed" ? status.errors : null,
    })
    .eq("wamid", wamid);

  const updateData: Record<string, unknown> = { status: mappedStatus };
  if (mappedStatus === "delivered") updateData.delivered_at = new Date().toISOString();
  if (mappedStatus === "read") updateData.read_at = new Date().toISOString();
  if (mappedStatus === "failed") updateData.error_details = status.errors;

  await supabase
    .from("campaign_logs")
    .update(updateData)
    .eq("wamid", wamid);

  console.log(`Status updated: ${wamid} -> ${mappedStatus}`);
}
