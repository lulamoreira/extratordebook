import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { gerarPastaRommanel } from "./rommanelSheet";
import { novaLinhaRommanel } from "@/data/rommanelPieces";

async function base(danificada = false): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const varejo = wb.addWorksheet("VAREJO");
  varejo.getCell("A2").value = "RAZÃO SOCIAL";
  varejo.getCell("B2").value = "NOME DO SHOPPING";
  varejo.getCell("C2").value = "PEÇA ANTIGA";
  varejo.getCell("D2").value = "VALOR POR LOJA";
  varejo.getCell("A3").value = "LOJA A";
  varejo.getCell("A4").value = "LOJA B";
  const mestreVarejo = { formula: "SUM(C3:C4)", result: 0, shareType: "shared", ref: "C5:D5" };
  varejo.getCell("C5").value = mestreVarejo;
  varejo.getCell("D5").value = { sharedFormula: "C5", result: 4 };
  const campanha = wb.addWorksheet("ANTIGA");
  campanha.getCell("C2").value = "NOME DA PEÇA";
  const nf = wb.addWorksheet("DADOS NF");
  nf.getCell("A1").value = "DESCRIÇÃO";
  wb.addWorksheet("ORÇ TRANSP").getCell("A1").value = "PRESERVAR";
  const rastreio = wb.addWorksheet("RASTREIO");
  const mestreRastreio = { formula: "ROW(A1)", result: 1, shareType: "shared", ref: "B1:B2" };
  rastreio.getCell("B1").value = mestreRastreio;
  rastreio.getCell("B2").value = { sharedFormula: "B1", result: 2 };
  rastreio.getCell("B2").numFmt = "0.00";
  const buffer = await wb.xlsx.writeBuffer();
  const arquivos = unzipSync(new Uint8Array(buffer));
  if (danificada) {
    arquivos["xl/worksheets/sheet5.xml"] = strToU8(strFromU8(arquivos["xl/worksheets/sheet5.xml"]).replace(/<f[^>]*>ROW\(A1\)<\/f>/, ""));
  }
  return Uint8Array.from(zipSync(arquivos)).buffer;
}

const pecas = [{ ...novaLinhaRommanel(), nomePeca: "PAINEL", nomeColunaVarejo: "PAINEL", unidadeCompra: true, localInstalacao: "VITRINES" }];
const comoArquivo = (buffer: ArrayBuffer): File => ({ arrayBuffer: async () => buffer }) as File;

describe("geração Rommanel com fórmulas compartilhadas", () => {
  it("gera e relê sem compartilhamentos, mantendo fórmulas, cache e abas não editadas", async () => {
    const original = await base();
    const copia = original.slice(0);
    const resultado = await gerarPastaRommanel(comoArquivo(original), pecas, "NOVA");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(resultado.buffer);
    expect(wb.getWorksheet("RASTREIO")?.getCell("B2").formula).toBe("ROW(A2)");
    expect(wb.getWorksheet("RASTREIO")?.getCell("B2").result).toBe(2);
    expect(wb.getWorksheet("RASTREIO")?.getCell("B2").numFmt).toBe("0.00");
    expect(wb.getWorksheet("ORÇ TRANSP")?.getCell("A1").value).toBe("PRESERVAR");
    expect(wb.getWorksheet("NOVA")?.getCell("G4").formula).toBe("VAREJO!C5");
    expect(resultado.relatorio.formulasConvertidas).toBe(4);
    expect(resultado.relatorio.valoresFixos).toBe(0);
    expect(resultado.relatorio.ok).toBe(true);
    for (const [nome, xml] of Object.entries(unzipSync(new Uint8Array(resultado.buffer)))) {
      if (nome.startsWith("xl/worksheets/")) expect(strFromU8(xml)).not.toContain('t="shared"');
    }
    expect(original).toEqual(copia);
  });

  it("abre base com mestre apagada e registra o clone recuperado como valor fixo", async () => {
    const resultado = await gerarPastaRommanel(comoArquivo(await base(true)), pecas, "RECUPERADA");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(resultado.buffer);
    expect(wb.getWorksheet("RASTREIO")?.getCell("B2").value).toBe(2);
    expect(resultado.relatorio.valoresFixos).toBe(1);
    expect(resultado.relatorio.ok).toBe(true);
  });

  it("falha com orientação clara quando a base não é um XLSX legível", async () => {
    await expect(gerarPastaRommanel(comoArquivo(new ArrayBuffer(3)), pecas, "NOVA")).rejects.toThrow(
      "Não foi possível ler esta planilha base. Abra o arquivo no Excel, salve por cima e tente de novo."
    );
  });
});

describe("cores por Local de instalação", () => {
  const linha = (local: string, nome: string) => ({
    ...novaLinhaRommanel(),
    nomePeca: nome,
    nomeColunaVarejo: nome,
    unidadeCompra: true,
    localInstalacao: local,
  });

  it("casa o singular com a entrada plural sem alterar o texto gravado", async () => {
    const resultado = await gerarPastaRommanel(
      comoArquivo(await base()),
      [linha("VITRINE", "PAINEL"), linha("PRAÇA NOVA", "CARTAZETE")],
      "NOVA",
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(resultado.buffer);
    const campanha = wb.getWorksheet("NOVA");
    // VITRINE (singular) recebe a cor de VITRINES; o texto gravado é o da extração.
    expect(campanha?.getCell("A4").value).toBe("VITRINE");
    expect((campanha?.getCell("A4").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF808080");
    // Seção genuinamente desconhecida continua caindo no cinza padrão e no aviso.
    expect((campanha?.getCell("A5").fill as ExcelJS.FillPattern).fgColor?.argb).toBe("FF595959");
    expect(resultado.relatorio.secoesNovas).toEqual(["PRAÇA NOVA"]);
  });
});