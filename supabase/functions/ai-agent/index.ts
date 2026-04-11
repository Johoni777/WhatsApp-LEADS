// supabase/functions/ai-agent/index.ts
// AI Agent using Google Gemini API for automated responses

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

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
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body: AgentRequest = await req.json();
    const { workspace_id, conversation_id, message, contact_name } = body;

    // Get agent settings
    const { data: settings } = await supabase
      .from("agent_settings")
      .select("*")
      .eq("workspace_id", workspace_id)
      .single();

    if (!settings || !settings.is_active) {
      return jsonResponse({ handled: false, reason: "Agent disabled" });
    }

    // Get conversation context (last 10 messages)
    const { data: history } = await supabase
      .from("messages")
      .select("direction, content, type, created_at")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const conversationHistory = (history || [])
      .reverse()
      .map((msg) => ({
        role: msg.direction === "inbound" ? "user" : "model",
        parts: [{ text: msg.content || `[${msg.type}]` }],
      }));

    // Build system prompt
    const systemPrompt = settings.system_prompt || 
      "Você é um assistente de atendimento. Seja útil, educado e objetivo.";

    // Get conversation phone for sending response
    const { data: conversation } = await supabase
      .from("conversations")
      .select("contact_id, contacts(phone)")
      .eq("id", conversation_id)
      .single();

    if (!conversation) {
      return jsonResponse({ handled: false, reason: "Conversation not found" });
    }

    // Call Gemini API
    const model = settings.model || "gemini-2.0-flash";
    const geminiUrl = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiPayload = {
      system_instruction: {
        parts: [{ text: `${systemPrompt}\n\nNome do cliente: ${contact_name}` }],
      },
      contents: [
        ...conversationHistory,
        {
          role: "user",
          parts: [{ text: message }],
        },
      ],
      generationConfig: {
        temperature: settings.temperature || 0.7,
        maxOutputTokens: settings.max_tokens || 500,
        topP: 0.95,
      },
    };

    console.log(`🤖 Calling Gemini (${model}) for conversation ${conversation_id}`);

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload),
    });

    if (!geminiResponse.ok) {
      const error = await geminiResponse.json();
      console.error("❌ Gemini API error:", JSON.stringify(error));
      
      // Send fallback message
      await sendFallback(workspace_id, conversation_id, conversation, settings.fallback_message);
      return jsonResponse({ handled: true, fallback: true });
    }

    const geminiResult = await geminiResponse.json();
    const aiResponse = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
      await sendFallback(workspace_id, conversation_id, conversation, settings.fallback_message);
      return jsonResponse({ handled: true, fallback: true });
    }

    // Send AI response via WhatsApp
    const contactPhone = (conversation.contacts as Record<string, unknown>)?.phone as string;
    
    const sendResponse = await fetch(SEND_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspace_id,
        to: contactPhone,
        type: "text",
        content: aiResponse,
        conversation_id,
      }),
    });

    if (sendResponse.ok) {
      // Mark message as from AI
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
    }

    console.log(`✅ AI response sent for conversation ${conversation_id}`);
    return jsonResponse({ handled: true, response: aiResponse });
  } catch (error) {
    console.error("❌ AI Agent error:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

async function sendFallback(
  workspaceId: string,
  conversationId: string,
  conversation: Record<string, unknown>,
  fallbackMessage: string
) {
  const contactPhone = (conversation.contacts as Record<string, unknown>)?.phone as string;
  
  await fetch(SEND_FUNCTION_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workspace_id: workspaceId,
      to: contactPhone,
      type: "text",
      content: fallbackMessage || "Um atendente irá te responder em breve.",
      conversation_id: conversationId,
    }),
  });

  // Disable AI for this conversation (escalate to human)
  await supabase
    .from("conversations")
    .update({ is_ai_active: false })
    .eq("id", conversationId);
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
