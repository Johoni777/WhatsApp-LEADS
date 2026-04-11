// supabase/functions/google-sheets-sync/index.ts
// Lê contatos direto do CSV/API pública de uma Google Spreadsheet sem OAuth complexo.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { spreadsheet_id } = await req.json();

    if (!spreadsheet_id) {
      return new Response(JSON.stringify({ error: "spreadsheet_id missing" }), { 
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Usando tq endpoint do google sheets (gviz) para buscar csv de planilhas publicas!
    // Muito mais rápido e sem oauth para o usuário.
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheet_id}/gviz/tq?tqx=out:csv`;
    
    const response = await fetch(url);

    if (!response.ok) {
       return new Response(JSON.stringify({ error: "Planilha não encontrada. Verifique se o Acesso está Público (Qualquer um com o link)." }), { status: 400, headers: corsHeaders });
    }

    const csvText = await response.text();
    
    // Manual CSV Parsing 
    const lines = csvText.split('\n');
    if (lines.length < 2) {
       return new Response(JSON.stringify({ error: "Planilha vazia" }), { status: 200, headers: corsHeaders });
    }

    // clean quotes
    const cleanRow = (rowStr: string) => {
       return rowStr.split(',').map(s => {
           let val = s.trim();
           if(val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
           return val;
       });
    };

    const headers = cleanRow(lines[0]);
    const nameIndex = headers.findIndex(h => h.toLowerCase().includes('nome'));
    const phoneIndex = headers.findIndex(h => h.toLowerCase().includes('telefone') || h.toLowerCase().includes('celular') || h.toLowerCase().includes('whatsapp'));

    if (phoneIndex === -1) {
       return new Response(JSON.stringify({ error: "Coluna Telefone não encontrada!" }), { status: 400, headers: corsHeaders });
    }

    const contacts = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const row = cleanRow(lines[i]);
        const phoneRaw = row[phoneIndex];
        if (!phoneRaw) continue;

        let cleanedPhone = phoneRaw.replace(/\D/g, "");
        if (cleanedPhone.length <= 11 && cleanedPhone.length >= 10) {
           cleanedPhone = "55" + cleanedPhone;
        } else if (cleanedPhone.length < 10) {
           continue; // Invalido
        }

        contacts.push({
           name: nameIndex !== -1 ? (row[nameIndex] || 'Indefinido') : 'Indefinido',
           phone: cleanedPhone,
           tags: ['sheets_import']
        });
    }

    return new Response(JSON.stringify({
      success: true,
      total_rows: contacts.length,
      contacts: contacts
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }});

  } catch (error) {
    console.error("Sheets Error:", error);
    return new Response(JSON.stringify({ error: "Erro Interno no Servidor: " + error.message }), { status: 500, headers: corsHeaders });
  }
});
