import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você é um especialista em extração de dados de books de campanha de PDV (ponto de venda) da Natura e outras marcas de cosméticos.

Seu trabalho é analisar páginas de PDFs de books de campanha e extrair TODAS as peças gráficas encontradas.

## Regras de extração:

Para CADA peça encontrada, extraia:

1. **paginaNoArquivo**: Posição da página DENTRO deste arquivo enviado, começando em 1. NÃO use o número impresso na página nem qualquer numeração do book original. Se a peça está na terceira página do arquivo enviado, o valor é 3.
2. **secao**: Nome da seção/área (ex: "VITRINES — TODAS AS LOJAS", "FACHADA PRIMÁRIA — BSH", "SECUNDÁRIA — RMR", "BACKLIGHT PRIMÁRIA", "SHELF STRIP", etc.)
3. **codigo**: Código identificador completo da peça (ex: "NAT_MAES_VIT_AUR_TDS_TESTEIRA_AURA_30x24cm")
4. **nomePeca**: Nome descritivo da peça (ex: "Testeira Aura", "BSH Painel", "Backlight M")
5. **tamanho**: Dimensões em centímetros extraídas do código ou da especificação (ex: "30x24", "120x180")
6. **especificacao**: Notas técnicas como material, acabamento, cores PANTONE, instruções de montagem, tipo de iluminação, etc. Se não houver, deixe vazio.
7. **cores**: 
   - Se a peça tem informação de VERSO (frente e verso impresso), coloque "4x4"
   - Se a peça NÃO tem verso (só frente), coloque "4x0"
   - Se não for possível determinar, coloque "4x0"

## Regras adicionais:
- ATENÇÃO: este arquivo é um FRAGMENTO de um book maior. O campo paginaNoArquivo deve ser SEMPRE relativo a este arquivo (1, 2, 3...), pois a numeração global é reconstruída depois.
- Extraia TODAS as peças, mesmo que pareçam variações (ex: Aplique 01, Aplique 02)
- Cada item separado do kit deve ser uma linha individual
- Ignore páginas de índice, sumário, ou que não contenham peças gráficas
- O código geralmente segue o padrão: MARCA_CAMPANHA_ÁREA_TIPO_PEÇA_TAMANHOcm
- Preste atenção em indicações como "NOVO", "Hot Stamping Dourado", cores PANTONE, tipos de iluminação
- Tamanhos podem estar no código (ex: _30x24cm) ou no texto da página

Responda APENAS com o JSON estruturado, sem texto adicional.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, fileName } = await req.json();

    if (!pdfBase64) {
      return new Response(
        JSON.stringify({ error: "PDF base64 content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`Processing PDF: ${fileName || "unknown"}, size: ${pdfBase64.length} chars`);

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
                text: `Analise este PDF de book de campanha e extraia todas as peças gráficas. Arquivo: ${fileName || "book.pdf"}`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_pieces",
              description: "Retorna a lista de peças extraídas do PDF",
              parameters: {
                type: "object",
                properties: {
                  pieces: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        paginaNoArquivo: {
                          type: "number",
                          description:
                            "Posição da página DENTRO deste arquivo enviado, começando em 1. Não use o número impresso na página.",
                        },
                        secao: { type: "string", description: "Nome da seção/área" },
                        codigo: { type: "string", description: "Código identificador completo" },
                        nomePeca: { type: "string", description: "Nome descritivo da peça" },
                        tamanho: { type: "string", description: "Dimensões em cm" },
                        especificacao: { type: "string", description: "Notas técnicas" },
                        cores: { type: "string", description: "4x4 ou 4x0" },
                      },
                      required: ["paginaNoArquivo", "secao", "codigo", "nomePeca", "tamanho", "cores"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["pieces"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_pieces" } },
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
      return new Response(
        JSON.stringify({ error: "Erro ao processar PDF com IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log("AI response received");

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(
        JSON.stringify({ pieces: result.pieces, fileName }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fallback: try to parse from content
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const pieces = JSON.parse(jsonMatch[0]);
          return new Response(
            JSON.stringify({ pieces, fileName }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch {
        // ignore parse error
      }
    }

    return new Response(
      JSON.stringify({ error: "Não foi possível extrair dados do PDF", raw: content }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("extract-pdf error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
