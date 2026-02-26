import { useState, useCallback } from "react";
import { classificarTipo, type Piece } from "@/data/extractedPieces";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Download, Upload, FileText, Trash2, Pencil, Check, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Index = () => {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editData, setEditData] = useState<Piece | null>(null);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast.error("Por favor, envie um arquivo PDF.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("O arquivo é muito grande (máximo 20MB).");
      return;
    }

    setFileName(file.name);
    setIsExtracting(true);
    setProgress(10);

    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );

      setProgress(30);

      const { data, error } = await supabase.functions.invoke("extract-pdf", {
        body: { pdfBase64: base64, fileName: file.name },
      });

      setProgress(90);

      if (error) {
        throw new Error(error.message || "Erro ao processar PDF");
      }

      if (data?.pieces && Array.isArray(data.pieces)) {
        const mappedPieces: Piece[] = data.pieces.map((p: any) => ({
          pagina: p.pagina || 0,
          secao: p.secao || "",
          codigo: p.codigo || "",
          nomePeca: p.nomePeca || "",
          tamanho: p.tamanho || "",
          especificacao: p.especificacao || "",
          cores: p.cores || "4x0",
        }));
        setPieces(mappedPieces);
        toast.success(`${mappedPieces.length} peças extraídas com sucesso!`);
      } else {
        throw new Error(data?.error || "Nenhuma peça encontrada no PDF");
      }
    } catch (err: any) {
      console.error("Extraction error:", err);
      toast.error(err.message || "Erro ao extrair dados do PDF");
    } finally {
      setIsExtracting(false);
      setProgress(100);
      // Reset file input
      e.target.value = "";
    }
  }, []);

  const handleDownload = () => {
    if (pieces.length === 0) return;
    const wsData = pieces.map((p) => ({
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
    const sheetName = fileName.replace(/\.pdf$/i, "") || "Extração";
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, `${sheetName}_Extração.xlsx`);
  };

  const startEdit = (index: number) => {
    setEditingRow(index);
    setEditData({ ...pieces[index] });
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditData(null);
  };

  const saveEdit = () => {
    if (editingRow === null || !editData) return;
    setPieces((prev) => prev.map((p, i) => (i === editingRow ? editData : p)));
    setEditingRow(null);
    setEditData(null);
  };

  const deleteRow = (index: number) => {
    setPieces((prev) => prev.filter((_, i) => i !== index));
    toast.info("Peça removida");
  };

  const addRow = () => {
    setPieces((prev) => [
      ...prev,
      { pagina: 0, secao: "", codigo: "", nomePeca: "", tamanho: "", especificacao: "", cores: "4x0" },
    ]);
    startEdit(pieces.length);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">
            Extrator de Peças — Books de Campanha
          </h1>
          <p className="text-sm text-muted-foreground">
            Envie um PDF de book de campanha para extrair automaticamente todas as peças gráficas
          </p>
        </div>

        {/* Upload Area */}
        {pieces.length === 0 && !isExtracting && (
          <Card className="mb-8 border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="rounded-full bg-muted p-4">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-foreground">Envie o PDF do Book</p>
                <p className="text-sm text-muted-foreground">Arraste ou clique para selecionar (máx. 20MB)</p>
              </div>
              <label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <Button asChild className="gap-2 cursor-pointer">
                  <span>
                    <FileText className="h-4 w-4" />
                    Selecionar PDF
                  </span>
                </Button>
              </label>
            </CardContent>
          </Card>
        )}

        {/* Progress */}
        {isExtracting && (
          <Card className="mb-8">
            <CardContent className="py-8">
              <div className="flex flex-col gap-3 items-center">
                <div className="animate-pulse text-primary font-medium">
                  Extraindo peças de "{fileName}"...
                </div>
                <Progress value={progress} className="max-w-md" />
                <p className="text-xs text-muted-foreground">
                  Isso pode levar até 1 minuto dependendo do tamanho do PDF
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {pieces.length > 0 && (
          <>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {fileName && <span className="text-muted-foreground">{fileName} — </span>}
                  {pieces.length} peças extraídas
                </p>
              </div>
              <div className="flex gap-2">
                <label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <Button variant="outline" asChild className="gap-2 cursor-pointer" size="sm">
                    <span>
                      <Upload className="h-4 w-4" />
                      Novo PDF
                    </span>
                  </Button>
                </label>
                <Button variant="outline" size="sm" onClick={addRow} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
                <Button onClick={handleDownload} className="gap-2" size="sm">
                  <Download className="h-4 w-4" />
                  Baixar Excel
                </Button>
              </div>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Pág.</TableHead>
                    <TableHead>Seção</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome da Peça</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Tamanho</TableHead>
                    <TableHead>Especificação / Notas</TableHead>
                    <TableHead className="w-12">Cores</TableHead>
                    <TableHead className="w-20">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pieces.map((p, i) => (
                    <TableRow key={i}>
                      {editingRow === i && editData ? (
                        <>
                          <TableCell>
                            <Input
                              type="number"
                              value={editData.pagina}
                              onChange={(e) => setEditData({ ...editData, pagina: Number(e.target.value) })}
                              className="h-7 w-14 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editData.secao}
                              onChange={(e) => setEditData({ ...editData, secao: e.target.value })}
                              className="h-7 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editData.codigo}
                              onChange={(e) => setEditData({ ...editData, codigo: e.target.value })}
                              className="h-7 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editData.nomePeca}
                              onChange={(e) => setEditData({ ...editData, nomePeca: e.target.value })}
                              className="h-7 text-xs"
                            />
                          </TableCell>
                          <TableCell className="text-xs">{classificarTipo(editData.nomePeca)}</TableCell>
                          <TableCell>
                            <Input
                              value={editData.tamanho}
                              onChange={(e) => setEditData({ ...editData, tamanho: e.target.value })}
                              className="h-7 w-20 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editData.especificacao}
                              onChange={(e) => setEditData({ ...editData, especificacao: e.target.value })}
                              className="h-7 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editData.cores}
                              onChange={(e) => setEditData({ ...editData, cores: e.target.value })}
                              className="h-7 w-12 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit}>
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}>
                                <X className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-medium">{p.pagina}</TableCell>
                          <TableCell className="text-xs font-semibold">{p.secao}</TableCell>
                          <TableCell className="text-xs font-mono break-all max-w-xs">{p.codigo}</TableCell>
                          <TableCell>{p.nomePeca}</TableCell>
                          <TableCell className="text-xs">{classificarTipo(p.nomePeca)}</TableCell>
                          <TableCell>{p.tamanho}</TableCell>
                          <TableCell className="text-sm max-w-sm">{p.especificacao || "—"}</TableCell>
                          <TableCell className="font-medium">{p.cores}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(i)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteRow(i)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
