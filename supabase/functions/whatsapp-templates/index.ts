import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

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

interface TemplateRequest {
  action: "list" | "send" | "send_bulk";
  workspace_id: string;
  template_name?: string;
  template_language?: string;
  template_components?: unknown[];
  to?: string;
  contacts?: string[];
  offset?: number;
  limit?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body: TemplateRequest = await req.json();
    const { action, workspace_id } = body;

    if (!workspace_id || !action) {
      return json({ error: "Missing workspace_id or action" }, 400);
    }

    const { data: waAccount, error: waErr } = await supabase
      .from("whatsapp_accounts")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("status", "active")
      .single();

    if (waErr || !waAccount) {
      return json({ error: "No active WhatsApp account" }, 400);
    }

    if (action === "list") {
      const url = `${WHATSAPP_API_BASE}/${waAccount.business_account_id}/message_templates?limit=100&status=APPROVED`;
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${waAccount.access_token}` },
      });
      const data = await res.json();

      if (!res.ok) {
        return json({ error: data.error?.message || "Failed to fetch templates", details: data }, 502);
      }

      const templates = (data.data || []).map((t: Record<string, unknown>) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        category: t.category,
        language: t.language,
        components: t.components,
      }));

      return json({ templates });
    }

    if (action === "send") {
      if (!body.template_name || !body.to) {
        return json({ error: "template_name and to are required" }, 400);
      }

      const result = await sendTemplate(
        supabase,
        workspace_id,
        waAccount,
        body.to,
        body.template_name,
        body.template_language || "pt_BR",
        body.template_components
      );
      return json(result.ok ? { success: true, wamid: result.wamid } : { error: result.error }, result.ok ? 200 : 502);
    }

    if (action === "send_bulk") {
      if (!body.template_name || !body.contacts?.length) {
        return json({ error: "template_name and contacts[] are required" }, 400);
      }

      const offset = Math.max(0, Number(body.offset) || 0);
      const limit =
        body.limit != null && Number(body.limit) > 0
          ? Number(body.limit)
          : body.contacts.length;
      const slice = body.contacts.slice(offset, offset + limit);

      const rateLimit = 80;
      const delay = Math.ceil(1000 / rateLimit);
      let sent = 0, failed = 0;
      const errors: Record<string, string> = {};

      for (const phone of slice) {
        const result = await sendTemplate(
          supabase,
          workspace_id,
          waAccount,
          phone,
          body.template_name,
          body.template_language || "pt_BR",
          body.template_components
        );
        if (result.ok) {
          sent++;
        } else {
          failed++;
          errors[phone] = result.error || "Unknown error";
        }
        if (delay > 0) await sleep(delay);
      }

      const nextOffset = offset + slice.length;
      const hasMore = nextOffset < body.contacts.length;

      return json({
        sent,
        failed,
        total: slice.length,
        next_offset: nextOffset,
        has_more: hasMore,
        errors: Object.keys(errors).length > 0 ? errors : undefined,
      });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (error) {
    console.error("Templates error:", error);
    return json({ error: String(error) }, 500);
  }
});

async function sendTemplate(
  supabase: SupabaseClient,
  workspaceId: string,
  waAccount: Record<string, unknown>,
  to: string,
  templateName: string,
  language: string,
  components?: unknown[]
): Promise<{ ok: boolean; wamid?: string; error?: string }> {
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
    },
  };

  if (components?.length) {
    (payload.template as Record<string, unknown>).components = components;
  }

  const apiUrl = `${WHATSAPP_API_BASE}/${waAccount.phone_number_id}/messages`;
  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${waAccount.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await res.json();

  if (!res.ok) {
    console.error(`Template send failed to ${to}:`, JSON.stringify(result));
    return { ok: false, error: result.error?.message || "API error" };
  }

  const wamid = result.messages?.[0]?.id as string | undefined;

  try {
    await persistOutboundTemplateMessage(
      supabase,
      workspaceId,
      waAccount,
      to,
      templateName,
      language,
      wamid
    );
  } catch (e) {
    console.error("persistOutboundTemplateMessage:", e);
  }

  return { ok: true, wamid };
}

async function persistOutboundTemplateMessage(
  supabase: SupabaseClient,
  workspaceId: string,
  waAccount: Record<string, unknown>,
  phone: string,
  templateName: string,
  language: string,
  wamid: string | undefined
) {
  const { data: contact, error: cErr } = await supabase
    .from("contacts")
    .upsert(
      { workspace_id: workspaceId, phone, source: "api" },
      { onConflict: "workspace_id,phone" }
    )
    .select("id")
    .single();

  if (cErr || !contact) {
    console.error("contact upsert for template:", cErr);
    return;
  }

  const { data: conversation, error: convErr } = await supabase
    .from("conversations")
    .upsert(
      {
        workspace_id: workspaceId,
        contact_id: contact.id,
        whatsapp_account_id: waAccount.id as string,
        status: "active",
      },
      { onConflict: "workspace_id,contact_id" }
    )
    .select("id")
    .single();

  if (convErr || !conversation) {
    console.error("conversation upsert for template:", convErr);
    return;
  }

  const preview = `Template: ${templateName}`;
  const now = new Date().toISOString();

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    workspace_id: workspaceId,
    direction: "outbound",
    type: "template",
    content: preview,
    wamid: wamid || null,
    status: "sent",
    metadata: { template_name: templateName, template_language: language },
  });

  await supabase
    .from("conversations")
    .update({ last_message_at: now, last_message_preview: preview })
    .eq("id", conversation.id);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
