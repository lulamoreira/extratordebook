import { useState, useCallback, useEffect } from "react";
import { classificarTipo, type Piece } from "@/data/extractedPieces";
import { saveToHistory, updateHistoryPieces, type PartError } from "@/lib/historyStorage";

import * as XLSX from "xlsx";
import { splitPdf, type PdfPart } from "@/lib/pdfSplit";
import { normalizarRommanelPieces, type RommanelPiece } from "@/data/rommanelPieces";
import RevisaoRommanel from "@/components/RevisaoRommanel";
import { extrairBookRommanel } from "@/lib/rommanelExtract";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, Upload, FileText, Trash2, Pencil, Check, X, Plus, Save, FileSpreadsheet, Loader2 } from "lucide-react";
import ClienteMark from "@/components/ClienteMark";
import {
  CLIENTE_PADRAO,
  LISTA_CLIENTES,
  getCliente,
  lerUltimoClienteUsado,
  salvarClienteSelecionado,
  type ClienteId,
} from "@/lib/clientes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ExtractionHistory from "@/components/ExtractionHistory";
import AppHeader from "@/components/AppHeader";
import { exportarPlanilhaNatura } from "@/lib/naturaExport";

import { carregarRegras } from "@/lib/specLearning";
import TeachDialog from "@/components/TeachDialog";
import { GraduationCap } from "lucide-react";
import ResultadosActionBar from "@/components/ResultadosActionBar";
import { cn } from "@/lib/utils";



const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;

// A trava de tamanho total existe por causa da MEMÓRIA DO NAVEGADOR ao
// carregar o arquivo inteiro e montar o documento — não por limite de envio
// (o pdfSplit fatia por páginas E por peso, e cada parte trafega separada).
const LIMITE_ARQUIVO_MB = 200;
const AVISO_ARQUIVO_MB = 100;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Remove acentos, caixa e separadores para comparar nomes de arquivo com nomes de clientes. */
const normalizarTexto = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Devolve o cliente citado no nome do arquivo, ou null se nenhum aparecer. */
const clienteNoNomeDoArquivo = (fileName: string): ClienteId | null => {
  const nome = normalizarTexto(fileName);
  if (!nome) return null;
  for (const c of LISTA_CLIENTES) {
    if (nome.includes(normalizarTexto(c.nome))) return c.id;
  }
  return null;
};

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
  const [teachOpen, setTeachOpen] = useState(false);
  // Nenhum cliente pré-selecionado: a escolha é sempre um clique consciente.
  const [cliente, setCliente] = useState<ClienteId | null>(null);
  const [ultimoUsado, setUltimoUsado] = useState<ClienteId | null>(null);
  const [rommanelPieces, setRommanelPieces] = useState<RommanelPiece[]>([]);
  const [rommanelTotalPages, setRommanelTotalPages] = useState<number | undefined>(undefined);
  const [conflitoCliente, setConflitoCliente] = useState<{ file: File; clienteDoArquivo: ClienteId } | null>(null);
  const [arquivoPesado, setArquivoPesado] = useState<File | null>(null);

  // Apenas para o rótulo "último usado" — nunca pré-seleciona.
  useEffect(() => {
    setUltimoUsado(lerUltimoClienteUsado());
  }, []);

  // getCliente cai no padrão apenas como segurança de dados — nunca aparece como seleção.
  const clienteAtual = getCliente(cliente);
  const extracaoLiberada = cliente !== null && clienteAtual.extracaoPronta;

  const escolherCliente = (id: ClienteId) => {
    if (isExtracting) return;
    setCliente(id);
    setUltimoUsado(id);
    salvarClienteSelecionado(id);
  };

  const handleGerarNatura = async () => {
    setIsGeneratingNatura(true);
    try {
      await exportarPlanilhaNatura(pieces, fileName.replace(/\.pdf$/i, ""), currentEntryId, cliente ?? CLIENTE_PADRAO);
    } finally {
      setIsGeneratingNatura(false);
    }
  };


  const processOnePart = async (part: PdfPart, rules: string[] = []): Promise<Piece[]> => {
    const { data, error } = await supabase.functions.invoke("extract-pdf", {
      body: { pdfBase64: part.base64, fileName: part.name, rules },
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

  const processFile = useCallback(async (file: File, clienteOverride?: ClienteId) => {
    const clienteEfetivo = clienteOverride ?? cliente;
    if (!clienteEfetivo) return; // sem escolha explícita, nada é processado
    if (!getCliente(clienteEfetivo).extracaoPronta) {
      toast.error("A extração deste cliente ainda não está disponível.");
      return;
    }
    if (file.type !== "application/pdf") {
      toast.error("Apenas arquivos PDF são aceitos.");
      return;
    }

    if (file.size > LIMITE_ARQUIVO_MB * 1024 * 1024) {
      toast.error("Arquivo acima de 200MB — o navegador não dá conta de abrir um PDF desse tamanho.");
      return;
    }


    setFileName(file.name);
    setIsExtracting(true);
    setProgress(2);

    // Fluxo paralelo da Rommanel — partes em série, para não perder a seção.
    if (clienteEfetivo === "rommanel") {
      try {
        toast.info("Dividindo PDF em partes de até 10 páginas...");
        const { pieces: linhas, errors, totalPages, partesSubdivididas, paginasPesadas } =
          await extrairBookRommanel(file, (p) => {
            setProgress(p.progress);
            setProcessingFiles(p.partes);
          });
        if (partesSubdivididas > 0 || paginasPesadas > 0) {
          toast.info(
            `Fatiamento por peso: ${partesSubdivididas} parte(s) subdivididas` +
              (paginasPesadas > 0
                ? ` e ${paginasPesadas} página(s) pesada(s) enviadas isoladamente (podem falhar).`
                : "."),
            { duration: 10000 }
          );
        }
        setPieces([]);
        setRommanelPieces(linhas);
        setRommanelTotalPages(totalPages);

        if (errors.length > 0) {
          toast.error(
            `${errors.length} trecho(s) falharam — as peças desses trechos podem ter ficado sem Local de instalação.`,
            { duration: 12000 }
          );
        }

        if (linhas.length > 0 || errors.length > 0) {
          try {
            const entry = await saveToHistory(
              file.name,
              linhas as unknown as Piece[],
              errors,
              "rommanel"
            );
            setCurrentEntryId(entry.id);
            setHistoryRefreshKey((prev) => prev + 1);
            if (linhas.length > 0) {
              toast.success(`${linhas.length} linhas extraídas e salvas na nuvem!`);
            }
          } catch (saveErr) {
            console.error("Erro ao salvar histórico:", saveErr);
            setCurrentEntryId(null);
            toast.error("Não foi possível salvar no histórico — as linhas seguem na tela.", {
              duration: 15000,
            });
          }
        }
      } catch (err) {
        toast.error(
          `Erro ao extrair o book da Rommanel: ${err instanceof Error ? err.message : "erro desconhecido"}`
        );
      } finally {
        setIsExtracting(false);
        setTimeout(() => setProcessingFiles([]), 3000);
      }
      return;
    }

    try {
      toast.info("Dividindo PDF em partes de até 10 páginas...");
      const { parts, totalPages, partesSubdivididas, paginasPesadas } = await splitPdf(file);
      if (partesSubdivididas > 0 || paginasPesadas > 0) {
        toast.info(
          `Fatiamento por peso: ${partesSubdivididas} parte(s) subdivididas` +
            (paginasPesadas > 0
              ? ` e ${paginasPesadas} página(s) pesada(s) enviadas isoladamente (podem falhar).`
              : "."),
          { duration: 10000 }
        );
      }
      setProgress(10);

      const fileStatuses = parts.map((p) => ({ name: p.name, status: "pending" as const }));
      setProcessingFiles(fileStatuses);

      // Regras de leitura aprendidas com o usuário (alvo 'extracao'/'ambos').
      const extractionRules = await carregarRegras(clienteEfetivo, "extracao");

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
          const extracted = await processOnePart(parts[i], extractionRules);
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
              const extracted = await processOnePart(parts[index], extractionRules);
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
          const entry = await saveToHistory(file.name, finalPieces, partErrors, clienteEfetivo);
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
  }, [cliente]);

  /** Blindagem: se o nome do arquivo citar outro cliente, abre o diálogo antes de gastar IA. */
  const receberArquivo = useCallback((file: File) => {
    if (!cliente) return; // sem cliente escolhido, arrastar/soltar não faz nada
    const citado = clienteNoNomeDoArquivo(file.name);
    if (citado && citado !== cliente) {
      setConflitoCliente({ file, clienteDoArquivo: citado });
      return;
    }
    // Acima de 100MB não bloqueia, mas avisa antes: arquivos muito grandes
    // podem deixar o navegador lento.
    if (file.size > AVISO_ARQUIVO_MB * 1024 * 1024) {
      setArquivoPesado(file);
      return;
    }
    processFile(file);
  }, [cliente, processFile]);

  const resolverConflitoTrocando = useCallback(() => {
    if (!conflitoCliente) return;
    const { file, clienteDoArquivo } = conflitoCliente;
    setConflitoCliente(null);
    setCliente(clienteDoArquivo);
    salvarClienteSelecionado(clienteDoArquivo);
    processFile(file, clienteDoArquivo);
  }, [conflitoCliente, processFile]);

  const resolverConflitoMantendo = useCallback(() => {
    if (!conflitoCliente) return;
    const { file } = conflitoCliente;
    setConflitoCliente(null);
    processFile(file);
  }, [conflitoCliente, processFile]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    receberArquivo(file);
    e.target.value = "";
  }, [receberArquivo]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      receberArquivo(file);
    }
  }, [receberArquivo]);

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

  const handleLoadFromHistory = (
    loaded: Piece[],
    loadedName: string,
    entryId: string,
    entryCliente: ClienteId
  ) => {
    if (entryCliente === "rommanel") {
      // Extração da Rommanel — tela própria de revisão peça a peça.
      setPieces([]);
      setRommanelPieces(
        normalizarRommanelPieces(loaded as unknown as RommanelPiece[])
      );
      setRommanelTotalPages(undefined);
    } else {
      setRommanelPieces([]);
      setPieces(normalizePieces(loaded));
    }
    setFileName(loadedName);
    setCurrentEntryId(entryId);
    // A tabela na tela passa a ser do cliente daquela extração.
    escolherCliente(entryCliente);
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
    setRommanelPieces([]);
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
        {/* Título único da página */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-foreground">Extrair peças de um book</h1>
        </div>

        {/* Seletor de cliente em uma linha — único elemento acionável até haver escolha */}
        <div className="mb-8">
          <p className="mb-3 text-xs text-muted-foreground">Cliente</p>
          <div
            className={cn(
              "flex max-w-[640px] gap-3 overflow-x-auto rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
              cliente === null && "p-1 -m-1 ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
            )}
          >
            {LISTA_CLIENTES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => escolherCliente(c.id)}
                disabled={isExtracting}
                aria-pressed={cliente === c.id}
                className={cn(
                  "relative flex h-14 min-w-0 flex-1 items-center gap-3 rounded-xl border bg-card px-3 text-left shadow-soft transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
                  cliente === c.id ? "border-primary/40 bg-primary/5 ring-2 ring-primary" : "border-border"
                )}
              >
                <ClienteMark cliente={c.id} size={24} />
                <span className="min-w-0 truncate text-sm font-bold text-foreground">{c.nome}</span>
                {ultimoUsado === c.id && cliente !== c.id && (
                  <span className="absolute right-2 top-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    último usado
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>


        {/* Sem escolha de cliente: bloco calmo no lugar do upload */}
        {cliente === null && pieces.length === 0 && rommanelPieces.length === 0 && !isExtracting && (
          <Card className="mb-8">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-2 text-center">
              <p className="text-lg font-medium text-foreground">Escolha o cliente para começar</p>
              <p className="max-w-md text-sm text-muted-foreground">
                O cliente define o vocabulário de especificação, o formato da planilha e o
                aprendizado usado na extração.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Upload Area — só existe depois da escolha explícita do cliente */}
        {cliente !== null && pieces.length === 0 && rommanelPieces.length === 0 && !isExtracting && (
          <Card 
            className={`mb-8 border-dashed border-2 transition-colors ${
              isDragging && extracaoLiberada
                ? "border-primary bg-primary/5" 
                : "border-muted-foreground/25"
            }`}
            onDrop={extracaoLiberada ? handleDrop : (e) => e.preventDefault()}
            onDragOver={extracaoLiberada ? handleDragOver : (e) => e.preventDefault()}
            onDragLeave={extracaoLiberada ? handleDragLeave : undefined}
          >
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              {!extracaoLiberada ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <ClienteMark cliente={cliente} size={44} />
                  <p className="text-lg font-medium text-foreground">
                    Ainda não disponível para {clienteAtual.nome}
                  </p>
                  <p className="max-w-md text-sm text-muted-foreground">
                    A extração de books da {clienteAtual.nome} entra na próxima etapa. Por enquanto,
                    selecione outro cliente para extrair.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-1.5">
                    <ClienteMark cliente={cliente} size={20} />
                    <span className="text-sm font-semibold text-foreground">
                      Cliente: {clienteAtual.nome.toUpperCase()}
                    </span>
                  </div>
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
                    {!isDragging && (
                      <p className="text-xs text-muted-foreground">
                        PDFs longos são divididos automaticamente em partes de até 10 páginas.
                      </p>
                    )}
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
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Últimas extrações — recolhido por padrão, abaixo da área de envio */}
        <ExtractionHistory onLoad={handleLoadFromHistory} refreshKey={historyRefreshKey} />

        {/* Progress */}
        {isExtracting && (
          <Card className="mb-8">
            <CardContent className="py-8">
              <div className="flex flex-col gap-4 items-center">
                {cliente !== null && (
                  <div className="flex items-center gap-2 rounded-full bg-muted px-4 py-1.5">
                    <ClienteMark cliente={cliente} size={20} />
                    <span className="text-sm font-semibold text-foreground">
                      Extraindo como {clienteAtual.nome.toUpperCase()}
                    </span>
                  </div>
                )}
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
                        {f.status === "done" && <span className="text-success">✅</span>}
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
            <input
              id="adicionar-pdf-input"
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <ResultadosActionBar
              cliente={cliente ?? CLIENTE_PADRAO}
              clienteNome={clienteAtual.nome}
              titulo={fileName || "Extração"}
              resumo={`${pieces.length} peças`}
              primaria={{
                label: `Gerar Planilha Padrão ${clienteAtual.nome}`,
                onClick: handleGerarNatura,
                disabled: isGeneratingNatura || !clienteAtual.planilhaPronta,
                loading: isGeneratingNatura,
                title: clienteAtual.planilhaPronta
                  ? `Gerar Planilha Padrão ${clienteAtual.nome}`
                  : `A planilha da ${clienteAtual.nome} entra em uma próxima etapa.`,
              }}
              secundaria={{ label: "Baixar Excel", icon: Download, onClick: handleDownload }}
              menu={[
                {
                  label: "Adicionar PDF",
                  icon: Upload,
                  onClick: () => document.getElementById("adicionar-pdf-input")?.click(),
                },
                { label: "Adicionar linha", icon: Plus, onClick: addRow },
                {
                  label: "Salvar alterações no histórico",
                  icon: Save,
                  onClick: handleSaveToHistory,
                  disabled: !currentEntryId,
                  title: currentEntryId
                    ? "Atualizar a entrada do histórico com as peças da tela"
                    : "Nenhuma entrada do histórico carregada",
                },
                {
                  label: "Ensinar com minha planilha",
                  icon: GraduationCap,
                  onClick: () => setTeachOpen(true),
                  separadorAntes: true,
                },
              ]}
            />

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
                                <Check className="h-3.5 w-3.5 text-success" />
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

        {/* Revisão peça a peça — exclusiva da Rommanel */}
        {rommanelPieces.length > 0 && (
          <RevisaoRommanel
            pieces={rommanelPieces}
            fileName={fileName}
            entryId={currentEntryId}
            totalPages={rommanelTotalPages}
          />
        )}
      </div>

      <TeachDialog
        open={teachOpen}
        onOpenChange={setTeachOpen}
        extractionId={currentEntryId}
        cliente={cliente ?? CLIENTE_PADRAO}
      />

      {/* Blindagem: nome do arquivo cita um cliente diferente do selecionado */}
      <AlertDialog open={conflitoCliente !== null} onOpenChange={(aberto) => !aberto && setConflitoCliente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {conflitoCliente && <ClienteMark cliente={conflitoCliente.clienteDoArquivo} size={24} />}
              Esse book parece ser da {conflitoCliente ? getCliente(conflitoCliente.clienteDoArquivo).nome : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Você está com {clienteAtual.nome} selecionado. Extrair com o cliente errado usa o
              vocabulário de especificação errado e o aprendizado errado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={resolverConflitoMantendo}>
              Continuar com {clienteAtual.nome}
            </AlertDialogCancel>
            <AlertDialogAction onClick={resolverConflitoTrocando}>
              Trocar para {conflitoCliente ? getCliente(conflitoCliente.clienteDoArquivo).nome : ""} e extrair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Index;
