import { supabase } from "@/integrations/supabase/client";
import { splitPdf, paginaGlobal, type PdfPart } from "@/lib/pdfSplit";
import { carregarRegras } from "@/lib/specLearning";
import type { PartError } from "@/lib/historyStorage";
import type { RommanelPiece } from "@/data/rommanelPieces";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type PartStatus = "pending" | "processing" | "done" | "error";

export interface ProgressoRommanel {
  /** 0 a 100. */
  progress: number;
  partes: { name: string; status: PartStatus }[];
  mensagem?: string;
}

export interface ResultadoRommanel {
  pieces: RommanelPiece[];
  errors: PartError[];
  totalPages: number;
}

interface RespostaParte {
  pieces: RommanelPiece[];
  secaoFinal: string;
  kitFinal: string;
}

const texto = (v: unknown): string => (v == null ? "" : String(v));

async function processarParte(
  part: PdfPart,
  secaoCorrente: string,
  kitAberto: string,
  rules: string[]
): Promise<RespostaParte> {
  const { data, error } = await supabase.functions.invoke("extract-rommanel", {
    body: { pdfBase64: part.base64, fileName: part.name, secaoCorrente, kitAberto, rules },
  });

  if (error) throw new Error(error.message || "Erro ao processar PDF");
  if (!data || !Array.isArray(data.pieces)) {
    throw new Error(data?.error || "Nenhuma peça encontrada no PDF");
  }

  const pieces: RommanelPiece[] = data.pieces.map((p: Record<string, unknown>) => ({
    pagina: paginaGlobal(part, p.paginaNoArquivo ?? p.pagina),
    paginas: texto(p.paginas) || String(paginaGlobal(part, p.paginaNoArquivo ?? p.pagina)),
    localInstalacao: texto(p.localInstalacao) || secaoCorrente,
    kit: texto(p.kit),
    nomePeca: texto(p.nomePeca),
    tamanho: texto(p.tamanho),
    especificacao: texto(p.especificacao),
    codigoArquivo: texto(p.codigoArquivo),
    unidadeCompra: p.unidadeCompra === true,
    nomeColunaVarejo: p.unidadeCompra === true ? texto(p.nomeColunaVarejo) : "",
    cores: texto(p.cores) || "4x0",
  }));

  return {
    pieces,
    secaoFinal: texto(data.secaoFinal) || secaoCorrente,
    kitFinal: texto(data.kitFinal),
  };
}

const diagnosticar = (msg: string): string => {
  const m = msg.toLowerCase();
  if (m.includes("429") || m.includes("limite") || m.includes("rate"))
    return "Limite de requisições excedido. Aguarde alguns minutos e tente novamente.";
  if (m.includes("402") || m.includes("crédito"))
    return "Créditos insuficientes no workspace. Adicione créditos e tente novamente.";
  if (m.includes("timeout") || m.includes("tempo"))
    return "Tempo de processamento excedido. Tente um PDF com menos páginas ou imagens mais leves.";
  if (m.includes("nenhuma peça"))
    return "A IA não encontrou peças nesta parte. Verifique se as páginas contêm peças gráficas visíveis.";
  return "Erro inesperado. Tente novamente ou divida o PDF manualmente em partes menores.";
};

/**
 * Extrai um book da Rommanel. As partes são processadas UMA DE CADA VEZ,
 * em ordem, porque a seção e o kit em aberto de uma parte alimentam a seguinte.
 */
export async function extrairBookRommanel(
  file: File,
  onProgress: (p: ProgressoRommanel) => void
): Promise<ResultadoRommanel> {
  const { parts, totalPages } = await splitPdf(file);

  const statuses: { name: string; status: PartStatus }[] = parts.map((p) => ({
    name: p.name,
    status: "pending",
  }));
  const report = (progress: number, mensagem?: string) =>
    onProgress({ progress, partes: statuses.map((s) => ({ ...s })), mensagem });

  report(10);

  const rules = await carregarRegras("rommanel", "extracao");

  const pieces: RommanelPiece[] = [];
  const falhas: { index: number; error: string }[] = [];
  let secaoCorrente = "";
  let kitAberto = "";

  for (let i = 0; i < parts.length; i++) {
    statuses[i].status = "processing";
    report(Math.round(10 + (i / parts.length) * 70));

    let ultimoErro = "";
    let ok = false;

    for (let attempt = 0; attempt <= MAX_RETRIES && !ok; attempt++) {
      if (attempt > 0) await delay(RETRY_DELAY_MS * attempt);
      try {
        const res = await processarParte(parts[i], secaoCorrente, kitAberto, rules);
        pieces.push(...res.pieces);
        secaoCorrente = res.secaoFinal;
        kitAberto = res.kitFinal;
        ok = true;
      } catch (err) {
        ultimoErro = err instanceof Error ? err.message : "Erro desconhecido";
        console.error(`Rommanel: falha em ${parts[i].name} (tentativa ${attempt + 1})`, err);
      }
    }

    statuses[i].status = ok ? "done" : "error";
    if (!ok) falhas.push({ index: i, error: ultimoErro });
    report(Math.round(10 + ((i + 1) / parts.length) * 70));
  }

  const errors: PartError[] = falhas.map(({ index, error }) => {
    const part = parts[index];
    const endPage = Math.min(part.startPage + part.pageCount - 1, totalPages);
    return {
      partName: part.name,
      errorMessage: `${error} — ${diagnosticar(error)}`,
      pages: `${part.startPage}–${endPage}`,
    };
  });

  // Ordena por página e preserva a ordem original dentro da página (kit antes das filhas).
  const ordenadas = pieces
    .map((p, idx) => ({ p, idx }))
    .sort((a, b) => (a.p.pagina !== b.p.pagina ? a.p.pagina - b.p.pagina : a.idx - b.idx))
    .map(({ p }) => p);

  report(100);
  return { pieces: ordenadas, errors, totalPages };
}
