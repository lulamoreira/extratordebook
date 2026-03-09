import { useState, useCallback } from "react";
import { classificarTipo, type Piece } from "@/data/extractedPieces";
import { saveToHistory, type PartError } from "@/lib/historyStorage";

import * as XLSX from "xlsx";
import { PDFDocument } from "pdf-lib";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Download, Upload, FileText, Trash2, Pencil, Check, X, Plus, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ExtractionHistory from "@/components/ExtractionHistory";

const MAX_PAGES_PER_PART = 10;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const getErrorDiagnosis = (errorMsg: string): string => {
  const msg = errorMsg.toLowerCase();
  if (msg.includes("429") || msg.includes("limite") || msg.includes("rate"))
    return "Limite de requisições excedido. Aguarde alguns minutos e tente novamente.";
  if (msg.includes("402") || msg.includes("crédito"))
    return "Créditos insuficientes no workspace. Adicione créditos e tente novamente.";
  if (msg.includes("timeout") || msg.includes("tempo"))
    return "Tempo de processamento excedido. Tente um PDF com menos páginas ou imagens mais leves.";
  if (msg.includes("500") || msg.includes("interno"))
    return "Erro interno do servidor. Tente novamente em alguns minutos.";
  if (msg.includes("nenhuma peça"))
    return "A IA não encontrou peças nesta parte. Verifique se as páginas contêm peças gráficas visíveis.";
  return "Erro inesperado. Tente novamente ou divida o PDF manualmente em partes menores.";
};

const Index = () => {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editData, setEditData] = useState<Piece | null>(null);
  const [processingFiles, setProcessingFiles] = useState<{ name: string; status: "pending" | "processing" | "done" | "error" }[]>([]);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const splitPdf = async (file: File): Promise<{ name: string; base64: string }[]> => {
    const buffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(buffer);
    const totalPages = pdfDoc.getPageCount();
    const baseName = file.name.replace(/\.pdf$/i, "");
    const parts: { name: string; base64: string }[] = [];

    if (totalPages <= MAX_PAGES_PER_PART) {
      const base64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      parts.push({ name: file.name, base64 });
      return parts;
    }

    const totalParts = Math.ceil(totalPages / MAX_PAGES_PER_PART);
    for (let partIdx = 0; partIdx < totalParts; partIdx++) {
      const startPage = partIdx * MAX_PAGES_PER_PART;
      const endPage = Math.min(startPage + MAX_PAGES_PER_PART, totalPages);
      const newDoc = await PDFDocument.create();
      const copiedPages = await newDoc.copyPages(pdfDoc, Array.from({ length: endPage - startPage }, (_, i) => startPage + i));
      copiedPages.forEach((page) => newDoc.addPage(page));
      const pdfBytes = await newDoc.save({ useObjectStreams: true });
      const base64 = btoa(
        new Uint8Array(pdfBytes).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      parts.push({ name: `${baseName}_parte${partIdx + 1}.pdf`, base64 });
    }

    return parts;
  };

  const processOnePart = async (base64: string, partName: string): Promise<Piece[]> => {
    const { data, error } = await supabase.functions.invoke("extract-pdf", {
      body: { pdfBase64: base64, fileName: partName },
    });

    if (error) throw new Error(error.message || "Erro ao processar PDF");

    if (data?.pieces && Array.isArray(data.pieces)) {
      return data.pieces.map((p: any) => ({
        pagina: p.pagina || 0,
        secao: p.secao || "",
        codigo: p.codigo || "",
        nomePeca: p.nomePeca || "",
        tamanho: p.tamanho || "",
        especificacao: p.especificacao || "",
        cores: p.cores || "4x0",
      }));
    }
    throw new Error(data?.error || "Nenhuma peça encontrada no PDF");
  };

  const processFile = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Apenas arquivos PDF são aceitos.");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 50MB).");
      return;
    }

    setFileName(file.name);
    setIsExtracting(true);
    setProgress(2);

    try {
      toast.info("Dividindo PDF em partes de até 10 páginas...");
      const parts = await splitPdf(file);
      setProgress(10);

      const fileStatuses = parts.map((p) => ({ name: p.name, status: "pending" as const }));
      setProcessingFiles(fileStatuses);

      let allPieces: Piece[] = [];
      let successCount = 0;
      const failedParts: { index: number; error: string }[] = [];

      // First pass
      for (let i = 0; i < parts.length; i++) {
        setProcessingFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: "processing" } : f))
        );
        setProgress(Math.round(10 + ((i) / parts.length) * 70));

        try {
          const extracted = await processOnePart(parts[i].base64, parts[i].name);
          allPieces = [...allPieces, ...extracted];
          successCount += extracted.length;
          setProcessingFiles((prev) =>
            prev.map((f, idx) => (idx === i ? { ...f, status: "done" } : f))
          );
        } catch (err: any) {
          console.error(`Error processing ${parts[i].name}:`, err);
          failedParts.push({ index: i, error: err.message || "Erro desconhecido" });
          setProcessingFiles((prev) =>
            prev.map((f, idx) => (idx === i ? { ...f, status: "error" } : f))
          );
        }
      }

      // Retry failed parts
      if (failedParts.length > 0) {
        toast.info(`Retentando ${failedParts.length} parte(s) com falha...`);
        const stillFailed: { index: number; error: string }[] = [];

        for (let retry = 0; retry < MAX_RETRIES; retry++) {
          const toRetry = retry === 0 ? [...failedParts] : [...stillFailed];
          stillFailed.length = 0;

          if (toRetry.length === 0) break;

          await delay(RETRY_DELAY_MS * (retry + 1));

          for (const { index } of toRetry) {
            setProcessingFiles((prev) =>
              prev.map((f, idx) => (idx === index ? { ...f, status: "processing" } : f))
            );
            setProgress(Math.round(80 + ((retry + 1) / MAX_RETRIES) * 15));

            try {
              const extracted = await processOnePart(parts[index].base64, parts[index].name);
              allPieces = [...allPieces, ...extracted];
              successCount += extracted.length;
              setProcessingFiles((prev) =>
                prev.map((f, idx) => (idx === index ? { ...f, status: "done" } : f))
              );
              toast.success(`"${parts[index].name}" recuperada na tentativa ${retry + 2}!`);
            } catch (err: any) {
              stillFailed.push({ index, error: err.message || "Erro desconhecido" });
              setProcessingFiles((prev) =>
                prev.map((f, idx) => (idx === index ? { ...f, status: "error" } : f))
              );
            }
          }
        }

        // Build error report for parts that ultimately failed
        var partErrors: PartError[] = stillFailed.map(({ index, error }) => {
          const partIdx = index;
          const startPage = partIdx * MAX_PAGES_PER_PART + 1;
          const endPage = Math.min(startPage + MAX_PAGES_PER_PART - 1, parts.length * MAX_PAGES_PER_PART);
          return {
            partName: parts[index].name,
            errorMessage: error,
            pages: `${startPage}–${endPage}`,
          };
        });

        if (partErrors.length > 0) {
          toast.error(`${partErrors.length} parte(s) falharam mesmo após ${MAX_RETRIES} retentativas.`);
        }
      }

      setPieces(allPieces);
      setProgress(100);

      const errors = typeof partErrors !== "undefined" ? partErrors : [];

      if (successCount > 0 || errors.length > 0) {
        saveToHistory(file.name, allPieces, errors);
        setHistoryRefreshKey(prev => prev + 1);
        setPieces([]);
        setFileName("");

        if (successCount > 0) {
          toast.success(`${successCount} peças extraídas e salvas no histórico!`);
        }
      }
    } catch (err: any) {
      toast.error(`Erro ao dividir PDF: ${err.message}`);
    } finally {
      setIsExtracting(false);
      setTimeout(() => setProcessingFiles([]), 3000);
    }
  }, [pieces]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await processFile(file);
    e.target.value = "";
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }, [processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragging) {
      setIsDragging(true);
    }
  }, [isDragging]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // Only set dragging to false if we're leaving the main container
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
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

  const handleLoadFromHistory = (pieces: Piece[], fileName: string) => {
    setPieces(pieces);
    setFileName(fileName);
    toast.success(`Carregado: ${fileName} (${pieces.length} peças)`);
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
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Extrator de Peças — Books de Campanha
            </h1>
            <p className="text-sm text-muted-foreground">
              Envie um PDF de book de campanha para extrair automaticamente todas as peças gráficas
            </p>
          </div>
          
        </div>

        {/* Warning */}
        <Alert className="mb-6 border-amber-500/50 bg-amber-50 dark:bg-amber-950/30">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-400 font-bold text-base">
            Divisão automática em partes de até 10 páginas
          </AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            Envie um único PDF do book completo. O sistema irá <strong>dividir automaticamente</strong> em partes de até 10 páginas
            e processar cada parte separadamente, consolidando todas as peças em uma única tabela.
          </AlertDescription>
        </Alert>

        {/* History */}
        <ExtractionHistory onLoad={handleLoadFromHistory} refreshKey={historyRefreshKey} />

        {/* Upload Area */}
        {pieces.length === 0 && !isExtracting && (
          <Card 
            className={`mb-8 border-dashed border-2 transition-colors ${
              isDragging 
                ? "border-primary bg-primary/5" 
                : "border-muted-foreground/25"
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="rounded-full bg-muted p-4">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-foreground">
                  {isDragging ? "Solte o PDF aqui" : "Envie o PDF do Book"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isDragging 
                    ? "Solte para iniciar o processamento" 
                    : "Selecione um PDF (máx. 50MB) ou arraste para esta área"
                  }
                </p>
              </div>
              {!isDragging && (
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
              )}
            </CardContent>
          </Card>
        )}

        {/* Progress */}
        {isExtracting && (
          <Card className="mb-8">
            <CardContent className="py-8">
              <div className="flex flex-col gap-4 items-center">
                <div className="animate-pulse text-primary font-medium">
                  Extraindo peças...
                </div>
                <Progress value={progress} className="max-w-md" />
                {processingFiles.length > 0 && (
                  <div className="w-full max-w-md space-y-1">
                    {processingFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {f.status === "pending" && <span className="text-muted-foreground">⏳</span>}
                        {f.status === "processing" && <span className="animate-spin">⚙️</span>}
                        {f.status === "done" && <span className="text-green-600">✅</span>}
                        {f.status === "error" && <span className="text-destructive">❌</span>}
                        <span className={f.status === "processing" ? "font-medium text-foreground" : "text-muted-foreground"}>
                          {f.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Isso pode levar até 1 minuto por PDF
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
                      Adicionar PDF
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
