import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { sanitizarXlsx } from "./xlsxSanitize";

const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const arquivo = (rows: string): ArrayBuffer => Uint8Array.from(zipSync({
  "xl/worksheets/sheet1.xml": strToU8(`<worksheet xmlns="${ns}"><sheetData>${rows}</sheetData></worksheet>`),
  "xl/styles.xml": strToU8("preservar"),
})).buffer;
const ler = (buffer: ArrayBuffer): Document => new DOMParser().parseFromString(
  strFromU8(unzipSync(new Uint8Array(buffer))["xl/worksheets/sheet1.xml"]), "application/xml"
);
const celula = (doc: Document, endereco: string): Element | undefined =>
  Array.from(doc.getElementsByTagNameNS(ns, "c")).find((c) => c.getAttribute("r") === endereco);

describe("saneamento de fórmulas compartilhadas", () => {
  it("converte T321 e seu clone preservando o resultado e o arquivo original", async () => {
    const original = arquivo('<row r="321"><c r="T321" s="5"><f t="shared" ref="T321:BF321" si="0">SUM(T3:T320)</f><v>7</v></c><c r="U321"><f t="shared" si="0"/><v>8</v></c></row>');
    const copia = original.slice(0);
    const resultado = await sanitizarXlsx(original);
    const doc = ler(resultado.buffer);
    expect(celula(doc, "U321")?.getElementsByTagNameNS(ns, "f")[0].textContent).toBe("SUM(U3:U320)");
    expect(celula(doc, "T321")?.getAttribute("s")).toBe("5");
    expect(celula(doc, "U321")?.getElementsByTagNameNS(ns, "v")[0].textContent).toBe("8");
    expect(doc.querySelector('f[t="shared"]')).toBeNull();
    expect(resultado.formulasConvertidas).toBe(2);
    expect(original).toEqual(copia);
    expect(strFromU8(unzipSync(new Uint8Array(resultado.buffer))["xl/styles.xml"])).toBe("preservar");
  });

  it("desloca referências relativas, mas não referências com $ ou nomes de abas", async () => {
    const resultado = await sanitizarXlsx(arquivo(`<row r="1"><c r="B1"><f t="shared" si="1" ref="B1:C2">SUM(A1,$A1,A$1,$A$1,'A1'!A1,Sheet1!A1,A:A,1:1)</f></c></row><row r="2"><c r="C2"><f t="shared" si="1"/></c></row>`));
    expect(celula(ler(resultado.buffer), "C2")?.textContent).toBe("SUM(B2,$A2,B$1,$A$1,'A1'!B2,Sheet1!B2,B:B,2:2)");
  });

  it("remove fórmula órfã de E46 e preserva o valor em cache", async () => {
    const resultado = await sanitizarXlsx(arquivo('<row r="46"><c r="E46"><f t="shared" si="7"/><v>123</v></c></row>'));
    expect(celula(ler(resultado.buffer), "E46")?.getElementsByTagNameNS(ns, "f").length).toBe(0);
    expect(celula(ler(resultado.buffer), "E46")?.textContent).toBe("123");
    expect(resultado.valoresFixos).toBe(1);
  });

  it("mantém a mestre com texto literal e transforma apenas o clone em valor fixo", async () => {
    const resultado = await sanitizarXlsx(arquivo('<row r="1"><c r="A1"><f t="shared" si="2" ref="A1:A2">IF(B1=1,&quot;A1&quot;,&quot;&quot;)</f><v>0</v></c></row><row r="2"><c r="A2"><f t="shared" si="2"/><v>9</v></c></row>'));
    expect(celula(ler(resultado.buffer), "A1")?.getElementsByTagNameNS(ns, "f")[0].textContent).toBe('IF(B1=1,"A1","")');
    expect(celula(ler(resultado.buffer), "A2")?.textContent).toBe("9");
    expect(resultado.formulasConvertidas).toBe(1);
    expect(resultado.valoresFixos).toBe(1);
  });
});