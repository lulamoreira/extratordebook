import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você padroniza planilhas de produção de PDV da Natura. Recebe peças extraídas de um book e devolve as linhas já no padrão da planilha oficial.

Para cada peça:

1. grupo — classifique a peça em UM destes, olhando a seção de origem:
   - "TODAS AS LOJAS": peças distribuídas a todas as lojas (pancartas, kit display, elevação, materiais TDS).
   - "VITRINE PRIMÁRIA": vitrines principais, fachadas primárias, painéis de vitrine high/standard.
   - "VITRINE SECUNDÁRIA": vitrines secundárias, fachadas secundárias.
   - "INTERNOS": materiais internos da loja (frames, gôndola/nicho, parede de destaques, ponta de mesa, pancartas internas, shelf).
   - "OUTROS": só quando realmente não der para enquadrar.

2. nome — a família/agrupamento da peça, em MAIÚSCULAS (ex: "PANCARTA", "KIT DISPLAY", "ELEVAÇÃO", "FRAME - TODO DIA VERÃO", "GÔNDOLA (NICHO)", "PONTA DE MESA FACES", "VITRINES ATH - Taboão - High"). Peças irmãs devem receber exatamente o mesmo nome, para poderem ser agrupadas.

3. item — o nome descritivo da peça individual, com inicial maiúscula (ex: "Pancarta Fragancias", "Aplique Sol", "Letra Caixa", "Painel Esquerdo/Direito").

4. arquivo — o código da peça, exatamente como veio, sem alterar.

5. pagBook — o número da página, exatamente como veio.

6. formato — as dimensões limpas, sem a palavra "cm" (ex: "7x16", "56,5x56,5", "2 peças de 60x135", "Base: 25x34.6\\nTesteira: 25x16,5"). Se o book indicar quantidade, use o padrão "N peças de AxB".

7. especificacaoPadrao — ESTA É A PARTE MAIS IMPORTANTE. Escreva UMA frase técnica de produção no padrão exato da Natura. Não repita a nota crua do book: converta-a. Regras:
   - Comece por "Impressão AxB, em <material> <espessura>, corte especial" quando a peça for impressa, onde AxB é o valor do campo "cores" da peça (4x4 = frente e verso, 4x0 = só frente).
   - Termine com o acabamento/fixação quando o book indicar.
   - Se a peça NÃO for impressa (letra caixa, elevação, MDF, acrílico estrutural), descreva só o material e o acabamento, sem "Impressão".
   - Use SEMPRE o vocabulário e a pontuação destas frases reais da planilha oficial, escolhendo e adaptando a mais próxima:
     "Impressão 4x0, em Papelão Excellent Rigido Serilon 1,5mm ou Papelão Paraná 1,5mm, corte especial."
     "Impressão 4x4, em Papelão Excellent Rigido Serilon 1,5mm ou Papelão Paraná 1,5mm, corte especial, com furos e kit de fixação aereo."
     "Impressão 4x4, em Papelão Excellent Rigido Serilon 1,5mm ou Papelão Paraná 1,5mm, corte especial, com vinco de 90° no verso, cantoneira no verso para manter angulagem da peça."
     "Impressão 4x4, em Papelão Excellent Rigido Serilon 1,5mm ou Papelão Paraná 1,5mm, corte especial, com pé americano no verso."
     "Impressão 4x0, em Papelão Excellent Rigido Serilon 1,5mm ou Papelão Paraná 1,5mm, corte especial, com fita dupla face no verso"
     "Impressão 0x5, em Acrilico Cristal 3mm, corte especial, com dobras conforme as areas indicadas no book."
     "Impressão 5x0 com calço de branco 40%, em PETG 2mm, corte especial, com marcação de letra caixa vide book, com fita dupla face no verso."
     "Impressão 5x4 com calço de branco 40%, em PETG 2mm, corte especial, com marcação de letra caixa vide book, com furos e kit de fixacão aereo."
     "Impressão 5x4 com calço de branco 100%, em PETG 2mm, corte especial, com marcação de letra caixa vide book, com furos e kit de fixacão aereo."
     "Impressão 5x4 com calço de branco 100%, em PETG 2mm, corte especial, com furos e kit de fixacão aereo."
     "XPS 10mm, corte especial, com pintura total na cor branca."
     "MDF 15mm, corte especial, com pintura total na cor indicada no book."
     "Acrilico Branco Leitoso 3cm, corte especial, com recorte na area indicada no book."
   - Regras de material por tipo de peça, quando o book não disser outra coisa: pancarta/painel/frame/parede de destaques/gôndola = Papelão Excellent Rigido Serilon 1,5mm ou Papelão Paraná 1,5mm; aplique = PETG 2mm com calço de branco; letra caixa = XPS 10mm com pintura; elevação = MDF 15mm ou Acrílico Branco Leitoso; kit display = Acrilico Cristal 3mm.
   - Se a nota do book já for uma frase completa nesse formato, mantenha-a como está.
   - Nunca deixe especificacaoPadrao vazia.

Devolva UMA linha por peça, NA MESMA ORDEM da entrada, sem inventar nem omitir peças.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pieces } = await req.json();

    if (!Array.isArray(pieces) || pieces.length === 0) {
      return new Response(JSON.stringify({ error: "pieces is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Formatting ${pieces.length} pieces`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Padronize estas ${pieces.length} peças (uma linha de saída por peça, mesma ordem):\n\n${JSON.stringify(pieces)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "format_rows",
              description: "Retorna as linhas padronizadas da planilha Natura",
              parameters: {
                type: "object",
                properties: {
                  rows: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        grupo: {
                          type: "string",
                          enum: [
                            "TODAS AS LOJAS",
                            "VITRINE PRIMÁRIA",
                            "VITRINE SECUNDÁRIA",
                            "INTERNOS",
                            "OUTROS",
                          ],
                        },
                        nome: { type: "string" },
                        item: { type: "string" },
                        arquivo: { type: "string" },
                        especificacaoPadrao: { type: "string" },
                        pagBook: { type: "number" },
                        formato: { type: "string" },
                      },
                      required: [
                        "grupo",
                        "nome",
                        "item",
                        "arquivo",
                        "especificacaoPadrao",
                        "pagBook",
                        "formato",
                      ],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["rows"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "format_rows" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos insuficientes. Adicione créditos ao seu workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erro ao padronizar especificações com IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify({ rows: result.rows }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Não foi possível padronizar as especificações" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("format-natura error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
