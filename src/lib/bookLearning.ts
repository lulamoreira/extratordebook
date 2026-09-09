import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";
import { bytesToBase64 } from "@/lib/base64";
import type { NaturaRow } from "@/lib/naturaSheet";
import {
  chaveDaPeca,
  chaveDaRegra,
  lerPlanilhaNatura,
  normalizar,
  type Alvo,
  type AprendizadoItem,
} from "@/lib/specLearning";

const PAGES_PER_BATCH = 5;
const MAX_PARALLEL = 2;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface LinhaEnviada {
  pagBook: number;
  item: string;
  nome: string;
  grupo: string;
  formato: string;
  especificacaoFinal: string;
  especificacaoGerada: string | null;
}

interface RespostaLote {
  exemplos: {
    pagBook?: number;
    item?: string;
    nome?: string;
    grupo?: string;
    formato?: string;
    especificacaoFinal?: string;
  }[];
  regras: { texto?: string; alvo?: string }[];
}

export interface BookLearningResultado {
  itens: AprendizadoItem[];
  descartadas: number;
  lotesFalhos: number;
  totalLotes: number;
}

export interface BookLearningProgresso {
  /** 0–100 */
  percent: number;
  label: string;
}

const alvoValido = (alvo: unknown): Alvo =>
  alvo === "extracao" || alvo === "ambos" ? alvo : "redacao";

async function chamarLote(
  pdfBase64: string,
  paginas: number[],
  linhas: LinhaEnviada[]
): Promise<RespostaLote | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke("learn-from-book", {
        body: { pdfBase64, paginas, linhas },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return {
        exemplos: Array.isArray(data?.exemplos) ? data.exemplos : [],
        regras: Array.isArray(data?.regras) ? data.regras : [],
      };
    } catch (e) {
      console.error("learn-from-book lote falhou:", e);
      if (attempt < MAX_RETRIES) await delay(RETRY_DELAY_MS);
    }
  }
  return null;
}

/**
 * MODO B — compara a planilha final do cliente com as páginas do book,
 * aprendendo tanto exemplos de redação quanto regras de leitura.
 * Nunca aborta: lotes que falham em definitivo são pulados e contabilizados.
 */
export async function aprenderDoBook(
  planilha: File,
  pdf: File,
  naturaRowsSalvas: NaturaRow[],
  onProgress?: (p: BookLearningProgresso) => void
): Promise<BookLearningResultado> {
  const linhas = await lerPlanilhaNatura(planilha);
  const validas = linhas.filter((l) => Number(l.pagBook) > 0);
  const descartadas = linhas.length - validas.length;

  if (validas.length === 0) {
    throw new Error("Nenhuma linha da planilha tem número de página do book — não é possível comparar com o PDF.");
  }

  // Especificações geradas pelo app, para a IA comparar.
  const geradas = new Map<string, string>();
  for (const g of naturaRowsSalvas) {
    geradas.set(`${normalizar(g.item)}|${Number(g.pagBook) || 0}`, g.especificacaoPadrao ?? "");
  }

  // Agrupa por página e ordena.
  const porPagina = new Map<number, LinhaEnviada[]>();
  for (const l of validas) {
    const pag = Number(l.pagBook);
    const lista = porPagina.get(pag) ?? [];
    lista.push({
      pagBook: pag,
      item: l.item,
      nome: l.nome,
      grupo: l.grupo,
      formato: l.formato,
      especificacaoFinal: l.especificacao,
      especificacaoGerada: geradas.get(`${normalizar(l.item)}|${pag}`) ?? null,
    });
    porPagina.set(pag, lista);
  }
  const paginasOrdenadas = [...porPagina.keys()].sort((a, b) => a - b);

  const srcDoc = await PDFDocument.load(await pdf.arrayBuffer());
  const totalPdfPages = srcDoc.getPageCount();

  // Monta os lotes de 5 páginas.
  const lotes: { paginas: number[]; linhas: LinhaEnviada[] }[] = [];
  for (let i = 0; i < paginasOrdenadas.length; i += PAGES_PER_BATCH) {
    const paginas = paginasOrdenadas
      .slice(i, i + PAGES_PER_BATCH)
      .filter((p) => p >= 1 && p <= totalPdfPages);
    if (paginas.length === 0) continue;
    lotes.push({
      paginas,
      linhas: paginas.flatMap((p) => porPagina.get(p) ?? []),
    });
  }

  if (lotes.length === 0) {
    throw new Error("As páginas indicadas na planilha não existem neste PDF — confira se é o book certo.");
  }

  const itens: AprendizadoItem[] = [];
  const regrasVistas = new Set<string>();
  let lotesFalhos = 0;
  let concluidos = 0;
  const totalPaginas = paginasOrdenadas.length;

  const processar = async (lote: { paginas: number[]; linhas: LinhaEnviada[] }) => {
    const novoDoc = await PDFDocument.create();
    const copiadas = await novoDoc.copyPages(
      srcDoc,
      lote.paginas.map((p) => p - 1)
    );
    copiadas.forEach((page) => novoDoc.addPage(page));
    const bytes = await novoDoc.save({ useObjectStreams: true });

    const resposta = await chamarLote(bytesToBase64(new Uint8Array(bytes)), lote.paginas, lote.linhas);

    if (!resposta) {
      lotesFalhos++;
    } else {
      for (const ex of resposta.exemplos) {
        const especificacao = (ex.especificacaoFinal ?? "").trim();
        const item = (ex.item ?? "").trim();
        if (!especificacao || !item) continue;
        const pag = Number(ex.pagBook) || 0;
        itens.push({
          tipo: "exemplo",
          alvo: "redacao",
          chave: chaveDaPeca(item, ex.formato ?? ""),
          item,
          nome: (ex.nome ?? "").trim(),
          grupo: (ex.grupo ?? "").trim(),
          arquivo: "",
          formato: (ex.formato ?? "").trim(),
          pagBook: pag || null,
          especificacaoIa: geradas.get(`${normalizar(item)}|${pag}`) ?? null,
          especificacaoCorreta: especificacao,
          origem: "comparacao_book",
        });
      }
      for (const regra of resposta.regras) {
        const texto = (regra.texto ?? "").trim();
        if (!texto) continue;
        const chave = chaveDaRegra(texto);
        if (regrasVistas.has(chave)) continue;
        regrasVistas.add(chave);
        itens.push({
          tipo: "regra",
          alvo: alvoValido(regra.alvo),
          chave,
          item: "",
          nome: "",
          grupo: "",
          arquivo: "",
          formato: "",
          pagBook: null,
          especificacaoIa: null,
          especificacaoCorreta: texto,
          origem: "comparacao_book",
        });
      }
    }

    concluidos += lote.paginas.length;
    const primeira = lote.paginas[0];
    const ultima = lote.paginas[lote.paginas.length - 1];
    onProgress?.({
      percent: Math.round((concluidos / totalPaginas) * 100),
      label: `Analisando páginas ${primeira}–${ultima} de ${paginasOrdenadas[paginasOrdenadas.length - 1]}...`,
    });
  };

  for (let i = 0; i < lotes.length; i += MAX_PARALLEL) {
    await Promise.all(lotes.slice(i, i + MAX_PARALLEL).map(processar));
  }

  return { itens, descartadas, lotesFalhos, totalLotes: lotes.length };
}
