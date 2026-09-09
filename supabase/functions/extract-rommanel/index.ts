import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Você extrai peças gráficas de books de campanha de PDV da ROMMANEL (joias e semijoias) para uma planilha de produção.

ESTRUTURA DO BOOK:
- Cada página de peça traz, no topo, o nome do arquivo da arte (ex: ROMMANEL_HERANCAS_TDS_PANCARTA_CURADORIA_12x21cm.pdf). Esse é o codigoArquivo. Ele frequentemente contém o tamanho no final.
- As cotas em CM desenhadas na arte (setas rosa) dão o tamanho real. Elas mandam mais que o nome do arquivo.
- Um marcador "VERSO" na página significa impressão frente e verso: cores = "4x4". Sem VERSO, cores = "4x0". Adesivos com "CALÇO" seguem a regra do calço, não do verso.
- O rodapé traz as legendas fixas "Código de cores", "Montagem", "Notas", "Faca", "Dobra". Nunca trate essas palavras como peça.
- Os bullets em Notas (ex: "• Adesivo transparente", "• Considerar calço 100%", "• Letra caixa com 0,5cm de espessura", "PANTONE 4029C") são a matéria-prima da especificação.

PÁGINAS DE CAPA DE SEÇÃO:
Algumas páginas contêm apenas um título grande e nada mais (ex: "TODAS AS LOJAS", "VITRINE", "REVESTIMENTOS", "AQUÁRIO", "ARMÁRIO", "QUIOSQUE", "CARTAZETE"). Elas NÃO são peças: elas definem o localInstalacao de todas as páginas seguintes, até a próxima capa. Nunca gere uma peça a partir de uma capa. Também ignore a capa geral do book e a contracapa final.

KITS E PLANIFICAÇÕES (o ponto mais importante):

REGRA PADRÃO — EXPANDIR (vale para praticamente todos os kits):

Um kit gera UMA LINHA POR PEÇA. Isto é o comportamento padrão e deve ser seguido sempre que a exceção abaixo não se aplicar.

- Planificação de revestimento: cada recorte cotado separadamente vira uma linha, nomeada pela posição. Uma planificação com 5 recortes gera 5 linhas — nunca 1. Ex: REVESTIMENTO SUPERIOR P (60X15), REVESTIMENTO LATERAL ESQUERDA P (15X40), REVESTIMENTO LATERAL DIREITA P (15X40), REVESTIMENTO INFERIOR P (60X15), REVESTIMENTO TOPO P (60X40).
- Revestimento de armário: gera 4 linhas (superior, esquerdo, direito, inferior).
- Conjunto de peças de tamanhos diferentes da mesma família (cubos P, M e G): uma linha por tamanho.
- Placa com letras caixa: uma linha para a placa e uma para cada letra caixa.
- Display com pancarta e adesivo: uma linha para cada.

Em todos esses casos, só a PRIMEIRA linha do kit recebe unidadeCompra=true, nomeColunaVarejo e a especificação completa. As demais ficam com unidadeCompra=false, nomeColunaVarejo vazio e especificacao vazia.

A UNIDADE DE COMPRA É SEMPRE A PRIMEIRA LINHA DO KIT — regra sem exceção:

unidadeCompra=true vai OBRIGATORIAMENTE na primeira linha que você gerar para aquele kit, nunca na última nem no meio. A primeira linha do kit é a peça principal, a que dá nome ao kit: o painel, a placa de fundo, o revestimento superior, o cubo P. Ordene as linhas do kit de modo que essa peça principal venha primeiro. Antes de responder, confira kit por kit: a linha marcada como unidade de compra é a primeira do grupo?

EXCEÇÃO ÚNICA — EMPILHAR (uma linha só):

Aplica-se EXCLUSIVAMENTE a kits formados por um PAINEL DE BANNER mais os seus APLIQUES. Nenhum outro caso.

Nesses kits, nomePeca, paginas e tamanho recebem os valores empilhados por quebra de linha, na ordem painel primeiro e apliques depois, e a linha inteira é uma única unidade de compra.

Se o kit não tiver um painel de banner com apliques, a exceção NÃO se aplica — use a regra padrão de expandir.

VERIFICAÇÃO OBRIGATÓRIA antes de responder:

Percorra as páginas desta parte e confirme, uma a uma: toda página que mostra uma planificação com N recortes cotados gerou N linhas? Todo conjunto com N peças distintas gerou N linhas? Se alguma gerou menos, corrija antes de responder. Colapsar um kit que não seja painel+apliques é erro.

nomeColunaVarejo: nome CURTO e em MAIÚSCULAS que identifica a unidade de compra na planilha de lojas. Exemplos reais deste cliente: "PANCARTA CURADORIA", "KIT PANCARTA FOTO", "ADESIVO QR CODE", "MÓBILE", "EXPOSITOR FERRADURA", "KIT CUBOS", "ADESIVO PISO", "KIT PLACA ESPAÇO AC", "CHAPÉU", "KIT BANNER PRIMÁRIO", "REVESTIMENTO P", "TOPO DE MESA P", "TOPO DE MESA P LOGO", "BACKLIGHT GG", "CARTAZETE".

O NOME DA COLUNA VAREJO É ÚNICO NO BOOK INTEIRO:

Duas unidades de compra NUNCA podem receber o mesmo nomeColunaVarejo — na planilha isso viraria coluna duplicada.

Ao encurtar o nome, PRESERVE o termo que diferencia a peça das suas irmãs. Esse termo quase sempre está no nome do arquivo impresso na página. Exemplos reais deste cliente, todos distintos entre si:
  BACKLIGHT PP, BACKLIGHT P, BACKLIGHT M, BACKLIGHT G, BACKLIGHT GG, BACKLIGHT PARTAGE, BACKLIGHT ESPECIAL, BACKLIGHT JEQUITIBÁ, BACKLIGHT CARIRI
  CARTAZETE, CARTAZETE CONCEITO NOVO, CARTAZETE MORUMBI
  TOPO DE MESA P, TOPO DE MESA M, TOPO DE MESA G, TOPO DE MESA ANALIA, e as versões LOGO de cada um

Nunca colapse "CARTAZETE CONCEITO NOVO" em "CARTAZETE", nem "BACKLIGHT PARTAGE" em "BACKLIGHT GG". Se duas peças ficariam com o mesmo nome, acrescente o diferenciador (tamanho, praça, versão) até ficarem distintas.

Antes de responder, liste mentalmente todos os nomeColunaVarejo desta parte e confirme que não há dois iguais.

ESPECIFICAÇÃO — vocabulário obrigatório da Rommanel.
Escreva uma frase técnica de produção usando o vocabulário abaixo, que são as frases reais aprovadas por este cliente. Escolha e adapte a mais próxima; nunca invente material fora desta lista sem que o book diga explicitamente:
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
  "CHÁPEU CENOGRÁFICO"

Para kits de banner com aplique, a especificação usa duas linhas rotuladas, no formato real do cliente:
  "PAINEL: Impressão 4x4, em PS Tricamada 2mm, corte especial, com furos de 5mm e kit de fixação aéreo com cordão tipo São Franciso de 4mm marron. Verniz relevo texturizado localizado

APLIQUES: Impressão 4x4, em PS Tricamada 2mm, corte especial, com espaçador com dupla face no verso. Verniz relevo brilhante localizado."

CONTINUIDADE ENTRE PARTES:
Você recebe apenas um trecho do book. A mensagem informa qual é a seção corrente e se há um kit aberto vindo da parte anterior. Use esses valores para as primeiras páginas e só mude a seção ao encontrar uma nova capa. Ao final, devolva secaoFinal e kitFinal com o estado da última página.

Responda apenas pelo tool call, sem texto adicional.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { pdfBase64, fileName, secaoCorrente, kitAberto, rules } = await req.json();

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

    console.log(
      `Rommanel: ${fileName || "unknown"}, size: ${pdfBase64.length} chars, secao: ${secaoCorrente || "nenhuma"}, kit: ${kitAberto || "nenhum"}`
    );

    const ruleList: string[] = Array.isArray(rules)
      ? rules.map((r: unknown) => String(r ?? "").trim()).filter(Boolean)
      : [];

    const estado = `Seção corrente no início desta parte: ${secaoCorrente ? String(secaoCorrente) : "nenhuma"}. Kit aberto: ${kitAberto ? String(kitAberto) : "nenhum"}.`;
    const bloco =
      ruleList.length > 0
        ? `REGRAS DE LEITURA DEFINIDAS PELO CLIENTE (siga à risca):\n${ruleList.join("\n")}\n\n${estado}`
        : estado;
    const userText = `${bloco}\n\nAnalise este trecho do book da Rommanel e extraia todas as peças gráficas. Arquivo: ${fileName || "book.pdf"}`;

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
              { type: "text", text: userText },
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
              name: "extract_rommanel_pieces",
              description: "Retorna as peças da Rommanel extraídas deste trecho do book",
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
                        paginas: {
                          type: "string",
                          description:
                            "Páginas empilhadas com \\n na mesma ordem de nomePeca/tamanho (kits de banner), relativas a este arquivo começando em 1. Peças normais: mesmo valor de paginaNoArquivo.",
                        },
                        localInstalacao: {
                          type: "string",
                          description: "Local de instalação definido pela capa de seção vigente",
                        },
                        kit: { type: "string", description: "Nome do kit; vazio quando peça avulsa" },
                        nomePeca: { type: "string", description: "Nome da peça" },
                        tamanho: { type: "string", description: "Tamanho pelas cotas em cm" },
                        especificacao: {
                          type: "string",
                          description: "Especificação técnica; vazia nas linhas-filhas de kit",
                        },
                        codigoArquivo: {
                          type: "string",
                          description: "Nome do arquivo da arte impresso na página",
                        },
                        unidadeCompra: {
                          type: "boolean",
                          description: "true na peça avulsa e na primeira linha de cada kit",
                        },
                        nomeColunaVarejo: {
                          type: "string",
                          description: "Nome curto em maiúsculas; só quando unidadeCompra=true",
                        },
                        cores: { type: "string", description: "4x4 ou 4x0" },
                      },
                      required: [
                        "paginaNoArquivo",
                        "paginas",
                        "localInstalacao",
                        "kit",
                        "nomePeca",
                        "tamanho",
                        "especificacao",
                        "codigoArquivo",
                        "unidadeCompra",
                        "nomeColunaVarejo",
                        "cores",
                      ],
                      additionalProperties: false,
                    },
                  },
                  secaoFinal: {
                    type: "string",
                    description: "Seção vigente ao terminar a última página desta parte",
                  },
                  kitFinal: {
                    type: "string",
                    description: "Kit ainda aberto ao terminar a última página desta parte; vazio se nenhum",
                  },
                },
                required: ["pieces", "secaoFinal", "kitFinal"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_rommanel_pieces" } },
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
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const result = JSON.parse(toolCall.function.arguments);
      return new Response(
        JSON.stringify({
          pieces: Array.isArray(result.pieces) ? result.pieces : [],
          secaoFinal: String(result.secaoFinal ?? secaoCorrente ?? ""),
          kitFinal: String(result.kitFinal ?? ""),
          fileName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Não foi possível extrair dados do PDF" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("extract-rommanel error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
