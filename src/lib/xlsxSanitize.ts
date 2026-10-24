import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export interface ResultadoSaneamentoXlsx {
  buffer: ArrayBuffer;
  formulasConvertidas: number;
  valoresFixos: number;
}

interface MestreCompartilhada {
  endereco: string;
  formula: string;
}

const pausa = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

function coordenadas(endereco: string): { coluna: number; linha: number } {
  const partes = /^([A-Z]+)(\d+)$/i.exec(endereco);
  if (!partes) throw new Error("Endereço inválido na planilha base.");
  const coluna = [...partes[1].toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  return { coluna, linha: Number(partes[2]) };
}

function letras(coluna: number): string {
  let texto = "";
  while (coluna > 0) {
    coluna--;
    texto = String.fromCharCode(65 + coluna % 26) + texto;
    coluna = Math.floor(coluna / 26);
  }
  return texto;
}

/** Mantém nomes de abas e referências estruturadas intactos; desloca apenas A1 e intervalos. */
function deslocarFormula(formula: string, mestre: string, clone: string): string {
  const origem = coordenadas(mestre);
  const destino = coordenadas(clone);
  const dc = destino.coluna - origem.coluna;
  const dr = destino.linha - origem.linha;
  return formula.replace(
    /'(?:[^']|'')*'|\[[^\]]*\]|(?<![\w.])\$?[A-Z]{1,3}\$?\d+(?![\w.]|\s*[!(])|(?<![\w.])\$?[A-Z]{1,3}:\$?[A-Z]{1,3}(?![\w.]|!)|(?<![\w.])\$?\d+:\$?\d+(?![\w.])/gi,
    (referencia) => {
      if (referencia.startsWith("'") || referencia.startsWith("[")) return referencia;
      return referencia.split(":").map((parte) => {
        const cell = /^(\$?)([A-Z]+)(\$?)(\d+)$/i.exec(parte);
        if (cell) {
          const pos = coordenadas(`${cell[2]}${cell[4]}`);
          const col = pos.coluna + (cell[1] ? 0 : dc);
          const row = pos.linha + (cell[3] ? 0 : dr);
          return col < 1 || col > 16384 || row < 1 || row > 1048576
            ? "#REF!" : `${cell[1]}${letras(col)}${cell[3]}${row}`;
        }
        const coluna = /^(\$?)([A-Z]+)$/i.exec(parte);
        if (coluna) {
          const col = coordenadas(`${coluna[2]}1`).coluna + (coluna[1] ? 0 : dc);
          return col < 1 || col > 16384 ? "#REF!" : `${coluna[1]}${letras(col)}`;
        }
        const row = Number(parte.replace("$", "")) + (parte.startsWith("$") ? 0 : dr);
        return row < 1 || row > 1048576 ? "#REF!" : `${parte.startsWith("$") ? "$" : ""}${row}`;
      }).join(":");
    }
  );
}

/** Recria o ZIP em memória, sem alterar o arquivo enviado nem as demais entradas. */
export async function sanitizarXlsx(buffer: ArrayBuffer): Promise<ResultadoSaneamentoXlsx> {
  const arquivos = unzipSync(new Uint8Array(buffer));
  let formulasConvertidas = 0;
  let valoresFixos = 0;
  for (const nome of Object.keys(arquivos)) {
    if (!/^xl\/worksheets\/sheet[^/]*\.xml$/i.test(nome)) continue;
    const xml = strFromU8(arquivos[nome]);
    if (!/\bt\s*=\s*["']shared["']/.test(xml)) continue;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error("XML inválido na planilha base.");
    const formulas = Array.from(doc.getElementsByTagNameNS(NS, "f"));
    const mestres = new Map<string, MestreCompartilhada>();
    for (const f of formulas) {
      const si = f.getAttribute("si");
      const endereco = f.parentElement?.getAttribute("r");
      if (f.getAttribute("t") === "shared" && si !== null && endereco && f.textContent?.trim()) {
        mestres.set(si, { endereco, formula: f.textContent });
      }
    }
    let linhas = 0;
    for (const row of Array.from(doc.getElementsByTagNameNS(NS, "row"))) {
      for (const cell of Array.from(row.children)) {
        const f = Array.from(cell.children).find((elemento) => elemento.localName === "f");
        if (!f || f.getAttribute("t") !== "shared") continue;
        const mestre = mestres.get(f.getAttribute("si") ?? "");
        const endereco = cell.getAttribute("r");
        const propria = f.textContent?.trim();
        if (propria || (mestre && endereco && !mestre.formula.includes('"'))) {
          f.textContent = propria ? f.textContent : deslocarFormula(mestre?.formula ?? "", mestre?.endereco ?? "", endereco ?? "");
          f.removeAttribute("t");
          f.removeAttribute("ref");
          f.removeAttribute("si");
          formulasConvertidas++;
        } else {
          // Órfãos e fórmulas com texto: mantém <v> exatamente como veio.
          f.remove();
          valoresFixos++;
        }
      }
      if (++linhas % 200 === 0) await pausa();
    }
    arquivos[nome] = strToU8(new XMLSerializer().serializeToString(doc));
    await pausa();
  }
  const novo = zipSync(arquivos, { level: 6 });
  return { buffer: Uint8Array.from(novo).buffer, formulasConvertidas, valoresFixos };
}