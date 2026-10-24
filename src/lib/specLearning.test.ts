import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { novaLinhaRommanel } from "@/data/rommanelPieces";
import {
  compararComGerado, lerPlanilhaDoCliente, lerPlanilhaLayoutRommanel,
  linhasDaRevisaoRommanel,
} from "./specLearning";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

async function arquivo(wb: ExcelJS.Workbook): Promise<File> {
  const buffer = await wb.xlsx.writeBuffer();
  return { arrayBuffer: async () => buffer } as File;
}

function campanha() {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet(" DADOS nf ");
  wb.addWorksheet(" Varejo ");
  wb.addWorksheet("orç transp");
  wb.addWorksheet("Rastreio");
  const ws = wb.addWorksheet("HERANÇAS");
  // Colunas propositalmente reordenadas: não há geometria fixa no leitor.
  ws.getRow(3).values = ["Especificação", "Página", "Kit", "Tamanho (cm)", "Nome da Peça", "Local de instalação"];
  ws.getRow(5).values = ["PVC 2mm", 12, "KIT PAINEL", "60x90", "PAINEL", "VITRINE"];
  ws.getRow(6).values = [null, null, null, "20x30", "APLIQUE"];
  for (const col of [1, 2, 3, 6]) ws.mergeCells(5, col, 6, col);
  return { wb, ws };
}

describe("leitura de aprendizado por motor de planilha", () => {
  it("encontra a campanha fora da primeira aba e mapeia Kit e Nome da Peça sem confundir", async () => {
    const { wb } = campanha();
    const rows = await lerPlanilhaLayoutRommanel(await arquivo(wb));
    expect(rows[0]).toEqual({ grupo: "VITRINE", nome: "KIT PAINEL", item: "PAINEL",
      arquivo: "", especificacao: "PVC 2mm", pagBook: 12, formato: "60x90" });
  });

  it("preenche Local, Kit, Página e Especificação das linhas-filhas mescladas", async () => {
    const rows = await lerPlanilhaLayoutRommanel(await arquivo(campanha().wb));
    expect(rows[1]).toEqual({ grupo: "VITRINE", nome: "KIT PAINEL", item: "APLIQUE",
      arquivo: "", especificacao: "PVC 2mm", pagBook: 12, formato: "20x30" });
  });

  it("faz forward-fill mesmo quando somente a mestre tem valor e ignora linhas vazias", async () => {
    const { wb, ws } = campanha();
    for (const col of [1, 2, 3, 6]) ws.unMergeCells(5, col, 6, col);
    ws.getRow(7).values = [null, null, null, null, null, "IGNORAR"];
    ws.getRow(8).values = [null, null, null, "10x10", "LOGO"];
    const rows = await lerPlanilhaLayoutRommanel(await arquivo(wb));
    expect(rows).toHaveLength(3);
    expect(rows[1].especificacao).toBe("PVC 2mm");
    expect(rows[1].pagBook).toBe(12);
  });

  it("começa duas linhas abaixo e termina no último Nome da Peça", async () => {
    const { wb, ws } = campanha();
    ws.getCell("E4").value = "RESPIRO";
    ws.getCell("A9").value = "RODAPÉ";
    const rows = await lerPlanilhaLayoutRommanel(await arquivo(wb));
    expect(rows.map((row) => row.item)).toEqual(["PAINEL", "APLIQUE"]);
  });

  it("aceita Tamanho sem unidade e página empilhada sem concatenar números", async () => {
    const { wb, ws } = campanha();
    ws.getCell("D3").value = "Tamanho";
    ws.getCell("B5").value = "12\n13";
    const rows = await lerPlanilhaDoCliente(await arquivo(wb), "rommanel");
    expect(rows[0].formato).toBe("60x90");
    expect(rows[0].pagBook).toBe(12);
  });

  for (const cliente of ["natura", "montreal"] as const) {
    it(`preserva o leitor do layout Natura para ${cliente}`, async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("GERAL_");
      ws.getRow(1).values = ["Grupo", "Nome", "Item", "Arquivo", "Especificação", "Pag book", "Formato"];
      ws.getRow(2).values = ["INTERNOS", "KIT", "CARTAZ", "arte.pdf", "Papel", 7, "10x20"];
      expect(await lerPlanilhaDoCliente(await arquivo(wb), cliente)).toEqual([
        { grupo: "INTERNOS", nome: "KIT", item: "CARTAZ", arquivo: "arte.pdf",
          especificacao: "Papel", pagBook: 7, formato: "10x20" },
      ]);
    });
  }

  it("recusa pasta sem as abas Rommanel obrigatórias", async () => {
    const { wb } = campanha();
    wb.removeWorksheet("Rastreio");
    await expect(lerPlanilhaLayoutRommanel(await arquivo(wb))).rejects.toThrow("RASTREIO");
  });
});

describe("comparação com revisão Rommanel salva", () => {
  const painel = { ...novaLinhaRommanel(), nomePeca: "PAINEL", kit: "KIT", pagina: 12,
    paginas: "12", tamanho: "60x90", especificacao: "PVC 2mm", localInstalacao: "VITRINE" };
  it("usa a especificação da primeira linha do kit como na pasta gerada", async () => {
    const base = linhasDaRevisaoRommanel([painel,
      { ...painel, nomePeca: "APLIQUE", tamanho: "20x30", especificacao: "" }]);
    const editadas = await lerPlanilhaLayoutRommanel(await arquivo(campanha().wb));
    expect(compararComGerado(editadas, base)).toEqual({ itens: [], iguais: 2 });
    editadas[1].especificacao = "PVC 3mm";
    const resultado = compararComGerado(editadas, base);
    expect(resultado.iguais).toBe(1);
    expect(resultado.itens[0].especificacaoIa).toBe("PVC 2mm");
    expect(resultado.itens[0].origem).toBe("comparacao_planilha");
  });

  it("omite peças excluídas e respeita campos decididos em branco", () => {
    const rows = linhasDaRevisaoRommanel([
      { ...painel, incluir: false },
      { ...painel, kit: "", camposEmBranco: ["pagina", "tamanho", "especificacao"] },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].pagBook).toBe(0);
    expect(rows[0].formato).toBe("");
    expect(rows[0].especificacaoPadrao).toBe("");
  });
});