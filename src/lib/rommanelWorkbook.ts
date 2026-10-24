import type ExcelJS from "exceljs";

const normalizarNomeAba = (nome: string): string =>
  nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s.*]/g, "").toUpperCase();

/** A campanha é a aba restante; a posição e o nome da campanha são variáveis. */
export function identificarAbasRommanel(wb: ExcelJS.Workbook) {
  const achar = (nome: string) =>
    wb.worksheets.find((ws) => normalizarNomeAba(ws.name) === nome);
  const varejo = achar("VAREJO");
  const dadosNf = achar("DADOSNF");
  const orcTransp = achar("ORCTRANSP");
  const rastreio = achar("RASTREIO");
  const faltando = [
    !varejo && "VAREJO", !dadosNf && "DADOS NF",
    !orcTransp && "ORÇ TRANSP", !rastreio && "RASTREIO",
  ].filter(Boolean);
  if (!varejo || !dadosNf || !orcTransp || !rastreio) {
    throw new Error(`A planilha enviada não tem a aba: ${faltando.join(", ")}.`);
  }
  const conhecidas = new Set([varejo.id, dadosNf.id, orcTransp.id, rastreio.id]);
  const abaCampanha = wb.worksheets.find((ws) => !conhecidas.has(ws.id));
  if (!abaCampanha) throw new Error("Não encontrei a aba da campanha na planilha enviada.");
  return { varejo, dadosNf, orcTransp, rastreio, abaCampanha };
}