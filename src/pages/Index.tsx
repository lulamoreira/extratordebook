import { useState, useCallback } from "react";
import { classificarTipo, type Piece } from "@/data/extractedPieces";
import { saveToHistory, updateHistoryPieces, type PartError } from "@/lib/historyStorage";

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
import { Download, Upload, FileText, Trash2, Pencil, Check, X, Plus, AlertTriangle, Save, FileSpreadsheet, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ExtractionHistory from "@/components/ExtractionHistory";
import AppHeader from "@/components/AppHeader";
import { exportarPlanilhaNatura } from "@/lib/naturaExport";

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

/** Converts binary data to base64 in chunks, avoiding blowing the call stack / freezing the tab. */
const bytesToBase64 = (bytes: Uint8Array): string => {
  const CHUNK_SIZE = 8192;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, i + CHUNK_SIZE);
    chunks.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  return btoa(chunks.join(""));
};

interface PdfPart {
  name: string;
  base64: string;
  /** 1-based number of this part's first page within the full book. */
  startPage: number;
  /** Number of pages contained in this part. */
  pageCount: number;
}

interface SplitResult {
  parts: PdfPart[];
  totalPages: number;
}

/** Sorts by page ascending, then codigo, and drops exact duplicates (codigo+pagina+tamanho). */
const normalizePieces = (input: Piece[]): Piece[] => {
  const seen = new Set<string>();
  const unique: Piece[] = [];
  for (const p of input) {
    const key = `${p.codigo}||${p.pagina}||${p.tamanho}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }
  return unique.sort((a, b) => {
    if (a.pagina !== b.pagina) return a.pagina - b.pagina;
    return a.codigo.localeCompare(b.codigo);
  });
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
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);
  const [isGeneratingNatura, setIsGeneratingNatura] = useState(false);

  const handleGerarNatura = async () => {
    setIsGeneratingNatura(true);
    try {
      await exportarPlanilhaNatura(pieces, fileName.replace(/\.pdf$/i, ""));
    } finally {
      setIsGeneratingNatura(false);
    }
  };

  const splitPdf = async (file: File): Promise<SplitResult> => {
    const buffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(buffer);
    const totalPages = pdfDoc.getPageCount();
    const baseName = file.name.replace(/\.pdf$/i, "");
    const parts: PdfPart[] = [];

    if (totalPages <= MAX_PAGES_PER_PART) {
      parts.push({
        name: file.name,
        base64: bytesToBase64(new Uint8Array(buffer)),
        startPage: 1,
        pageCount: totalPages,
      });
      return { parts, totalPages };
    }

    const totalParts = Math.ceil(totalPages / MAX_PAGES_PER_PART);
    for (let partIdx = 0; partIdx < totalParts; partIdx++) {
      const firstIdx = partIdx * MAX_PAGES_PER_PART;
      const endIdx = Math.min(firstIdx + MAX_PAGES_PER_PART, totalPages);
      const newDoc = await PDFDocument.create();
      const copiedPages = await newDoc.copyPages(
        pdfDoc,
        Array.from({ length: endIdx - firstIdx }, (_, i) => firstIdx + i)
      );
      copiedPages.forEach((page) => newDoc.addPage(page));
      const pdfBytes = await newDoc.save({ useObjectStreams: true });
      parts.push({
        name: `${baseName}_parte${partIdx + 1}.pdf`,
        base64: bytesToBase64(new Uint8Array(pdfBytes)),
        startPage: firstIdx + 1,
        pageCount: endIdx - firstIdx,
      });
    }

    return { parts, totalPages };
  };

  const processOnePart = async (part: PdfPart): Promise<Piece[]> => {
    const { data, error } = await supabase.functions.invoke("extract-pdf", {
      body: { pdfBase64: part.base64, fileName: part.name },
    });

    if (error) throw new Error(error.message || "Erro ao processar PDF");

    if (data?.pieces && Array.isArray(data.pieces)) {
      return data.pieces.map((p: any) => {
        // The AI reports the page position *inside the uploaded part*; convert to global.
        const raw = Number(p.paginaNoArquivo ?? p.pagina ?? 0);
        const inRange = Number.isFinite(raw) && raw >= 1 && raw <= part.pageCount;
        const pagina = inRange ? part.startPage + (raw - 1) : raw || 0;

        return {
          pagina,
          secao: p.secao || "",
          codigo: p.codigo || "",
          nomePeca: p.nomePeca || "",
          tamanho: p.tamanho || "",
          especificacao: p.especificacao || "",
          cores: p.cores || "4x0",
        };
      });
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
      const { parts, totalPages } = await splitPdf(file);
      setProgress(10);

      const fileStatuses = parts.map((p) => ({ name: p.name, status: "pending" as const }));
      setProcessingFiles(fileStatuses);

      let allPieces: Piece[] = [];
      let successCount = 0;
      let partErrors: PartError[] = [];
      const failedParts: { index: number; error: string }[] = [];

      // First pass
      for (let i = 0; i < parts.length; i++) {
        setProcessingFiles((prev) =>
          prev.map((f, idx) => (idx === i ? { ...f, status: "processing" } : f))
        );
        setProgress(Math.round(10 + ((i) / parts.length) * 70));

        try {
          const extracted = await processOnePart(parts[i]);
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
              const extracted = await processOnePart(parts[index]);
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
        partErrors = stillFailed.map(({ index, error }) => {
          const part = parts[index];
          const startPage = part.startPage;
          const endPage = Math.min(startPage + part.pageCount - 1, totalPages);
          return {
            partName: part.name,
            errorMessage: error,
            pages: `${startPage}–${endPage}`,
          };
        });

        if (partErrors.length > 0) {
          toast.error(`${partErrors.length} parte(s) falharam mesmo após ${MAX_RETRIES} retentativas.`);
        }
      }

      const finalPieces = normalizePieces(allPieces);
      setPieces(finalPieces);
      setProgress(100);

      if (successCount > 0 || partErrors.length > 0) {
        try {
          const entry = await saveToHistory(file.name, finalPieces, partErrors);
          setCurrentEntryId(entry.id);
          setHistoryRefreshKey((prev) => prev + 1);
          if (successCount > 0) {
            toast.success(`${finalPieces.length} peças extraídas e salvas na nuvem!`);
          }
        } catch (saveErr) {
          console.error("Erro ao salvar histórico:", saveErr);
          setCurrentEntryId(null);
          toast.error("Não foi possível salvar no histórico — baixe o Excel agora para não perder", {
            duration: 15000,
          });
        }
      }
    } catch (err: any) {
      toast.error(`Erro ao dividir PDF: ${err.message}`);
    } finally {
      setIsExtracting(false);
      setTimeout(() => setProcessingFiles([]), 3000);
    }
  }, []);

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

  const handleLoadFromHistory = (loaded: Piece[], loadedName: string, entryId: string) => {
    setPieces(normalizePieces(loaded));
    setFileName(loadedName);
    setCurrentEntryId(entryId);
    toast.success(`Carregado: ${loadedName} (${loaded.length} peças)`);
  };

  const handleSaveToHistory = async () => {
    if (!currentEntryId) {
      toast.error("Nenhuma entrada do histórico carregada para atualizar.");
      return;
    }
    try {
      await updateHistoryPieces(currentEntryId, pieces);
      setHistoryRefreshKey((prev) => prev + 1);
      toast.success("Alterações salvas no histórico!");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar no histórico — baixe o Excel para não perder as edições.");
    }
  };

  const handleGoHome = () => {
    setPieces([]);
    setFileName("");
    setEditingRow(null);
    setEditData(null);
    setCurrentEntryId(null);
    setHistoryRefreshKey((prev) => prev + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };


  const addRow = () => {
    setPieces((prev) => [
      ...prev,
      { pagina: 0, secao: "", codigo: "", nomePeca: "", tamanho: "", especificacao: "", cores: "4x0" },
    ]);
    startEdit(pieces.length);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader onGoHome={handleGoHome} busy={isExtracting} />

      <div className="mx-auto max-w-7xl p-4 md:p-8">
        {/* Page intro */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-foreground">
            Extrator de Peças — Books de Campanha
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Envie um PDF de book de campanha para extrair automaticamente todas as peças gráficas
          </p>
        </div>

        {/* Warning */}
        <Alert className="mb-6 border-none bg-warning/10 shadow-soft">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <AlertTitle className="text-base font-bold text-foreground">
            Divisão automática em partes de até 10 páginas
          </AlertTitle>
          <AlertDescription className="text-muted-foreground">
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveToHistory}
                  disabled={!currentEntryId}
                  className="gap-2"
                  title={currentEntryId ? "Atualizar a entrada do histórico com as peças da tela" : "Nenhuma entrada do histórico carregada"}
                >
                  <Save className="h-4 w-4" />
                  Salvar alterações no histórico
                </Button>
                <Button onClick={handleDownload} className="gap-2" size="sm">
                  <Download className="h-4 w-4" />
                  Baixar Excel
                </Button>
                <Button
                  onClick={handleGerarNatura}
                  disabled={isGeneratingNatura}
                  className="gap-2"
                  size="sm"
                  variant="secondary"
                >
                  {isGeneratingNatura ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-4 w-4" />
                  )}
                  Gerar Planilha Padrão Natura
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
