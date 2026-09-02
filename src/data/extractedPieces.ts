export interface Piece {
  pagina: number;
  secao: string;
  codigo: string;
  nomePeca: string;
  tamanho: string;
  especificacao: string;
  cores: string;
}

export function classificarTipo(nome: string): string {
  const n = nome.toLowerCase();
  if (n.includes("backlight")) return "Backlight";
  if (n.includes("letra caixa") || n.includes("letracaixa") || n.includes("letra_caixa")) return "Letra Caixa";
  if (n.includes("testeira")) return "Testeira";
  if (n.includes("aplique")) return "Aplique";
  if (n.includes("shelf")) return "Shelf";
  if (n.includes("band oval")) return "Bandeirola";
  if (n.includes("moldura")) return "Moldura";
  if (n.includes("aro")) return "Aro";
  if (n.includes("estrutura")) return "Estrutura";
  if (n.includes("base") || n.includes("totem")) return "Base/Totem";
  if (n.includes("faca")) return "Faca/Base";
  if (n.includes("painel")) return "Painel";
  if (n.includes("placa")) return "Placa";
  if (n.includes("arranjo") || n.includes("foto")) return "Decoração";
  return "Outro";
}
