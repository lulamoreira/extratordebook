/**
 * Geração da pasta Excel da ROMMANEL a partir do arquivo da campanha ANTERIOR.
 *
 * REGRA INEGOCIÁVEL: o arquivo enviado pelo usuário nunca é alterado — tudo
 * acontece sobre o buffer em memória e o resultado é um arquivo novo.
 *
 * Nada aqui é compartilhado com o fluxo da Natura (src/lib/naturaSheet.ts).
 */
import ExcelJS from "exceljs";
import type { RommanelPiece } from "@/data/rommanelPieces";

export interface RelatorioRommanel {
  colunasVarejo: number;
  formulasQuant: number;
  linhasDadosNf: number;
  /** Unidades de compra que ficaram sem a fórmula Quant, por escolha do usuário. */
  quantEmBranco: string[];
  /** Locais de instalação sem cor definida (usaram a cor padrão). */
  secoesNovas: string[];
  /** Problemas que o usuário precisa confirmar antes de baixar. */
  problemas: string[];
  ok: boolean;
}

export interface ResultadoRommanel {
  buffer: ArrayBuffer;
  nomeArquivo: string;
  relatorio: RelatorioRommanel;
}

export type ProgressoRommanel = (etapa: string, percent: number) => void;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const norm = (v: unknown): string =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const normCompacto = (v: unknown): string => norm(v).replace(/[\s.]/g, "");

/** Texto visível de uma célula (ignora fórmulas e formatos ricos). */
const textoCelula = (cell: ExcelJS.Cell): string => {
  const v = cell.value as unknown;
  if (v == null) return "";
  if (typeof v === "object") {
    const rico = v as { richText?: { text: string }[]; text?: string; result?: unknown };
    if (Array.isArray(rico.richText)) return rico.richText.map((r) => r.text).join("");
    if (typeof rico.text === "string") return rico.text;
    return "";
  }
  return String(v);
};

const clonarEstilo = (cell: ExcelJS.Cell): Partial<ExcelJS.Style> =>
  JSON.parse(JSON.stringify(cell.style ?? {})) as Partial<ExcelJS.Style>;

const limparCelula = (cell: ExcelJS.Cell): void => {
  cell.value = null;
  cell.style = {} as ExcelJS.Style;
};

const bordaFina = (): Partial<ExcelJS.Borders> => ({
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
});

const preenchimento = (argb: string): ExcelJS.FillPattern => ({
  type: "pattern",
  pattern: "solid",
  fgColor: { argb },
});

/** Localiza a primeira célula cujo texto normalizado bate com o predicado. */
function acharCelula(
  ws: ExcelJS.Worksheet,
  bate: (texto: string) => boolean
): { row: number; col: number } | null {
  let achado: { row: number; col: number } | null = null;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (achado) return;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (achado) return;
      if (bate(norm(textoCelula(cell)))) achado = { row: rowNumber, col: colNumber };
    });
  });
  return achado;
}

const letra = (ws: ExcelJS.Worksheet, col: number): string => ws.getColumn(col).letter;

/** Desfaz mesclagens que cruzam a área que será reescrita. */
function desmesclar(
  ws: ExcelJS.Worksheet,
  filtro: (m: { top: number; left: number; bottom: number; right: number }) => boolean
): void {
  const merges = ((ws.model as unknown as { merges?: string[] }).merges ?? []).slice();
  for (const range of merges) {
    try {
      const [ini, fim] = range.split(":");
      const a = ws.getCell(ini);
      const b = ws.getCell(fim || ini);
      const ar = Number(a.row);
      const br = Number(b.row);
      const ac = Number(a.col);
      const bc = Number(b.col);
      const caixa = {
        top: Math.min(ar, br),
        bottom: Math.max(ar, br),
        left: Math.min(ac, bc),
        right: Math.max(ac, bc),
      };
      if (filtro(caixa)) ws.unMergeCells(range);
    } catch {
      // Mesclagem inválida no arquivo — ignora.
    }
  }
}

/* ------------------------------------------------------------------ */
/* Cores por Local de instalação                                       */
/* ------------------------------------------------------------------ */

interface CorSecao {
  faixa: string;
  fundo: string;
}

const CORES_SECAO: Record<string, CorSecao> = {
  "TODAS AS LOJAS": { faixa: "FF633014", fundo: "FFF0D8C1" },
  VITRINES: { faixa: "FF808080", fundo: "FFF2F2F2" },
  REVESTIMENTOS: { faixa: "FFBA7F7C", fundo: "FFFAF0FB" },
  AQUARIO: { faixa: "FF808080", fundo: "FFF2F2F2" },
  ARMARIO: { faixa: "FFE863AB", fundo: "FFF5DBEC" },
  QUIOSQUE: { faixa: "FF7030A0", fundo: "FFF9EDF9" },
  CARTAZETE: { faixa: "FF763E18", fundo: "FFFBE5D6" },
};

const COR_PADRAO: CorSecao = { faixa: "FF595959", fundo: "FFF2F2F2" };

const corDaSecao = (local: string): { cor: CorSecao; conhecida: boolean } => {
  const cor = CORES_SECAO[norm(local)];
  return cor ? { cor, conhecida: true } : { cor: COR_PADRAO, conhecida: false };
};

/* ------------------------------------------------------------------ */
/* Geração                                                             */
/* ------------------------------------------------------------------ */

const CAUDA = ["VALOR POR LOJA", "PESO", "VOLUME", "MEDIDAS CAIXA", "TRANSPORTADORA", "NF"];

export async function gerarPastaRommanel(
  arquivoBase: File,
  pecas: RommanelPiece[],
  campanha: string,
  onProgress?: ProgressoRommanel
): Promise<ResultadoRommanel> {
  const nomeCampanha = (campanha || "").trim().toUpperCase();
  if (!nomeCampanha) throw new Error("Informe o nome da campanha.");

  const linhas = pecas.filter((p) => p.incluir !== false);
  if (linhas.length === 0) throw new Error("Nenhuma linha incluída na revisão.");
  const unidades = linhas.filter((p) => p.unidadeCompra);
  if (unidades.length === 0)
    throw new Error("Nenhuma unidade de compra marcada — a VAREJO ficaria sem colunas.");

  onProgress?.("Lendo a planilha da campanha anterior...", 5);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivoBase.arrayBuffer());

  /* --- Abas ------------------------------------------------------- */
  const acharAba = (alvo: string) =>
    wb.worksheets.find((ws) => normCompacto(ws.name) === alvo) ?? null;

  const varejo = acharAba("VAREJO");
  const dadosNf = acharAba("DADOSNF");
  const orcTransp = acharAba("ORCTRANSP");
  const rastreio = acharAba("RASTREIO");

  const faltando: string[] = [];
  if (!varejo) faltando.push("VAREJO");
  if (!dadosNf) faltando.push("DADOS NF");
  if (!orcTransp) faltando.push("ORÇ TRANSP");
  if (!rastreio) faltando.push("RASTREIO");
  if (faltando.length > 0)
    throw new Error(`A planilha enviada não tem a aba: ${faltando.join(", ")}.`);

  const conhecidas = new Set([varejo!.id, dadosNf!.id, orcTransp!.id, rastreio!.id]);
  const abaCampanha = wb.worksheets.find((ws) => !conhecidas.has(ws.id));
  if (!abaCampanha) throw new Error("Não encontrei a aba da campanha na planilha enviada.");
  abaCampanha.name = nomeCampanha;

  const relatorio: RelatorioRommanel = {
    colunasVarejo: 0,
    formulasQuant: 0,
    linhasDadosNf: 0,
    quantEmBranco: [],
    secoesNovas: [],
    problemas: [],
    ok: true,
  };

  /* --- VAREJO ----------------------------------------------------- */
  onProgress?.("Montando as colunas da aba VAREJO...", 25);

  const shopping = acharCelula(varejo!, (t) => t === "NOME DO SHOPPING");
  if (!shopping) throw new Error("Não achei a coluna 'NOME DO SHOPPING' na aba VAREJO.");
  const headerVarejo = shopping.row;
  const primeiraColunaPeca = shopping.col + 1;
  const primeiraLinhaLoja = headerVarejo + 1;

  const razao = acharCelula(varejo!, (t) => t.includes("RAZAO SOCIAL"));
  const colRazao = razao?.col ?? 2;

  let ultimaLinhaLoja = primeiraLinhaLoja;
  for (let r = primeiraLinhaLoja; r <= varejo!.rowCount; r++) {
    if (textoCelula(varejo!.getCell(r, colRazao)).trim() !== "") ultimaLinhaLoja = r;
  }
  const linhaTotais = ultimaLinhaLoja + 1;
  const linhaTotalGeral = ultimaLinhaLoja + 2;

  const ultimaColunaUsada = Math.max(
    varejo!.columnCount,
    varejo!.getRow(headerVarejo).cellCount
  );

  // Onde começa o bloco de cauda (VALOR POR LOJA, PESO, ...).
  let inicioCauda = ultimaColunaUsada + 1;
  for (let c = primeiraColunaPeca; c <= ultimaColunaUsada; c++) {
    const t = norm(textoCelula(varejo!.getCell(headerVarejo, c)));
    if (t && CAUDA.some((k) => t.startsWith(k))) {
      inicioCauda = c;
      break;
    }
  }

  // Modelos de estilo e conteúdo da cauda, guardados antes de apagar.
  const estiloHeaderPeca = clonarEstilo(varejo!.getCell(headerVarejo, primeiraColunaPeca));
  const estiloLojaPeca = clonarEstilo(varejo!.getCell(primeiraLinhaLoja, primeiraColunaPeca));
  const estiloTotais = clonarEstilo(varejo!.getCell(linhaTotais, primeiraColunaPeca));
  const estiloTotalGeral = clonarEstilo(varejo!.getCell(linhaTotalGeral, primeiraColunaPeca));
  const alturaHeader = varejo!.getRow(headerVarejo).height;

  interface ColunaCauda {
    header: { valor: ExcelJS.CellValue; estilo: Partial<ExcelJS.Style> };
    largura?: number;
    celulas: { linha: number; valor: ExcelJS.CellValue; estilo: Partial<ExcelJS.Style> }[];
  }

  const cauda: ColunaCauda[] = [];
  for (let c = inicioCauda; c <= ultimaColunaUsada; c++) {
    const header = varejo!.getCell(headerVarejo, c);
    const celulas: ColunaCauda["celulas"] = [];
    for (let r = primeiraLinhaLoja; r <= linhaTotalGeral; r++) {
      const cell = varejo!.getCell(r, c);
      celulas.push({ linha: r, valor: cell.value, estilo: clonarEstilo(cell) });
    }
    cauda.push({
      header: { valor: header.value, estilo: clonarEstilo(header) },
      largura: varejo!.getColumn(c).width,
      celulas,
    });
  }

  // Apaga o bloco antigo de peças + cauda + totais.
  desmesclar(varejo!, (m) => m.right >= primeiraColunaPeca && m.bottom >= headerVarejo);
  for (let r = headerVarejo; r <= linhaTotalGeral; r++) {
    for (let c = primeiraColunaPeca; c <= ultimaColunaUsada; c++) {
      limparCelula(varejo!.getCell(r, c));
    }
  }

  // Uma coluna por unidade de compra.
  const colunaDaPeca = new Map<RommanelPiece, number>();
  unidades.forEach((p, i) => {
    const c = primeiraColunaPeca + i;
    colunaDaPeca.set(p, c);
    const header = varejo!.getCell(headerVarejo, c);
    header.value = (p.nomeColunaVarejo || p.nomePeca || "").toUpperCase();
    header.style = JSON.parse(JSON.stringify(estiloHeaderPeca));
    header.font = { name: "Calibri", size: 12, bold: true };
    header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    header.border = bordaFina();
    varejo!.getColumn(c).width = Math.min(22, Math.max(13, String(header.value).length + 2));

    for (let r = primeiraLinhaLoja; r <= ultimaLinhaLoja; r++) {
      const cell = varejo!.getCell(r, c);
      cell.value = null;
      cell.style = JSON.parse(JSON.stringify(estiloLojaPeca));
      cell.border = bordaFina();
      cell.alignment = { horizontal: "center", vertical: "middle" };
    }
  });
  if (alturaHeader) varejo!.getRow(headerVarejo).height = alturaHeader;

  const ultimaColunaPeca = primeiraColunaPeca + unidades.length - 1;
  relatorio.colunasVarejo = unidades.length;

  // Cauda de volta, logo depois da última coluna de peça.
  cauda.forEach((col, i) => {
    const destino = ultimaColunaPeca + 1 + i;
    const header = varejo!.getCell(headerVarejo, destino);
    header.value = col.header.valor;
    header.style = JSON.parse(JSON.stringify(col.header.estilo));
    if (col.largura) varejo!.getColumn(destino).width = col.largura;
    for (const c of col.celulas) {
      const cell = varejo!.getCell(c.linha, destino);
      cell.value = c.valor;
      cell.style = JSON.parse(JSON.stringify(c.estilo));
    }
  });

  // Totais por coluna de peça.
  for (const [, c] of colunaDaPeca) {
    const col = letra(varejo!, c);
    const cell = varejo!.getCell(linhaTotais, c);
    cell.style = JSON.parse(JSON.stringify(estiloTotais));
    cell.value = { formula: `SUM(${col}${primeiraLinhaLoja}:${col}${ultimaLinhaLoja})` };
    cell.font = { ...(cell.font ?? { name: "Calibri", size: 11 }), bold: true };
  }

  // Total geral mesclado ao longo das colunas de peça.
  const geral = varejo!.getCell(linhaTotalGeral, primeiraColunaPeca);
  geral.style = JSON.parse(JSON.stringify(estiloTotalGeral));
  geral.value = {
    formula: `SUM(${letra(varejo!, primeiraColunaPeca)}${linhaTotais}:${letra(
      varejo!,
      ultimaColunaPeca
    )}${linhaTotais})`,
  };
  geral.font = { ...(geral.font ?? { name: "Calibri", size: 11 }), bold: true };
  if (ultimaColunaPeca > primeiraColunaPeca) {
    try {
      varejo!.mergeCells(linhaTotalGeral, primeiraColunaPeca, linhaTotalGeral, ultimaColunaPeca);
    } catch {
      // Já mesclada — segue.
    }
  }

  /* --- Aba da campanha -------------------------------------------- */
  onProgress?.("Escrevendo a aba da campanha...", 55);

  const cabPeca = acharCelula(abaCampanha, (t) => t === "NOME DA PECA");
  if (!cabPeca) throw new Error("Não achei o cabeçalho 'Nome da Peça' na aba da campanha.");
  const headerCampanha = cabPeca.row;
  const inicioDados = headerCampanha + 2;

  const cabTotal = (() => {
    const row = abaCampanha.getRow(headerCampanha);
    let col = 9;
    row.eachCell({ includeEmpty: false }, (cell, c) => {
      if (norm(textoCelula(cell)) === "TOTAL") col = c;
    });
    return col;
  })();

  let somaCampanha = 0;
  for (let r = inicioDados; r <= abaCampanha.rowCount + 1; r++) {
    const row = abaCampanha.getRow(r);
    let temSoma = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const f = (cell.value as { formula?: string } | null)?.formula;
      if (f && f.toUpperCase().includes("SUM")) temSoma = true;
    });
    if (temSoma) {
      somaCampanha = r;
      break;
    }
  }
  if (!somaCampanha) somaCampanha = inicioDados + 1;

  const antigas = Math.max(0, somaCampanha - inicioDados);
  const diferenca = linhas.length - antigas;
  if (diferenca > 0) {
    abaCampanha.spliceRows(
      somaCampanha,
      0,
      ...Array.from({ length: diferenca }, () => [] as unknown[])
    );
  } else if (diferenca < 0) {
    abaCampanha.spliceRows(somaCampanha + diferenca, -diferenca);
  }
  const novaSomaCampanha = inicioDados + linhas.length;
  const ultimaLinhaDados = novaSomaCampanha - 1;

  desmesclar(
    abaCampanha,
    (m) => m.top >= inicioDados && m.bottom <= ultimaLinhaDados && m.right <= 10
  );

  // Título "CAMPANHA <NOME>".
  const tituloCel =
    acharCelula(abaCampanha, (t) => t.startsWith("CAMPANHA")) ?? { row: 1, col: 6 };
  abaCampanha.getCell(tituloCel.row, tituloCel.col).value = `CAMPANHA ${nomeCampanha}`;

  const secoesNovas = new Set<string>();

  linhas.forEach((p, i) => {
    const r = inicioDados + i;
    const branco = (campo: string) => p.camposEmBranco?.includes(campo as never);
    const { cor, conhecida } = corDaSecao(p.localInstalacao);
    if (!conhecida && p.localInstalacao) secoesNovas.add(p.localInstalacao.toUpperCase());

    const valores: (ExcelJS.CellValue | null)[] = [
      null, // A — faixa (escrita no bloco)
      null, // B — kit (escrito no bloco)
      (p.nomePeca || "").toUpperCase(),
      branco("pagina") ? null : p.paginas || String(p.pagina || ""),
      branco("tamanho") ? null : p.tamanho || "",
      null, // F — especificação (escrita no bloco do kit)
      null, // G — Quant
      null,
      null,
      null,
    ];

    for (let c = 1; c <= 10; c++) {
      const cell = abaCampanha.getCell(r, c);
      cell.value = valores[c - 1] ?? null;
      cell.font = { name: "Calibri", size: 11 };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = bordaFina();
      cell.fill = preenchimento(c === 1 ? cor.faixa : cor.fundo);
    }

    // Quant: só na unidade de compra que não pediu Quant em branco.
    const colVarejo = colunaDaPeca.get(p);
    if (p.unidadeCompra && !branco("quant") && colVarejo) {
      abaCampanha.getCell(r, 7).value = {
        formula: `VAREJO!${letra(varejo!, colVarejo)}${linhaTotais}`,
      };
      relatorio.formulasQuant += 1;
    } else if (p.unidadeCompra && branco("quant")) {
      relatorio.quantEmBranco.push(p.nomeColunaVarejo || p.nomePeca);
    }

    abaCampanha.getRow(r).height = (p.especificacao || "").length > 40 ? 34 : 21;
  });

  // Blocos de Local de instalação (faixa lateral) e de Kit.
  const mesclarBloco = (col: number, de: number, ate: number, valor: string) => {
    const cell = abaCampanha.getCell(de, col);
    cell.value = valor;
    if (ate > de) {
      try {
        abaCampanha.mergeCells(de, col, ate, col);
      } catch {
        // Mantém sem mesclar se o arquivo não permitir.
      }
    }
    return cell;
  };

  let i = 0;
  while (i < linhas.length) {
    const local = linhas[i].localInstalacao;
    let fim = i;
    while (fim + 1 < linhas.length && linhas[fim + 1].localInstalacao === local) fim++;
    const cell = mesclarBloco(1, inicioDados + i, inicioDados + fim, (local || "").toUpperCase());
    cell.font = { name: "Calibri", size: 18, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle", textRotation: 90, wrapText: true };
    cell.fill = preenchimento(corDaSecao(local).cor.faixa);
    cell.border = bordaFina();
    i = fim + 1;
  }

  // Kit + especificação mesclados pelas linhas do mesmo kit (ou pela unidade de compra).
  let j = 0;
  while (j < linhas.length) {
    let fim = j;
    if (linhas[j].kit) {
      while (fim + 1 < linhas.length && linhas[fim + 1].kit === linhas[j].kit) fim++;
      mesclarBloco(2, inicioDados + j, inicioDados + fim, linhas[j].kit.toUpperCase());
    }
    const espBranca = linhas[j].camposEmBranco?.includes("especificacao");
    mesclarBloco(6, inicioDados + j, inicioDados + fim, espBranca ? "" : linhas[j].especificacao || "");
    if (espBranca) abaCampanha.getCell(inicioDados + j, 6).value = null;
    j = fim + 1;
  }

  // Fórmulas de soma do rodapé, com o intervalo novo.
  abaCampanha.getRow(novaSomaCampanha).eachCell({ includeEmpty: false }, (cell, c) => {
    const f = (cell.value as { formula?: string } | null)?.formula;
    if (f && f.toUpperCase().includes("SUM")) {
      cell.value = {
        formula: `SUM(${letra(abaCampanha, c)}${inicioDados}:${letra(
          abaCampanha,
          c
        )}${ultimaLinhaDados})`,
      };
    }
  });
  void cabTotal;

  /* --- DADOS NF --------------------------------------------------- */
  onProgress?.("Escrevendo a aba DADOS NF...", 78);

  const cabDesc = acharCelula(dadosNf!, (t) => t.startsWith("DESCRICAO"));
  if (!cabDesc) throw new Error("Não achei o cabeçalho 'Descrição' na aba DADOS NF.");
  const headerNf = cabDesc.row;
  const inicioNf = headerNf + 1;

  let somaNf = 0;
  for (let r = inicioNf; r <= dadosNf!.rowCount + 1; r++) {
    let temSoma = false;
    dadosNf!.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      const f = (cell.value as { formula?: string } | null)?.formula;
      if (f && f.toUpperCase().includes("SUM")) temSoma = true;
    });
    if (temSoma) {
      somaNf = r;
      break;
    }
  }
  if (!somaNf) somaNf = inicioNf + 1;

  const antigasNf = Math.max(0, somaNf - inicioNf);
  const modeloNf = Array.from({ length: 8 }, (_, k) =>
    clonarEstilo(dadosNf!.getCell(inicioNf, k + 1))
  );

  const difNf = unidades.length - antigasNf;
  if (difNf > 0) {
    dadosNf!.spliceRows(somaNf, 0, ...Array.from({ length: difNf }, () => [] as unknown[]));
  } else if (difNf < 0) {
    dadosNf!.spliceRows(somaNf + difNf, -difNf);
  }
  const novaSomaNf = inicioNf + unidades.length;

  unidades.forEach((p, k) => {
    const r = inicioNf + k;
    for (let c = 1; c <= 8; c++) {
      const cell = dadosNf!.getCell(r, c);
      cell.value = null;
      cell.style = JSON.parse(JSON.stringify(modeloNf[c - 1]));
      cell.border = bordaFina();
    }
    const desc = dadosNf!.getCell(r, cabDesc.col);
    desc.value = `${(p.nomeColunaVarejo || p.nomePeca || "").toUpperCase()} - ${nomeCampanha}`;
    desc.font = { ...(desc.font ?? { name: "Calibri", size: 11 }), bold: true };
    desc.border = bordaFina();
  });
  relatorio.linhasDadosNf = unidades.length;

  dadosNf!.getRow(novaSomaNf).eachCell({ includeEmpty: false }, (cell, c) => {
    const f = (cell.value as { formula?: string } | null)?.formula;
    if (f && f.toUpperCase().includes("SUM")) {
      cell.value = {
        formula: `SUM(${letra(dadosNf!, c)}${inicioNf}:${letra(dadosNf!, c)}${novaSomaNf - 1})`,
      };
    }
  });

  /* --- Conferência ------------------------------------------------ */
  onProgress?.("Conferindo o resultado...", 90);

  relatorio.secoesNovas = [...secoesNovas];

  const esperadoQuant = relatorio.colunasVarejo - relatorio.quantEmBranco.length;
  if (relatorio.formulasQuant !== esperadoQuant) {
    relatorio.problemas.push(
      `As fórmulas Quant (${relatorio.formulasQuant}) não fecham com as colunas da VAREJO menos as em branco (${esperadoQuant}).`
    );
  }
  if (relatorio.linhasDadosNf !== relatorio.colunasVarejo) {
    relatorio.problemas.push(
      `A DADOS NF tem ${relatorio.linhasDadosNf} linhas e a VAREJO tem ${relatorio.colunasVarejo} colunas de peça.`
    );
  }

  const cabecalhos = unidades.map((p) => (p.nomeColunaVarejo || p.nomePeca || "").toUpperCase());
  const repetidos = cabecalhos.filter((n, k) => cabecalhos.indexOf(n) !== k);
  if (repetidos.length > 0) {
    relatorio.problemas.push(`Cabeçalho de peça repetido na VAREJO: ${[...new Set(repetidos)].join(", ")}.`);
  }
  const semNome = cabecalhos.filter((n) => n.trim() === "").length;
  if (semNome > 0) {
    relatorio.problemas.push(`${semNome} coluna(s) da VAREJO ficaram sem nome no cabeçalho.`);
  }

  // Toda fórmula =VAREJO! precisa apontar para uma coluna com cabeçalho.
  for (let r = inicioDados; r <= ultimaLinhaDados; r++) {
    const f = (abaCampanha.getCell(r, 7).value as { formula?: string } | null)?.formula;
    if (!f || !f.toUpperCase().includes("VAREJO!")) continue;
    const ref = f.match(/VAREJO!\$?([A-Z]+)\$?(\d+)/i);
    if (!ref) continue;
    const alvo = varejo!.getColumn(ref[1]).number;
    if (
      alvo < primeiraColunaPeca ||
      alvo > ultimaColunaPeca ||
      textoCelula(varejo!.getCell(headerVarejo, alvo)).trim() === ""
    ) {
      relatorio.problemas.push(`A fórmula Quant da linha ${r} aponta para uma coluna sem cabeçalho.`);
    }
  }

  relatorio.ok = relatorio.problemas.length === 0;

  onProgress?.("Gerando o arquivo...", 96);
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  onProgress?.("Pronto!", 100);

  return { buffer, nomeArquivo: `${nomeCampanha}_GRADE.xlsx`, relatorio };
}

/** Dispara o download do arquivo novo (o enviado pelo usuário nunca é tocado). */
export function baixarPastaRommanel(buffer: ArrayBuffer, nomeArquivo: string): void {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}
