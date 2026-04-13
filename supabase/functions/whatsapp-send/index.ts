import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const WHATSAPP_API_VERSION = "v22.0";
const WHATSAPP_API_BASE = `https://graph.facebook.com/${WHATSAPP_API_VERSION}`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface SendRequest {
  workspace_id: string;
  to: string;
  type: "text" | "template" | "image" | "audio" | "document" | "video" | "typing";
  content?: string;
  template_name?: string;
  template_language?: string;
  template_components?: unknown[];
  media_url?: string;
  media_mime?: string;
  conversation_id?: string;
  campaign_log_id?: string;
  message_id?: string;
}

async function uploadMediaToMeta(
  phoneNumberId: string,
  accessToken: string,
  mediaUrl: string,
  mimeType: string
): Promise<string> {
  const fileResponse = await fetch(mediaUrl);
  if (!fileResponse.ok) throw new Error("Failed to download media from storage");
  const fileBytes = await fileResponse.arrayBuffer();
  const fileBlob = new Blob([fileBytes], { type: mimeType });

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", fileBlob, `media.${mimeType.split('/')[1]?.split(';')[0] || 'bin'}`);

  const uploadUrl = `${WHATSAPP_API_BASE}/${phoneNumberId}/media`;
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}` },
    body: form,
  });

  const result = await res.json();
  if (!res.ok) {
    console.error("Meta Media Upload error:", JSON.stringify(result));
    throw new Error(result.error?.message || "Media upload failed");
  }

  console.log("Media uploaded to Meta:", result.id);
  return result.id;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body: SendRequest = await req.json();
    const { workspace_id, to, type } = body;

    if (!workspace_id || !to || !type) {
      return jsonResponse({ error: "Missing required fields: workspace_id, to, type" }, 400);
    }

    const { data: waAccount, error: waError } = await supabase
      .from("whatsapp_accounts")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("status", "active")
      .single();

    if (waError || !waAccount) {
      return jsonResponse({ error: "No active WhatsApp account found" }, 400);
    }

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: to,
    };

    switch (type) {
      case "text":
        payload.type = "text";
        payload.text = { body: body.content || "" };
        break;

      case "template":
        payload.type = "template";
        payload.template = {
          name: body.template_name,
          language: { code: body.template_language || "pt_BR" },
        };
        if (body.template_components?.length) {
          (payload.template as Record<string, unknown>).components = body.template_components;
        }
        break;

      case "audio": {
        payload.type = "audio";
        if (body.media_url) {
          try {
            const rawMime = (body.media_mime || "audio/ogg").split(";")[0].trim();
            const metaMime = rawMime === "audio/webm" ? "audio/ogg; codecs=opus" : rawMime;
            const mediaId = await uploadMediaToMeta(
              waAccount.phone_number_id,
              waAccount.access_token,
              body.media_url,
              metaMime
            );
            payload.audio = { id: mediaId };
          } catch (uploadErr) {
            console.error("Audio upload fallback to link:", uploadErr);
            payload.audio = { link: body.media_url };
          }
        }
        break;
      }

      case "image":
        payload.type = "image";
        payload.image = { link: body.media_url };
        if (body.content) (payload.image as Record<string, unknown>).caption = body.content;
        break;

      case "video":
        payload.type = "video";
        payload.video = { link: body.media_url };
        if (body.content) (payload.video as Record<string, unknown>).caption = body.content;
        break;

      case "document":
        payload.type = "document";
        payload.document = { link: body.media_url, filename: body.content || "document" };
        break;

      case "typing":
        payload.status = "read";
        payload.message_id = body.message_id;
        payload.typing_indicator = { show: true };
        break;

      default:
        return jsonResponse({ error: `Unsupported type: ${type}` }, 400);
    }

    const apiUrl = `${WHATSAPP_API_BASE}/${waAccount.phone_number_id}/messages`;
    console.log(`Sending ${type} to ${to}`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${waAccount.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    console.log(`WhatsApp API response (${response.status}):`, JSON.stringify(result));

    if (!response.ok) {
      if (body.conversation_id) {
        await supabase.from("messages").insert({
          conversation_id: body.conversation_id, workspace_id,
          direction: "outbound", type, content: body.content,
          media_url: body.media_url, status: "failed",
          error_details: result.error || result,
        });
      }
      if (body.campaign_log_id) {
        await supabase.from("campaign_logs").update({ status: "failed", error_details: result.error || result }).eq("id", body.campaign_log_id);
      }
      return jsonResponse({ error: result.error?.message || "WhatsApp API error", details: result }, 502);
    }

    const wamid = result.messages?.[0]?.id;

    if (body.conversation_id) {
      await supabase.from("messages").insert({
        conversation_id: body.conversation_id, workspace_id,
        direction: "outbound", type, content: body.content,
        media_url: body.media_url, wamid, status: "sent",
      });
    }
    if (body.campaign_log_id) {
      await supabase.from("campaign_logs").update({ status: "sent", wamid, sent_at: new Date().toISOString() }).eq("id", body.campaign_log_id);
    }

    return jsonResponse({ success: true, wamid });
  } catch (error) {
    console.error("Send error:", error);
    return jsonResponse({ error: String(error) }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
