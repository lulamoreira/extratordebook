import { PDFDocument } from "pdf-lib";
import { bytesToBase64 } from "@/lib/base64";

/**
 * Divisão de PDF em partes — extraído de Index.tsx sem qualquer mudança de
 * comportamento, para ser compartilhado entre os clientes.
 */
export const MAX_PAGES_PER_PART = 10;

/**
 * Orçamento de bytes por parte JÁ CONVERTIDA em base64 — é o que de fato
 * trafega para a edge function. Partes que passam disso são subdivididas
 * ao meio até caberem (ou até sobrar uma única página).
 */
export const ORCAMENTO_BASE64 = 4 * 1024 * 1024;

export interface PdfPart {
  name: string;
  base64: string;
  /** 1-based number of this part's first page within the full book. */
  startPage: number;
  /** Number of pages contained in this part. */
  pageCount: number;
}

export interface SplitResult {
  parts: PdfPart[];
  totalPages: number;
  /** Quantas partes precisaram ser subdivididas por peso (relatório). */
  partesSubdivididas: number;
  /** Páginas que sozinhas passam do orçamento e foram enviadas assim mesmo. */
  paginasPesadas: number;
}

interface FaixaMontada {
  firstIdx: number;
  endIdx: number;
  base64: string;
  /** Página única que sozinha estoura o orçamento — vai assim mesmo. */
  pesada: boolean;
}

export async function splitPdf(file: File): Promise<SplitResult> {
  const buffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buffer);
  const totalPages = pdfDoc.getPageCount();
  const baseName = file.name.replace(/\.pdf$/i, "");

  const faixas: FaixaMontada[] = [];
  let partesSubdivididas = 0;
  let paginasPesadas = 0;

  /** Monta o documento da faixa e devolve o base64 já medido. */
  const montarFaixa = async (firstIdx: number, endIdx: number): Promise<string> => {
    const newDoc = await PDFDocument.create();
    const copiedPages = await newDoc.copyPages(
      pdfDoc,
      Array.from({ length: endIdx - firstIdx }, (_, i) => firstIdx + i)
    );
    copiedPages.forEach((page) => newDoc.addPage(page));
    const pdfBytes = await newDoc.save({ useObjectStreams: true });
    return bytesToBase64(new Uint8Array(pdfBytes));
  };

  /**
   * Mede a faixa; se o base64 passar do orçamento, divide ao meio e mede de
   * novo, recursivamente, até caber ou sobrar uma única página. Uma página
   * sozinha acima do orçamento é enviada mesmo assim e marcada como pesada.
   */
  const dividir = async (firstIdx: number, endIdx: number): Promise<void> => {
    const base64 = await montarFaixa(firstIdx, endIdx);
    if (base64.length <= ORCAMENTO_BASE64) {
      faixas.push({ firstIdx, endIdx, base64, pesada: false });
      return;
    }
    if (endIdx - firstIdx === 1) {
      faixas.push({ firstIdx, endIdx, base64, pesada: true });
      paginasPesadas += 1;
      return;
    }
    partesSubdivididas += 1;
    const meio = firstIdx + Math.ceil((endIdx - firstIdx) / 2);
    await dividir(firstIdx, meio);
    await dividir(meio, endIdx);
  };

  if (totalPages <= MAX_PAGES_PER_PART) {
    await dividir(0, totalPages);
  } else {
    const totalPartes = Math.ceil(totalPages / MAX_PAGES_PER_PART);
    for (let partIdx = 0; partIdx < totalPartes; partIdx++) {
      const firstIdx = partIdx * MAX_PAGES_PER_PART;
      const endIdx = Math.min(firstIdx + MAX_PAGES_PER_PART, totalPages);
      await dividir(firstIdx, endIdx);
    }
  }

  // Uma faixa única cobrindo o documento inteiro mantém o nome original do arquivo.
  const arquivoInteiro = faixas.length === 1 && faixas[0].firstIdx === 0 && faixas[0].endIdx === totalPages;
  const parts: PdfPart[] = faixas.map((f, i) => ({
    name: arquivoInteiro ? file.name : `${baseName}_parte${i + 1}.pdf`,
    base64: f.base64,
    startPage: f.firstIdx + 1,
    pageCount: f.endIdx - f.firstIdx,
  }));

  return { parts, totalPages, partesSubdivididas, paginasPesadas };
}

/**
 * Converte a página relativa à parte enviada para a página global do book.
 * Fora do intervalo válido, devolve o valor bruto (mesma regra da Natura).
 */
export function paginaGlobal(part: PdfPart, rawValue: unknown): number {
  const raw = Number(rawValue ?? 0);
  const inRange = Number.isFinite(raw) && raw >= 1 && raw <= part.pageCount;
  return inRange ? part.startPage + (raw - 1) : raw || 0;
}
