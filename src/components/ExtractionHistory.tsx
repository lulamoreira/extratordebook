import { useState, useEffect, useCallback } from "react";
import { type Piece, classificarTipo } from "@/data/extractedPieces";
import {
  getHistory,
  getEntryPieces,
  updateNickname,
  deleteHistoryEntry,
  type HistoryEntry,
} from "@/lib/historyStorage";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Download,
  Pencil,
  Check,
  X,
  Trash2,
  History,
  FileSpreadsheet,
  AlertTriangle,
  Sparkles,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { exportarPlanilhaNatura } from "@/lib/naturaExport";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Logo from "@/components/Logo";

interface Props {
  onLoad: (pieces: Piece[], fileName: string, entryId: string) => void;
  refreshKey: number;
}

const ExtractionHistory = ({ onLoad, refreshKey }: Props) => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async (showSpinner = false) => {
    if (showSpinner) setIsLoading(true);
    try {
      setHistory(await getHistory());
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
      toast.error("Não foi possível carregar o histórico da nuvem.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload(true);
  }, [refreshKey, reload]);

  const entryLabel = (entry: HistoryEntry) =>
    entry.nickname || entry.fileName.replace(/\.pdf$/i, "");

  const handleOpen = async (entry: HistoryEntry) => {
    setBusyId(entry.id);
    try {
      const pieces = await getEntryPieces(entry.id);
      onLoad(pieces, entry.nickname || entry.fileName, entry.id);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível carregar as peças desta extração.");
    } finally {
      setBusyId(null);
    }
  };

  const generateNatura = async (entry: HistoryEntry) => {
    setBusyId(entry.id);
    try {
      const pieces = await getEntryPieces(entry.id);
      await exportarPlanilhaNatura(pieces, entryLabel(entry));
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível gerar a planilha padrão Natura.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleErrors = (id: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startRename = (entry: HistoryEntry) => {
    setEditingId(entry.id);
    setNicknameInput(entryLabel(entry));
  };

  const saveNickname = async (id: string) => {
    try {
      await updateNickname(id, nicknameInput);
      await reload();
      setEditingId(null);
      toast.success("Apelido salvo!");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar o apelido.");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteHistoryEntry(id);
      await reload();
      toast.info("Entrada removida do histórico");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível remover a entrada.");
    }
  };

  const downloadEntry = async (entry: HistoryEntry) => {
    setBusyId(entry.id);
    try {
      const pieces = await getEntryPieces(entry.id);
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
        { wch: 8 }, { wch: 35 }, { wch: 55 }, { wch: 35 },
        { wch: 18 }, { wch: 20 }, { wch: 70 }, { wch: 8 },
      ];
      const wb = XLSX.utils.book_new();
      const sheetName = entryLabel(entry).slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${sheetName}_Extração.xlsx`);
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível baixar o Excel desta extração.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <History className="h-4 w-4 text-muted-foreground" />
          Últimas extrações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="opacity-30 grayscale">
              <Logo size={40} />
            </div>
            <p className="text-sm text-muted-foreground">
              Nenhuma extração ainda — envie um PDF para começar
            </p>
          </div>
        ) : (
          history.map((entry) => (
            <div key={entry.id} className="space-y-0">
              <div className="group flex items-center gap-2 rounded-md bg-background px-3 py-2 transition-colors hover:bg-muted">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" />

                {editingId === entry.id ? (
                  <div className="flex flex-1 items-center gap-1">
                    <Input
                      value={nicknameInput}
                      onChange={(e) => setNicknameInput(e.target.value)}
                      className="h-7 text-xs"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && saveNickname(entry.id)}
                    />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveNickname(entry.id)}>
                      <Check className="h-3.5 w-3.5 text-success" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}>
                      <X className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => handleOpen(entry)}
                      disabled={busyId === entry.id}
                      className="flex-1 cursor-pointer truncate text-left text-sm font-semibold hover:underline disabled:opacity-60"
                    >
                      {entryLabel(entry)}
                    </button>
                    <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
                      {entry.pieceCount} peças
                      {entry.errors && entry.errors.length > 0 && (
                        <span className="ml-1 text-destructive">· {entry.errors.length} falha(s)</span>
                      )}
                      {" · "}
                      {format(new Date(entry.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </>
                )}

                {editingId !== entry.id && (
                  <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    {entry.errors && entry.errors.length > 0 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleErrors(entry.id)} title="Ver relatório de erros">
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => downloadEntry(entry)}
                      disabled={busyId === entry.id}
                      title="Baixar Excel"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => generateNatura(entry)}
                      disabled={busyId === entry.id}
                      title="Gerar Planilha Padrão Natura"
                    >
                      {busyId === entry.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                      )}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startRename(entry)} title="Renomear">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(entry.id)} title="Remover">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Error Report */}
              {entry.errors && entry.errors.length > 0 && expandedErrors.has(entry.id) && (
                <div className="ml-6 mb-1 mt-1 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Relatório de falhas ({entry.errors.length} parte{entry.errors.length > 1 ? "s" : ""})
                  </div>
                  {entry.errors.map((err, idx) => (
                    <div key={idx} className="border-t border-destructive/20 pt-1.5">
                      <div className="font-medium text-foreground">{err.partName}</div>
                      <div className="text-muted-foreground">Páginas: {err.pages}</div>
                      <div className="text-muted-foreground">Erro: {err.errorMessage}</div>
                      <div className="mt-1 italic text-foreground/80">💡 {getDiagnosis(err.errorMessage)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

function getDiagnosis(errorMsg: string): string {
  const msg = errorMsg.toLowerCase();
  if (msg.includes("429") || msg.includes("limite") || msg.includes("rate"))
    return "Limite de requisições excedido. Aguarde alguns minutos e tente novamente.";
  if (msg.includes("402") || msg.includes("crédito"))
    return "Créditos insuficientes. Adicione créditos ao workspace.";
  if (msg.includes("timeout") || msg.includes("tempo"))
    return "Processamento demorou demais. Tente um PDF com menos páginas ou imagens mais leves.";
  if (msg.includes("nenhuma peça"))
    return "A IA não encontrou peças nesta parte. Verifique se as páginas contêm peças gráficas visíveis.";
  return "Erro inesperado. Tente reenviar o PDF ou divida-o manualmente em partes menores.";
}

export default ExtractionHistory;
