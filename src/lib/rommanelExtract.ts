import { supabase } from "@/integrations/supabase/client";
import { splitPdf, paginaGlobal, type PdfPart } from "@/lib/pdfSplit";
import { carregarRegras } from "@/lib/specLearning";
import type { PartError } from "@/lib/historyStorage";
import { normalizarRommanelPieces, type RommanelPiece } from "@/data/rommanelPieces";
import { calcularCobertura, type Cobertura } from "@/lib/pageCoverage";

import { erroDaFuncao, processarComRetentativas, type PartStatus } from "@/lib/extractionRetry";
export type { PartStatus } from "@/lib/extractionRetry";

export interface ProgressoRommanel {
  /** 0 a 100. */
  progress: number;
  partes: { name: string; status: PartStatus }[];
  mensagem?: string;
}

export interface ResultadoRommanel {
  cobertura: Cobertura;
  resumo: string;
  interrompido?: string;
  pieces: RommanelPiece[];
  errors: PartError[];
  totalPages: number;
  /** Partes subdivididas por peso e páginas pesadas enviadas isoladamente. */
  partesSubdivididas: number;
  paginasPesadas: number;
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

  if (error) throw await erroDaFuncao(error);
  if (!data || !Array.isArray(data.pieces)) {
    throw new Error(data?.error || "Nenhuma peça encontrada no PDF");
  }

  const pieces: RommanelPiece[] = data.pieces.map((p: Record<string, unknown>) => ({
    pagina: paginaGlobal(part, p.paginaNoArquivo ?? p.pagina),
    paginas:
      texto(p.paginas)
        .split("\n")
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => String(paginaGlobal(part, v)))
        .join("\n") || String(paginaGlobal(part, p.paginaNoArquivo ?? p.pagina)),
    localInstalacao: texto(p.localInstalacao) || secaoCorrente,
    kit: texto(p.kit),
    nomePeca: texto(p.nomePeca),
    tamanho: texto(p.tamanho),
    especificacao: texto(p.especificacao),
    codigoArquivo: texto(p.codigoArquivo),
    unidadeCompra: p.unidadeCompra === true,
    nomeColunaVarejo: p.unidadeCompra === true ? texto(p.nomeColunaVarejo) : "",
    cores: texto(p.cores) || "4x0",
    incluir: true,
    camposEmBranco: [],
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
  onProgress: (p: ProgressoRommanel) => void,
  recuperacao?: { paginas: number[]; anteriores: RommanelPiece[]; totalPaginas: number }
): Promise<ResultadoRommanel> {
  const { parts, totalPages, partesSubdivididas, paginasPesadas } = await splitPdf(file, recuperacao?.paginas);
  if (recuperacao && totalPages !== recuperacao.totalPaginas) throw new Error("Envie o book original: a quantidade de páginas é diferente.");

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
  const sucesso: PdfPart[] = [];

  const execucao = await processarComRetentativas(parts.length, async i => {
    // State changes only on success; failed attempts cannot erase section or kit.
    if (recuperacao && (i === 0 || parts[i - 1].startPage + parts[i - 1].pageCount !== parts[i].startPage)) {
      const anterior = [...recuperacao.anteriores, ...pieces]
        .filter(p => p.pagina < parts[i].startPage && p.localInstalacao)
        .sort((a, b) => b.pagina - a.pagina)[0];
      secaoCorrente = anterior?.localInstalacao || secaoCorrente;
      kitAberto = anterior?.kit ?? kitAberto;
    }
    const res = await processarParte(parts[i], secaoCorrente, kitAberto, rules);
    pieces.push(...res.pieces);
    secaoCorrente = res.secaoFinal || secaoCorrente;
    kitAberto = res.kitFinal;
    sucesso.push(parts[i]);
    return res;
  }, p => {
    statuses[p.index].status = p.status;
    report(Math.round(10 + (sucesso.length / parts.length) * 80), p.message);
  });
  falhas.push(...execucao.failures);
  parts.forEach(p => { p.base64 = ""; });

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
  const ordenadas = normalizarRommanelPieces(
    pieces
      .map((p, idx) => ({ p, idx }))
      .sort((a, b) => (a.p.pagina !== b.p.pagina ? a.p.pagina - b.p.pagina : a.idx - b.idx))
      .map(({ p }) => p)
  );

  report(100, execucao.summary);
  return { pieces: ordenadas, errors, totalPages, partesSubdivididas, paginasPesadas,
    cobertura: calcularCobertura(totalPages, sucesso, ordenadas), resumo: execucao.summary, interrompido: execucao.stopped };
}
