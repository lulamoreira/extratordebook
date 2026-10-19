import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Vocabulário de especificações por cliente. A Natura usa as frases do seu
 * padrão oficial; Montreal e Rommanel compartilham o vocabulário de materiais
 * aprovado da Rommanel. Cliente ausente ou desconhecido cai em "natura",
 * então nenhuma chamada antiga quebra.
 */
const VOCABULARIOS: Record<string, string> = {
  natura: `   - Use SEMPRE o vocabulário e a pontuação destas frases reais da planilha oficial, escolhendo e adaptando a mais próxima:
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
   - Regras de material por tipo de peça, quando o book não disser outra coisa: pancarta/painel/frame/parede de destaques/gôndola = Papelão Excellent Rigido Serilon 1,5mm ou Papelão Paraná 1,5mm; aplique = PETG 2mm com calço de branco; letra caixa = XPS 10mm com pintura; elevação = MDF 15mm ou Acrílico Branco Leitoso; kit display = Acrilico Cristal 3mm.`,
  rommanel: `   - Use SEMPRE o vocabulário e a pontuação destas frases reais aprovadas pelo cliente, escolhendo e adaptando a mais próxima; nunca invente material fora desta lista sem que o book diga explicitamente:
     "Impressão 4x0, em PS 1mm, corte especial, moldura de dupla face no verso."
     "Impressão 4x0, em PS 1mm, corte reto, moldura de dupla face no verso."
     "Impressão 4x4 em PS Tricamada 1,5mm, corte especial, com dobra 80°."
     "Impressão 4x4 em PS Tricamada 1,5mm, corte reto."
     "Impressão 4x4, em PS Tricamada 1,5mm, corte especial, com furos e kit de fixação com dois fixa texto e nylon."
     "Impressão 4x4, em PS Tricamada 1,5mm, corte especial, com dobra 80°. Pinos no verso para exposição da joia."
     "Impressão 4x0, em PS Tricamada 1,5mm, corte especial, com pé americano no verso."
     "Impressão 4x0, em PS Tricamada 2mm, corte reto"
     "Impressão 4x0, em PS Tricamada 1mm, corte reto, 4 pontos de dupla face no verso."
     "Impressão 4x0, em PS 0,5mm, corte reto, 4 pontos de dupla face no verso."
     "Impressão 4x0, em Backfilm, corte reto."
     "Impressão 5x0 com calço de branco 100%, Adesivo Transparente, corte reto."
     "Impressão 5x0 com calço de branco 100%, Adesivo Transparente de Piso, com laminação pisomax, corte reto."
     "Impressão 0x5 com calço branco 100%, Adesivo Eletrostático Transparente, corte especial."
     "MDF 20mm adesivado simulando madeira ref: Imprimax Decorax Gold Madeira Imbuia MI 102, corte reto."
     "MDF 20mm adesivado simulando madeira ref: Imprimax Decorax Gold Madeira Imbuia MI 102, corte especial (com rasgo na area indicada no book)."
     "MDF 40mm adesivado simulando madeira ref: Imprimax Decorax Gold Madeira Imbuia MI 102, corte reto."
     "MDF 60mm adesivado simulando madeira ref: Imprimax Decorax Gold Madeira Imbuia MI 102, corte reto."
     "XPS 5mm, corte especial, com pintura total na cor indicada no book"
     "XPS 5mm, corte especial, com pintura nas laterais na cor indicada no book, PVC 0,3mm impresso 4x0, corte especial, colado pela frente."
   - Regras de material por tipo de peça, quando o book não disser outra coisa: pancarta/cartazete/topo de mesa = PS 1mm ou PS 0,5mm com dupla face no verso; painel/kit banner = PS Tricamada 1,5mm ou 2mm; backlight = Backfilm; adesivo de vitrine = Adesivo Transparente ou Eletrostático com calço de branco 100%; adesivo de piso = Adesivo Transparente de Piso com laminação pisomax; mobiliário/base = MDF adesivado ref Imprimax Decorax Gold Madeira Imbuia MI 102 (20/40/60mm); letra caixa/elemento volumétrico = XPS 5mm com pintura.`,
};

const montarSystemPrompt = (cliente: unknown): string => {
  const chave = cliente === "rommanel" || cliente === "montreal" ? "rommanel" : "natura";
  return SYSTEM_PROMPT.replace("__VOCABULARIO__", VOCABULARIOS[chave]);
};

const SYSTEM_PROMPT = `Você padroniza planilhas de produção de PDV. Recebe peças extraídas de um book e devolve as linhas já no padrão da planilha oficial do cliente.

Para cada peça:

1. grupo — classifique a peça em UM destes, olhando a seção de origem:
   - "TODAS AS LOJAS": peças distribuídas a todas as lojas (pancartas, kit display, elevação, materiais TDS).
   - "VITRINE PRIMÁRIA": vitrines principais, fachadas primárias, painéis de vitrine high/standard.
   - "VITRINE SECUNDÁRIA": vitrines secundárias, fachadas secundárias.
   - "INTERNOS": materiais internos da loja (frames, gôndola/nicho, parede de destaques, ponta de mesa, pancartas internas, shelf).
   - "OUTROS": ÚLTIMO RECURSO ABSOLUTO. Praticamente nunca deve ser usado.

   REGRA DE CLASSIFICAÇÃO (obrigatória): toda peça DEVE ser classificada pelo contexto — a seção de origem,
   o tipo de peça e, principalmente, a VIZINHANÇA DE PÁGINAS. Peças em páginas próximas quase sempre
   pertencem ao mesmo grupo do book. Uma elevação, um aplique, uma pancarta, uma testeira ou qualquer peça
   "solta" HERDA o grupo das peças vizinhas por número de página — nunca vira "OUTROS".
   Só use "OUTROS" se não houver absolutamente nenhuma pista de contexto nem peça vizinha classificável.


2. nome — a família/agrupamento da peça, em MAIÚSCULAS (ex: "PANCARTA", "KIT DISPLAY", "ELEVAÇÃO", "FRAME - TODO DIA VERÃO", "GÔNDOLA (NICHO)", "PONTA DE MESA FACES", "VITRINES ATH - Taboão - High"). Peças irmãs devem receber exatamente o mesmo nome, para poderem ser agrupadas.

3. item — o nome descritivo da peça individual, com inicial maiúscula (ex: "Pancarta Fragancias", "Aplique Sol", "Letra Caixa", "Painel Esquerdo/Direito").

4. arquivo — o código da peça, exatamente como veio, sem alterar.

5. pagBook — o número da página, exatamente como veio.

6. formato — as dimensões limpas, sem a palavra "cm" (ex: "7x16", "56,5x56,5", "2 peças de 60x135", "Base: 25x34.6\\nTesteira: 25x16,5"). Se o book indicar quantidade, use o padrão "N peças de AxB".

7. especificacaoPadrao — ESTA É A PARTE MAIS IMPORTANTE. Escreva UMA frase técnica de produção no padrão exato da Natura. Não repita a nota crua do book: converta-a. Regras:
   - Comece por "Impressão AxB, em <material> <espessura>, corte especial" quando a peça for impressa, onde AxB é o valor do campo "cores" da peça (4x4 = frente e verso, 4x0 = só frente).
   - Termine com o acabamento/fixação quando o book indicar.
   - Se a peça NÃO for impressa (letra caixa, elevação, MDF, acrílico estrutural), descreva só o material e o acabamento, sem "Impressão".
__VOCABULARIO__
   - Se a nota do book já for uma frase completa nesse formato, mantenha-a como está.
   - Nunca deixe especificacaoPadrao vazia.

Devolva UMA linha por peça, NA MESMA ORDEM da entrada, sem inventar nem omitir peças.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pieces, examples, rules } = await req.json();

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

    // Aprendizado do cliente: regras e especificações aprovadas têm prioridade máxima.
    const ruleList: string[] = Array.isArray(rules)
      ? rules.map((r: unknown) => String(r ?? "").trim()).filter(Boolean)
      : [];
    const exampleList: Record<string, unknown>[] = Array.isArray(examples) ? examples : [];

    let learningBlock = "";
    if (ruleList.length > 0) {
      learningBlock += `REGRAS DE REDAÇÃO DEFINIDAS PELO CLIENTE (prioridade máxima):\n${ruleList.join("\n")}\n\n`;
    }
    if (exampleList.length > 0) {
      const lines = exampleList
        .map((e) => {
          const item = String(e.item ?? "").trim();
          const nome = String(e.nome ?? "").trim();
          const formato = String(e.formato ?? "").trim();
          const espec = String(e.especificacao ?? "").trim();
          if (!espec) return "";
          return `${item} | ${nome} | ${formato} -> ${espec}`;
        })
        .filter(Boolean);
      if (lines.length > 0) {
        learningBlock +=
          "ESPECIFICAÇÕES APROVADAS PELO CLIENTE (padrão obrigatório).\n" +
          "Estas frases foram escritas ou corrigidas pelo próprio cliente e têm prioridade sobre qualquer regra genérica.\n" +
          "Imite fielmente o vocabulário, a ordem das informações, a pontuação e o nível de detalhe.\n" +
          "Se uma peça nova for equivalente a alguma da lista, repita a mesma frase ajustando apenas o que for de fato diferente (medida, cor, acabamento).\n" +
          `${lines.join("\n")}\n\n`;
      }
    }

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
            content: `${learningBlock}Padronize estas ${pieces.length} peças (uma linha de saída por peça, mesma ordem):\n\n${JSON.stringify(pieces)}`,
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
