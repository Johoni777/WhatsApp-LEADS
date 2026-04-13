import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const MAX_RESPONSE_CHUNK_CHARS = 280;
const MAX_HISTORY_CHARS = 12000;
const GEMINI_INLINE_RETRIES = 2;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SEND_FUNCTION_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`;

interface AgentRequest {
  workspace_id: string;
  conversation_id: string;
  message: string;
  contact_name: string;
  message_id?: string;
  job_id?: string;
}

interface AgentTagRule {
  tag: string;
  mode: "agent_off" | "prompt_append";
  prompt?: string | null;
}

interface AgentPromptConfig {
  agent_name?: string;
  company_name?: string;
  role_description?: string;
  mission?: string;
  lead_context?: string;
  product_name?: string;
  product_price?: string;
  product_uses?: string;
  first_response_rule?: string;
  first_response_example?: string;
  flow_steps?: string;
  critical_rules?: string;
  safety_rules?: string;
  style_rules?: string;
  extra_instructions?: string;
}

const PROMPT_CONFIG_MARKER_START = "<!-- ZAPFLOW_PROMPT_CONFIG:";
const PROMPT_CONFIG_MARKER_END = ":END_ZAPFLOW_PROMPT_CONFIG -->";

interface AgentJob {
  id: string;
  workspace_id: string;
  conversation_id: string;
  contact_id: string | null;
  contact_name: string | null;
  latest_message: string | null;
  message_id: string | null;
  batch_started_at: string | null;
  status: string;
  attempt_count: number;
  max_attempts: number;
}

interface ConversationRow {
  contact_id: string;
  ai_pending_message_wamid?: string | null;
  contacts?: Record<string, unknown>;
}

function buildStructuredPrompt(config: AgentPromptConfig | null | undefined) {
  if (!config) return null;

  return `
HOJE E: {{ $now.format('FFFF') }}
TELEFONE: {{ $('Info').item.json.telefone }}
ID: {{ $('Info').item.json.id_conversa }}

## PAPEL
Voce e ${config.agent_name || "o agente comercial"}, ${config.role_description || ""}.
Voce representa ${config.company_name || "a empresa"}.

## MISSAO
${config.mission || ""}

## CONTEXTO
${config.lead_context || ""}

## PRODUTO
${config.product_name || ""} - ${config.product_price || ""}

Usos:
${config.product_uses || ""}

## PRIMEIRA RESPOSTA
${config.first_response_rule || ""}

Exemplo:
${config.first_response_example || ""}

## FLUXO
${config.flow_steps || ""}

## REGRAS CRITICAS
${config.critical_rules || ""}

## SEGURANCA
${config.safety_rules || ""}

## ESTILO
${config.style_rules || ""}
${config.extra_instructions ? `\n## INSTRUCOES EXTRAS\n${config.extra_instructions}` : ""}
`.trim();
}

function stripStoredPromptConfig(systemPrompt?: string | null) {
  if (!systemPrompt) return "";

  const startIndex = systemPrompt.indexOf(PROMPT_CONFIG_MARKER_START);
  const endIndex = systemPrompt.indexOf(PROMPT_CONFIG_MARKER_END);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return systemPrompt.trim();

  return `${systemPrompt.slice(0, startIndex)}${systemPrompt.slice(endIndex + PROMPT_CONFIG_MARKER_END.length)}`.trim();
}

function splitResponseIntoChunks(text: string): string[] {
  const normalized = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");

  const segments = normalized
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const segment of segments) {
    if (segment.length <= MAX_RESPONSE_CHUNK_CHARS) {
      chunks.push(segment);
      continue;
    }

    const pieces = segment.split(/(?<=[,;:])\s+/);
    let current = "";
    for (const piece of pieces) {
      const next = current ? `${current} ${piece}` : piece;
      if (next.length > MAX_RESPONSE_CHUNK_CHARS) {
        if (current) chunks.push(current);
        current = piece;
      } else {
        current = next;
      }
    }
    if (current) chunks.push(current);
  }

  return chunks.length > 0 ? chunks : [text.trim()];
}

function trimConversationHistory(contents: { role: string; parts: { text: string }[] }[], maxChars: number) {
  let total = 0;
  const trimmed: { role: string; parts: { text: string }[] }[] = [];

  for (let i = contents.length - 1; i >= 0; i -= 1) {
    const entry = contents[i];
    const text = entry.parts[0]?.text || "";
    const nextTotal = total + text.length;

    if (trimmed.length > 0 && nextTotal > maxChars) {
      break;
    }

    trimmed.unshift(entry);
    total = nextTotal;
  }

  while (trimmed.length > 0 && trimmed[0].role === "model") {
    trimmed.shift();
  }

  return trimmed;
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelaySeconds(attemptCount: number) {
  return Math.min(300, 15 * Math.pow(2, Math.max(0, attemptCount - 1)));
}

async function logJobEvent(job: AgentJob, level: "info" | "warn" | "error", eventType: string, message: string, details: Record<string, unknown> = {}) {
  await supabase.from("agent_job_logs").insert({
    job_id: job.id,
    workspace_id: job.workspace_id,
    conversation_id: job.conversation_id,
    level,
    event_type: eventType,
    message,
    details,
  });
}

async function clearConversationPending(conversationId: string, messageId?: string | null) {
  if (!messageId) return;

  await supabase
    .from("conversations")
    .update({ ai_pending_message_wamid: null, ai_pending_since: null })
    .eq("id", conversationId)
    .eq("ai_pending_message_wamid", messageId);
}

async function getCurrentPendingMessageId(conversationId: string) {
  const { data } = await supabase
    .from("conversations")
    .select("ai_pending_message_wamid")
    .eq("id", conversationId)
    .single();

  return (data as { ai_pending_message_wamid?: string | null } | null)?.ai_pending_message_wamid || null;
}

async function markJobCancelled(job: AgentJob | null, reason: string, details: Record<string, unknown> = {}) {
  if (!job) return;

  await supabase
    .from("agent_jobs")
    .update({
      status: "cancelled",
      locked_at: null,
      locked_by: null,
      completed_at: new Date().toISOString(),
      last_error: reason,
      last_error_code: reason,
      last_error_details: details,
    })
    .eq("id", job.id);

  await logJobEvent(job, "warn", "job_cancelled", "Job cancelado.", { reason, ...details });
  await clearConversationPending(job.conversation_id, job.message_id);
}

async function markJobCompleted(job: AgentJob | null, response: string) {
  if (!job) return;

  await supabase
    .from("agent_jobs")
    .update({
      status: "completed",
      locked_at: null,
      locked_by: null,
      completed_at: new Date().toISOString(),
      last_error: null,
      last_error_code: null,
      last_error_details: {},
    })
    .eq("id", job.id);

  await logJobEvent(job, "info", "job_completed", "Resposta enviada com sucesso.", {
    response_preview: response.slice(0, 240),
  });
  await clearConversationPending(job.conversation_id, job.message_id);
}

async function scheduleRetry(job: AgentJob | null, reasonCode: string, reasonMessage: string, details: Record<string, unknown> = {}) {
  if (!job) {
    return jsonResponse({ handled: false, reason: reasonCode }, 500);
  }

  if (job.attempt_count >= job.max_attempts) {
    return null;
  }

  const delaySeconds = getRetryDelaySeconds(job.attempt_count);
  const nextAttemptAt = new Date(Date.now() + delaySeconds * 1000).toISOString();

  await supabase
    .from("agent_jobs")
    .update({
      status: "retry",
      locked_at: null,
      locked_by: null,
      next_attempt_at: nextAttemptAt,
      last_error: reasonMessage,
      last_error_code: reasonCode,
      last_error_details: details,
    })
    .eq("id", job.id);

  await logJobEvent(job, "warn", "retry_scheduled", "Job reagendado para nova tentativa.", {
    reason_code: reasonCode,
    reason_message: reasonMessage,
    next_attempt_at: nextAttemptAt,
    attempt_count: job.attempt_count,
    ...details,
  });

  return jsonResponse({ handled: false, retry_scheduled: true, reason: reasonCode, next_attempt_at: nextAttemptAt });
}

async function sendFallbackAndMark(
  job: AgentJob | null,
  conversation: ConversationRow,
  fallbackMessage: string,
  reasonCode: string,
  reasonMessage: string,
  details: Record<string, unknown> = {}
) {
  const contactPhone = (conversation.contacts as Record<string, unknown>)?.phone as string | undefined;
  if (!job || !contactPhone) {
    return jsonResponse({ handled: false, reason: reasonCode }, 500);
  }

  const response = await fetch(SEND_FUNCTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workspace_id: job.workspace_id,
      to: contactPhone,
      type: "text",
      content: fallbackMessage || "Um atendente ira te responder em breve.",
      conversation_id: job.conversation_id,
    }),
  });

  const fallbackResult = await response.json().catch(() => ({}));
  if (!response.ok || (fallbackResult as { error?: string }).error) {
    await supabase
      .from("agent_jobs")
      .update({
        status: "failed",
        locked_at: null,
        locked_by: null,
        completed_at: new Date().toISOString(),
        last_error: "Fallback send failed",
        last_error_code: "fallback_send_failed",
        last_error_details: {
          original_reason_code: reasonCode,
          original_reason_message: reasonMessage,
          original_details: details,
          send_result: fallbackResult,
        },
        fallback_reason: reasonCode,
      })
      .eq("id", job.id);

    await logJobEvent(job, "error", "fallback_send_failed", "Fallback tentou ser enviado, mas falhou.", {
      original_reason_code: reasonCode,
      send_result: fallbackResult,
    });
    await clearConversationPending(job.conversation_id, job.message_id);
    return jsonResponse({ handled: false, reason: "fallback_send_failed" }, 502);
  }

  await supabase
    .from("agent_jobs")
    .update({
      status: "fallback_sent",
      locked_at: null,
      locked_by: null,
      completed_at: new Date().toISOString(),
      fallback_sent_at: new Date().toISOString(),
      fallback_reason: reasonCode,
      last_error: reasonMessage,
      last_error_code: reasonCode,
      last_error_details: details,
    })
    .eq("id", job.id);

  await logJobEvent(job, "error", "fallback_sent", "Fallback enviado ao contato.", {
    reason_code: reasonCode,
    reason_message: reasonMessage,
    ...details,
  });
  await clearConversationPending(job.conversation_id, job.message_id);
  return jsonResponse({ handled: true, fallback: true, reason: reasonCode });
}

async function handleFailure(
  job: AgentJob | null,
  conversation: ConversationRow,
  fallbackMessage: string,
  reasonCode: string,
  reasonMessage: string,
  details: Record<string, unknown> = {}
) {
  const retryResponse = await scheduleRetry(job, reasonCode, reasonMessage, details);
  if (retryResponse) return retryResponse;
  return sendFallbackAndMark(job, conversation, fallbackMessage, reasonCode, reasonMessage, details);
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body: AgentRequest = await req.json();
    const { workspace_id, conversation_id, message, contact_name, message_id, job_id } = body;

    const { data: jobData } = job_id
      ? await supabase
          .from("agent_jobs")
          .select("*")
          .eq("id", job_id)
          .maybeSingle()
      : { data: null };

    const job = (jobData as AgentJob | null) || null;

    const { data: settings } = await supabase
      .from("agent_settings")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (!settings || !settings.is_active) {
      await markJobCancelled(job, "agent_disabled");
      return jsonResponse({ handled: false, reason: "Agent disabled" });
    }

    const { data: conversationData } = await supabase
      .from("conversations")
      .select("contact_id, ai_pending_message_wamid, contacts(phone, tags)")
      .eq("id", conversation_id)
      .single();

    const conversation = conversationData as ConversationRow | null;
    if (!conversation) {
      await markJobCancelled(job, "conversation_not_found");
      return jsonResponse({ handled: false, reason: "Conversation not found" });
    }

    if (message_id && conversation.ai_pending_message_wamid && message_id !== conversation.ai_pending_message_wamid) {
      await markJobCancelled(job, "superseded_before_processing", {
        current_pending_message_id: conversation.ai_pending_message_wamid,
        job_message_id: message_id,
      });
      return jsonResponse({ handled: false, reason: "Superseded by newer inbound message" });
    }

    const geminiApiKey = (settings.gemini_api_key as string | null)?.trim();
    if (!geminiApiKey) {
      return handleFailure(
        job,
        conversation,
        settings.fallback_message,
        "missing_gemini_api_key",
        "Gemini API key ausente nas configuracoes.",
      );
    }

    const contactTags = ((conversation.contacts as Record<string, unknown>)?.tags as string[] | undefined) || [];
    const tagRules = (settings.tag_rules as AgentTagRule[] | null) || [];
    const matchedRules = tagRules.filter((rule) => contactTags.includes(rule.tag));

    if (matchedRules.some((rule) => rule.mode === "agent_off")) {
      await markJobCancelled(job, "agent_disabled_by_tag", { matched_tags: contactTags });
      return jsonResponse({ handled: false, reason: "Agent disabled by tag rule" });
    }

    const responseDelaySeconds = Number(settings.response_delay_seconds || 2);
    const messageGapSeconds = Number(settings.message_gap_seconds || 1);
    const contextMessageLimit = Number(settings.context_message_limit || 100);
    const batchStartedAt = job?.batch_started_at || new Date(Date.now() - 15_000).toISOString();

    const { data: pendingInbound } = await supabase
      .from("messages")
      .select("wamid, content, type, created_at")
      .eq("conversation_id", conversation_id)
      .eq("direction", "inbound")
      .gte("created_at", batchStartedAt)
      .order("created_at", { ascending: true });

    const aggregatedUserMessage = (pendingInbound || [])
      .map((msg) => msg.content || `[${msg.type}]`)
      .filter(Boolean)
      .join("\n");

    const latestInboundWamid = pendingInbound?.[pendingInbound.length - 1]?.wamid;
    if (message_id && latestInboundWamid && message_id !== latestInboundWamid) {
      await markJobCancelled(job, "superseded_by_newer_inbound", {
        latest_inbound_wamid: latestInboundWamid,
        job_message_id: message_id,
      });
      return jsonResponse({ handled: false, reason: "Superseded by newer inbound message" });
    }

    const effectiveUserMessage = aggregatedUserMessage || message;

    const { data: history } = await supabase
      .from("messages")
      .select("direction, content, type, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(contextMessageLimit);

    const rawHistory = (history || []).reverse();
    const conversationHistory: { role: string; parts: { text: string }[] }[] = [];
    for (const msg of rawHistory) {
      const role = msg.direction === "inbound" ? "user" : "model";
      const text = msg.content || `[${msg.type}]`;
      const last = conversationHistory[conversationHistory.length - 1];
      if (last && last.role === role) {
        last.parts[0].text += "\n" + text;
      } else {
        conversationHistory.push({ role, parts: [{ text }] });
      }
    }

    while (conversationHistory.length > 0 && conversationHistory[0].role === "model") {
      conversationHistory.shift();
    }

    const tagPrompt = matchedRules
      .filter((rule) => rule.mode === "prompt_append" && rule.prompt)
      .map((rule) => `Tag ${rule.tag}: ${rule.prompt}`)
      .join("\n");

    const structuredPrompt = buildStructuredPrompt(settings.prompt_config as AgentPromptConfig | undefined);
    const basePrompt =
      structuredPrompt ||
      stripStoredPromptConfig(settings.system_prompt) ||
      "Voce e um assistente de atendimento. Seja util, educado e objetivo.";

    const contextInstruction =
      "IMPORTANTE: Analise cuidadosamente o historico da conversa. NUNCA repita mensagens, saudacoes, perguntas ou informacoes que voce ou o usuario ja enviaram anteriormente. De continuidade a conversa de forma natural, lembrando-se de tudo que ja foi dito.";

    const systemPrompt = `${basePrompt}\n\n${contextInstruction}${tagPrompt ? `\n\nRegras por tag:\n${tagPrompt}` : ""}`.trim();

    const model = settings.model || "gemini-2.5-flash";
    const geminiUrl = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${geminiApiKey}`;

    const currentMsg = effectiveUserMessage;
    const lastHistory = conversationHistory[conversationHistory.length - 1];
    if (lastHistory && lastHistory.role === "user") {
      lastHistory.parts[0].text += "\n" + currentMsg;
    } else {
      conversationHistory.push({ role: "user", parts: [{ text: currentMsg }] });
    }

    const trimmedConversationHistory = trimConversationHistory(conversationHistory, MAX_HISTORY_CHARS);

    const geminiPayload = {
      system_instruction: {
        parts: [{ text: `${systemPrompt}\n\nNome do cliente: ${contact_name}` }],
      },
      contents: trimmedConversationHistory,
      generationConfig: {
        temperature: settings.temperature || 0.7,
        maxOutputTokens: settings.max_tokens || 500,
        topP: 0.95,
      },
    };

    await logJobEvent(job || {
      id: crypto.randomUUID(),
      workspace_id,
      conversation_id,
      contact_id: null,
      contact_name,
      latest_message: message,
      message_id: message_id || null,
      batch_started_at: null,
      status: "processing",
      attempt_count: 0,
      max_attempts: 0,
    }, "info", "gemini_request_started", "Chamando Gemini para gerar resposta.", { model });

    if (message_id) {
      await fetch(SEND_FUNCTION_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id,
          to: (conversation.contacts as Record<string, unknown>)?.phone as string,
          type: "typing",
          message_id,
        }),
      });
    }

    let geminiResponse: Response | null = null;
    let geminiResult: unknown = {};
    let lastGeminiError: { status: number; result: unknown } | null = null;

    for (let attempt = 0; attempt <= GEMINI_INLINE_RETRIES; attempt += 1) {
      geminiResponse = await fetch(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload),
      });

      geminiResult = await geminiResponse.json().catch(() => ({}));

      if (geminiResponse.ok) {
        break;
      }

      lastGeminiError = { status: geminiResponse.status, result: geminiResult };
      const isRetryableGeminiError = geminiResponse.status === 429 || geminiResponse.status >= 500;
      const hasMoreAttempts = attempt < GEMINI_INLINE_RETRIES;

      if (!isRetryableGeminiError || !hasMoreAttempts) {
        break;
      }

      await wait(1200 * (attempt + 1));
    }

    if (!geminiResponse?.ok) {
      console.error("Gemini API error:", JSON.stringify(geminiResult));
      return handleFailure(
        job,
        conversation,
        settings.fallback_message,
        "gemini_http_error",
        "Gemini retornou erro HTTP.",
        lastGeminiError || { status: 500, result: geminiResult }
      );
    }

    const aiResponse = ((geminiResult as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts || [])
      .map((part) => part.text || "")
      .join("")
      .trim();

    if (!aiResponse) {
      return handleFailure(
        job,
        conversation,
        settings.fallback_message,
        "gemini_empty_response",
        "Gemini nao retornou texto utilizavel.",
        { result: geminiResult }
      );
    }

    const latestPendingBeforeSend = await getCurrentPendingMessageId(conversation_id);
    if (message_id && latestPendingBeforeSend && message_id !== latestPendingBeforeSend) {
      await markJobCancelled(job, "superseded_before_send", {
        latest_pending_message_id: latestPendingBeforeSend,
        job_message_id: message_id,
      });
      return jsonResponse({ handled: false, reason: "Superseded before send" });
    }

    if (responseDelaySeconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, responseDelaySeconds * 1000));
    }

    const contactPhone = (conversation.contacts as Record<string, unknown>)?.phone as string;
    const chunks = splitResponseIntoChunks(aiResponse);
    let sentAnyChunk = false;

    for (const chunk of chunks) {
      const sendResponse = await fetch(SEND_FUNCTION_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id,
          to: contactPhone,
          type: "text",
          content: chunk,
          conversation_id,
        }),
      });

      const sendResult = await sendResponse.json().catch(() => ({}));
      if (!sendResponse.ok || (sendResult as { error?: string }).error) {
        if (sentAnyChunk) {
          return sendFallbackAndMark(
            job,
            conversation,
            settings.fallback_message,
            "partial_send_failure",
            "Envio parcial da resposta falhou apos alguns chunks.",
            { failed_chunk: chunk, send_result: sendResult }
          );
        }

        return handleFailure(
          job,
          conversation,
          settings.fallback_message,
          "whatsapp_send_failed",
          "Falha ao enviar resposta pelo WhatsApp.",
          { send_result: sendResult }
        );
      }

      sentAnyChunk = true;
      const { data: msgs } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation_id)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(1);

      if (msgs?.[0]) {
        await supabase
          .from("messages")
          .update({ is_from_ai: true })
          .eq("id", msgs[0].id);
      }

      if (chunks.length > 1 && messageGapSeconds > 0) {
        await new Promise((resolve) => setTimeout(resolve, messageGapSeconds * 1000));
      }
    }

    await markJobCompleted(job, aiResponse);
    console.log(`AI response sent for conversation ${conversation_id}`);
    return jsonResponse({ handled: true, response: aiResponse });
  } catch (error) {
    console.error("AI Agent error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
