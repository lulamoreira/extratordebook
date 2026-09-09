import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você analisa páginas de um book de campanha de PDV lado a lado com a planilha de produção final que o cliente escreveu à mão, e extrai o aprendizado.

Para cada linha recebida, compare o que a página do book mostra com a especificação final do cliente e, quando existir, com a especificação que a IA havia gerado.

Produza dois resultados:

1. exemplos — a peça e a especificação final do cliente, normalizadas, para servir de referência futura.

2. regras — lições GERAIS e reaproveitáveis em outros books, nunca específicas de uma peça só. Cada regra deve ser uma frase imperativa e verificável.

   - alvo 'extracao': quando a lição for sobre O QUE PRECISA SER LIDO DO BOOK que estava sendo perdido (ex.: 'Sempre capturar a indicação de retroiluminação e o tipo de luz indicado na página').

   - alvo 'redacao': quando for sobre COMO ESCREVER a frase (ex.: 'Escrever sempre a espessura logo após o material, separada por vírgula').

   - alvo 'ambos': quando valer para os dois.

Não invente regras a partir de uma única ocorrência irrelevante nem repita regras óbvias já evidentes. Prefira poucas regras fortes a muitas fracas: no máximo 5 regras por lote.

Se a página não sustentar nenhuma conclusão, devolva regras vazias.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, paginas, linhas } = await req.json();

    if (!pdfBase64 || !Array.isArray(linhas) || linhas.length === 0) {
      return new Response(JSON.stringify({ error: "pdfBase64 e linhas são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`learn-from-book: ${linhas.length} linhas, páginas ${JSON.stringify(paginas)}`);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Este PDF contém as páginas ${JSON.stringify(paginas)} do book (na ordem em que aparecem no arquivo).\n\nLinhas da planilha final escrita pelo cliente para essas páginas:\n\n${JSON.stringify(linhas)}`,
              },
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${pdfBase64}` },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "learn",
              description: "Retorna exemplos e regras aprendidas do book + planilha final",
              parameters: {
                type: "object",
                properties: {
                  exemplos: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        pagBook: { type: "number" },
                        item: { type: "string" },
                        nome: { type: "string" },
                        grupo: { type: "string" },
                        formato: { type: "string" },
                        especificacaoFinal: { type: "string" },
                      },
                      required: ["pagBook", "item", "nome", "grupo", "formato", "especificacaoFinal"],
                      additionalProperties: false,
                    },
                  },
                  regras: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        texto: { type: "string" },
                        alvo: { type: "string", enum: ["extracao", "redacao", "ambos"] },
                      },
                      required: ["texto", "alvo"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["exemplos", "regras"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "learn" } },
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
      return new Response(JSON.stringify({ error: "Erro ao analisar o book com IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(
        JSON.stringify({ exemplos: result.exemplos ?? [], regras: result.regras ?? [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Não foi possível extrair aprendizado deste lote" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("learn-from-book error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
