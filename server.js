import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Token padrão usado para todas as interações caso não seja multiplas sessoes
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "zapflow_97d1kb78"; // Must match what's configured in Meta Dashboard

// Função para processar status da Meta
async function handleStatusUpdate(supabase, status) {
  const wamid = String(status.id);
  const statusValue = String(status.status);

  const statusMap = {
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
  const updateData = { status: mappedStatus };
  if (mappedStatus === "delivered") updateData.delivered_at = new Date().toISOString();
  if (mappedStatus === "read") updateData.read_at = new Date().toISOString();
  if (mappedStatus === "failed") updateData.error_details = status.errors;

  await supabase
    .from("campaign_logs")
    .update(updateData)
    .eq("wamid", wamid);

  console.log(`📊 Status updated: ${wamid} → ${mappedStatus}`);
}

// Função para processar novas mensagens Inbound
async function handleIncomingMessage(supabase, waAccount, msg, contactInfo) {
  const phone = String(msg.from);
  const contactName = contactInfo?.profile?.name ? String(contactInfo.profile.name) : null;

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
      content = String(msg.text?.body || "");
      break;
    case "image":
      content = String(msg.image?.caption || "");
      mediaType = "image";
      break;
    case "audio":
      mediaType = "audio";
      break;
    case "video":
      content = String(msg.video?.caption || "");
      mediaType = "video";
      break;
    case "document":
      content = String(msg.document?.filename || "Documento");
      mediaType = "document";
      break;
    case "sticker":
      mediaType = "sticker";
      break;
    case "location":
      content = `📍 ${msg.location?.latitude}, ${msg.location?.longitude}`;
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

// -------------------------------------------------------------
// ROTA 1: Meta Webhook GET (Validação do Token do App)
// -------------------------------------------------------------
app.get('/api/whatsapp-webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
    console.log("Webhook verified successfully");
    return res.status(200).type('text/plain').send(challenge);
  }

  console.warn("Webhook verification failed");
  res.status(403).send('Forbidden');
});

// -------------------------------------------------------------
// ROTA 2: Meta Webhook POST (Recepção das Mensagens)
// -------------------------------------------------------------
app.post('/api/whatsapp-webhook', async (req, res) => {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error("Missing Supabase credentials in Server");
      return res.status(200).send('EVENT_RECEIVED'); // Não retorne 500 para a Meta senão ela reenvia eternamente.
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = req.body;
    console.log("📩 Webhook received:", JSON.stringify(body).substring(0, 300));
    
    const entry = body?.entry?.[0];
    if (!entry) return res.status(200).send('OK');

    const changes = entry.changes?.[0];
    if (!changes) return res.status(200).send('OK');

    const value = changes.value;
    const phoneNumberId = value?.metadata?.phone_number_id;

    if (!phoneNumberId) return res.status(200).send('OK');

    // Identifica o workspace do cliente
    const { data: waAccount } = await supabase
      .from("whatsapp_accounts")
      .select("id, workspace_id")
      .eq("phone_number_id", phoneNumberId)
      .single();

    if (!waAccount) {
      console.warn("⚠️ No WhatsApp account found for phone_number_id:", phoneNumberId);
      return res.status(200).send('OK');
    }

    // Handle messages
    if (value.messages) {
      for (const msg of value.messages) {
         await handleIncomingMessage(supabase, waAccount, msg, value.contacts?.[0]);
      }
    }

    // Handle statuses
    if (value.statuses) {
      for (const status of value.statuses) {
         await handleStatusUpdate(supabase, status);
      }
    }

    res.status(200).send('EVENT_RECEIVED');

  } catch (error) {
    console.error("❌ Webhook POST error:", error);
    res.status(200).send('OK');
  }
});

// -------------------------------------------------------------
// ROTA 3: Fron-End Vite (Produção)
// Serve a pasta de build da aplicação React na raiz do domínio
// -------------------------------------------------------------
app.use(express.static(path.join(__dirname, 'dist')));

// Roteamento fallback do React (Páginas do SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Inicialização do Servidor
app.listen(port, () => {
  console.log(`✅ ZapFlow Backend & FrontEnd Running on port ${port}`);
  console.log(`🌐 Webhook is available at /api/whatsapp-webhook`);
});
