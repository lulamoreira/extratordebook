import ExcelJS from "exceljs";

export interface NaturaRow {
  grupo: string;
  nome: string;
  item: string;
  arquivo: string;
  especificacaoPadrao: string;
  pagBook: number;
  formato: string;
}

const GROUP_COLORS: Record<string, string> = {
  "TODAS AS LOJAS": "FFC00000",
  "VITRINE PRIMÁRIA": "FF0070C0",
  "VITRINE SECUNDÁRIA": "FF763E18",
  INTERNOS: "FF002060",
  OUTROS: "FF595959",
};

const COLUMN_WIDTHS = [7, 2.5, 39, 40, 70.83, 106.33, 15.83, 29.5, 2.83, 9.83, 15, 18.83, 69.5];

const thinBorder = (color: string): Partial<ExcelJS.Borders> => ({
  top: { style: "thin", color: { argb: color } },
  left: { style: "thin", color: { argb: color } },
  bottom: { style: "thin", color: { argb: color } },
  right: { style: "thin", color: { argb: color } },
});

const centerWrap: Partial<ExcelJS.Alignment> = {
  horizontal: "center",
  vertical: "middle",
  wrapText: true,
};

/** Numeric page of a row; 0 (or NaN) means "unknown" and is pushed to the end. */
const pageValue = (row: NaturaRow): number => {
  const n = Number(row.pagBook);
  return Number.isFinite(n) && n > 0 ? n : 0;
};


/**
 * Builds and downloads the official Natura production spreadsheet layout.
 */
export async function gerarPlanilhaNatura(
  rows: NaturaRow[],
  titulo: string,
  nomeArquivo: string
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("GERAL_", {
    views: [{ showGridLines: false }],
  });

  COLUMN_WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  ws.getRow(1).height = 30;
  ws.getRow(2).height = 16;
  ws.getRow(3).height = 16;
  ws.getRow(4).height = 60; // espaço reservado para o mockup (colado manualmente)
  ws.getRow(5).height = 58.5;
  ws.getRow(6).height = 26;

  // Título
  ws.mergeCells("D2:F3");
  const titleCell = ws.getCell("D2");
  titleCell.value = (titulo || "").toUpperCase();
  titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF000000" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  // Cabeçalho da tabela
  const headerStyle = (cell: ExcelJS.Cell, size: number) => {
    cell.font = { name: "Calibri", size, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF262626" } };
    cell.alignment = centerWrap;
    cell.border = thinBorder("FFFFFFFF");
  };

  const mainHeaders: [string, string][] = [
    ["C5", "NOME"],
    ["D5", "ITEM"],
    ["E5", "ARQUIVO"],
    ["F5", "ESPECIFICAÇÃO"],
    ["G5", "PAG BOOK"],
    ["H5", "FORMATO"],
  ];
  mainHeaders.forEach(([ref, text]) => {
    const cell = ws.getCell(ref);
    cell.value = text;
    headerStyle(cell, 18);
  });

  const budgetHeaders: [string, string][] = [
    ["J5", "QUANT"],
    ["K5", "UNIT"],
    ["L5", "TOTAL"],
    ["M5", "OBSERVAÇÕES"],
  ];
  budgetHeaders.forEach(([ref, text]) => {
    const cell = ws.getCell(ref);
    cell.value = text;
    headerStyle(cell, 12);
  });

  // A página do book manda: ordena por página (numérica) de forma ESTÁVEL.
  // Páginas ausentes/inválidas (0) vão para o fim. O grupo não influencia a posição.
  const sorted = rows
    .map((row, originalIndex) => ({ row, originalIndex, page: pageValue(row) }))
    .sort((a, b) => {
      const aUnknown = a.page === 0;
      const bUnknown = b.page === 0;
      if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
      if (!aUnknown && a.page !== b.page) return a.page - b.page;
      return a.originalIndex - b.originalIndex;
    })
    .map((e) => e.row);


  const FIRST_DATA_ROW = 7;
  const blackBorder = thinBorder("FF000000");
  const whiteBorder = thinBorder("FFFFFFFF");

  sorted.forEach((row, i) => {
    const r = FIRST_DATA_ROW + i;
    const excelRow = ws.getRow(r);
    excelRow.height = 34;

    const values: [string, string | number][] = [
      ["C", row.nome ?? ""],
      ["D", row.item ?? ""],
      ["E", row.arquivo ?? ""],
      ["F", row.especificacaoPadrao ?? ""],
      ["G", Number(row.pagBook) || 0],
      ["H", row.formato ?? ""],
    ];

    values.forEach(([col, value]) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.value = value;
      cell.alignment = centerWrap;
      if (col === "D") {
        cell.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF262626" } };
        cell.border = whiteBorder;
      } else {
        cell.font = { name: "Calibri", size: 12, color: { argb: "FF000000" } };
        cell.border = blackBorder;
      }
    });

    ["J", "K", "L", "M"].forEach((col) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.border = blackBorder;
    });
  });

  // Faixas laterais por grupo + mesclagens internas
  let blockStart = 0;
  while (blockStart < sorted.length) {
    let blockEnd = blockStart;
    while (blockEnd + 1 < sorted.length && sorted[blockEnd + 1].grupo === sorted[blockStart].grupo) {
      blockEnd++;
    }

    const grupo = sorted[blockStart].grupo;
    const rTop = FIRST_DATA_ROW + blockStart;
    const rBottom = FIRST_DATA_ROW + blockEnd;

    if (rBottom > rTop) ws.mergeCells(`A${rTop}:A${rBottom}`);
    const banner = ws.getCell(`A${rTop}`);
    banner.value = grupo;
    banner.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
    banner.alignment = { horizontal: "center", vertical: "middle", textRotation: 90 };
    banner.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GROUP_COLORS[grupo] ?? GROUP_COLORS.OUTROS },
    };

    // Mescla verticalmente valores repetidos consecutivos, sem cruzar grupos
    const mergeRuns = (col: "C" | "G", key: (r: NaturaRow) => string) => {
      let runStart = blockStart;
      for (let i = blockStart; i <= blockEnd; i++) {
        const isLast = i === blockEnd;
        const sameNext = !isLast && key(sorted[i + 1]) === key(sorted[runStart]);
        if (!sameNext) {
          if (i > runStart) {
            ws.mergeCells(`${col}${FIRST_DATA_ROW + runStart}:${col}${FIRST_DATA_ROW + i}`);
          }
          runStart = i + 1;
        }
      }
    };

    mergeRuns("C", (r) => r.nome ?? "");
    mergeRuns("G", (r) => String(Number(r.pagBook) || 0));

    blockStart = blockEnd + 1;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${nomeArquivo}_PADRAO_NATURA.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
