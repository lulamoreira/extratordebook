import { extractedPieces, classificarTipo } from "@/data/extractedPieces";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download } from "lucide-react";

const Index = () => {
  const handleDownload = () => {
    const wsData = extractedPieces.map((p) => ({
      Página: p.pagina,
      Seção: p.secao,
      Código: p.codigo,
      "Nome da Peça": p.nomePeca,
      "Tipo de Peça": classificarTipo(p.nomePeca),
      "Tamanho (cm)": p.tamanho,
      Especificação: p.especificacao,
      Cores: p.cores,
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    ws["!cols"] = [
      { wch: 8 },
      { wch: 35 },
      { wch: 55 },
      { wch: 35 },
      { wch: 18 },
      { wch: 20 },
      { wch: 70 },
      { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Peças Aurora Mães 2026");
    XLSX.writeFile(wb, "NAT_AURORA_MAES_BOOK_Extração.xlsx");
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Natura Aurora — Mães 2026
            </h1>
            <p className="text-sm text-muted-foreground">
              {extractedPieces.length} peças extraídas (páginas 1–110)
            </p>
          </div>
          <Button onClick={handleDownload} className="gap-2">
            <Download className="h-4 w-4" />
            Baixar Excel
          </Button>
        </div>

        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Pág.</TableHead>
                <TableHead>Seção</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Nome da Peça</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead>Especificação / Notas</TableHead>
                <TableHead className="w-16">Cores</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {extractedPieces.map((p, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{p.pagina}</TableCell>
                  <TableCell className="text-xs font-semibold">{p.secao}</TableCell>
                  <TableCell className="text-xs font-mono break-all max-w-xs">
                    {p.codigo}
                  </TableCell>
                  <TableCell>{p.nomePeca}</TableCell>
                  <TableCell className="text-xs">{classificarTipo(p.nomePeca)}</TableCell>
                  <TableCell>{p.tamanho}</TableCell>
                  <TableCell className="text-sm max-w-sm">
                    {p.especificacao || "—"}
                  </TableCell>
                  <TableCell className="font-medium">{p.cores}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          ✅ Todas as 110 páginas do PDF foram processadas.
        </p>
      </div>
    </div>
  );
};

export default Index;
