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
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  GraduationCap,
  History,
  Loader2,
  MoreVertical,
  Pencil,
  Search,
  Trash2,
  X,
} from "lucide-react";
import ClienteMark from "@/components/ClienteMark";
import TeachDialog from "@/components/TeachDialog";
import { toast } from "sonner";
import { exportarPlanilhaNatura } from "@/lib/naturaExport";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LISTA_CLIENTES, getCliente, type ClienteId } from "@/lib/clientes";
import { cn } from "@/lib/utils";
import { type Cobertura, faixasNaturais } from "@/lib/pageCoverage";

type FiltroCliente = ClienteId | "todos";

interface Props {
  onLoad: (pieces: Piece[], fileName: string, entryId: string, cliente: ClienteId, cobertura?: Cobertura) => void;
  refreshKey: number;
}

const ABERTO_KEY = "historico_aberto";

const lerAberto = (): boolean => {
  try {
    return localStorage.getItem(ABERTO_KEY) === "1";
  } catch {
    return false;
  }
};

const ExtractionHistory = ({ onLoad, refreshKey }: Props) => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState("");
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [teachId, setTeachId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroCliente>("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<boolean>(lerAberto);

  const alternarAberto = (valor: boolean) => {
    setAberto(valor);
    try {
      localStorage.setItem(ABERTO_KEY, valor ? "1" : "0");
    } catch {
      // Ambiente sem localStorage — vale só para esta sessão.
    }
  };

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
      onLoad(pieces, entry.nickname || entry.fileName, entry.id, entry.cliente, entry.cobertura);
      // Ao abrir uma extração, o trabalho passa a ser a tabela — recolhe o histórico.
      alternarAberto(false);
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
      await exportarPlanilhaNatura(pieces, entryLabel(entry), entry.id, entry.cliente);
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

  const contar = (id: FiltroCliente) =>
    id === "todos" ? history.length : history.filter((e) => e.cliente === id).length;

  const termo = busca.trim().toLowerCase();
  const porCliente = filtro === "todos" ? history : history.filter((e) => e.cliente === filtro);
  const visiveis = termo
    ? porCliente.filter((e) => entryLabel(e).toLowerCase().includes(termo))
    : porCliente;

  const opcoesFiltro = [{ id: "todos", nome: "Todos" }, ...LISTA_CLIENTES] as {
    id: FiltroCliente;
    nome: string;
  }[];

  return (
    <Collapsible open={aberto} onOpenChange={alternarAberto} className="mb-8">
      <Card>
        {/* Cabeçalho sempre visível — a linha inteira abre/fecha */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-lg px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary md:px-6"
          >
            <span className="flex items-center gap-2 text-base font-bold text-foreground">
              <History className="h-4 w-4 text-muted-foreground" />
              Últimas extrações
              {!isLoading && (
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  ({history.length})
                </span>
              )}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                aberto && "rotate-180"
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="data-[state=closed]:animate-none">
          <div className="space-y-3 px-4 pb-4 md:px-6">
            {/* Busca + filtros por cliente com contagem (sem vermelho) */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome"
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {opcoesFiltro.map((op) => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setFiltro(op.id)}
                    className={cn(
                      "h-7 rounded-full border px-3 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      filtro === op.id
                        ? "border-border bg-muted font-semibold text-foreground"
                        : "border-transparent text-muted-foreground hover:bg-muted/60"
                    )}
                  >
                    {op.nome}{" "}
                    <span className="tabular-nums">({contar(op.id)})</span>
                  </button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : visiveis.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-8 text-center">
                <History className="h-8 w-8 text-muted-foreground/40" />
                {history.length === 0 ? (
                  <>
                    <p className="text-sm font-medium text-foreground">Nenhuma extração ainda</p>
                    <p className="text-xs text-muted-foreground">
                      Escolha um cliente e envie um PDF para começar.
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {termo ? "Nenhuma extração com esse nome" : "Nenhuma extração deste cliente"}
                  </p>
                )}
              </div>
            ) : (
              visiveis.map((entry) => {
                const cli = getCliente(entry.cliente);
                return (
                  <div key={entry.id} className="space-y-0">
                    {editingId === entry.id ? (
                      <div className="flex items-center gap-1 rounded-md px-2 py-2">
                        <ClienteMark cliente={entry.cliente} size={18} />
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
                      <div className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-150 hover:bg-muted">
                        <ClienteMark cliente={entry.cliente} size={18} />
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                          {entryLabel(entry)}
                        </p>
                        <span className="hidden whitespace-nowrap text-xs text-muted-foreground tabular-nums sm:inline">
                          {entry.pieceCount} peças
                          {entry.errors && entry.errors.length > 0 && (
                            <span className="ml-1 text-destructive">
                              · {entry.errors.length} falha(s)
                            </span>
                          )}
                          {" · "}
                          {format(new Date(entry.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                        {(entry.cobertura?.paginasFaltando.length || (entry.errors && entry.errors.length > 0)) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => toggleErrors(entry.id)}
                            title={entry.cobertura?.paginasFaltando.length ? `Páginas não lidas: ${faixasNaturais(entry.cobertura.paginasFaltando)}` : "Ver relatório de erros"}
                            aria-label="Ver páginas não lidas e relatório de erros"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={() => handleOpen(entry)}
                          disabled={busyId === entry.id}
                        >
                          {busyId === entry.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            "Abrir"
                          )}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={`Ações de ${entryLabel(entry)}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => downloadEntry(entry)}
                              disabled={busyId === entry.id}
                            >
                              <Download className="h-4 w-4" />
                              Baixar Excel
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => generateNatura(entry)}
                              disabled={busyId === entry.id || !cli.planilhaPronta}
                            >
                              <FileSpreadsheet className="h-4 w-4" />
                              Gerar Planilha Padrão {cli.nome}
                            </DropdownMenuItem>
                            {entry.cliente === "rommanel" && (
                              <DropdownMenuItem
                                className="gap-2"
                                onClick={() => handleOpen(entry)}
                                disabled={busyId === entry.id}
                              >
                                <ClipboardCheck className="h-4 w-4" />
                                Revisar peça a peça
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="gap-2" onClick={() => setTeachId(entry.id)}>
                              <GraduationCap className="h-4 w-4" />
                              Ensinar com minha planilha
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2" onClick={() => startRename(entry)}>
                              <Pencil className="h-4 w-4" />
                              Renomear
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="gap-2 text-destructive focus:text-destructive"
                              onClick={() => handleDelete(entry.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                              Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}

                    {/* Error Report */}
                    {expandedErrors.has(entry.id) && !!entry.cobertura?.paginasFaltando.length && <p className="px-3 py-2 text-sm text-warning">Páginas não lidas: {faixasNaturais(entry.cobertura.paginasFaltando)}. Pode haver peças faltando.</p>}
                    {entry.errors && entry.errors.length > 0 && expandedErrors.has(entry.id) && (
                      <div className="ml-6 mb-1 mt-1 space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-destructive">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Relatório de falhas ({entry.errors.length} parte
                          {entry.errors.length > 1 ? "s" : ""})
                        </div>
                        {entry.errors.map((err, idx) => (
                          <div key={idx} className="border-t border-destructive/20 pt-1.5">
                            <div className="font-medium text-foreground">{err.partName}</div>
                            <div className="text-muted-foreground">Páginas: {err.pages}</div>
                            <div className="text-muted-foreground">Erro: {err.errorMessage}</div>
                            <div className="mt-1 italic text-foreground/80">
                              💡 {getDiagnosis(err.errorMessage)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CollapsibleContent>
      </Card>

      <TeachDialog
        open={teachId !== null}
        onOpenChange={(open) => !open && setTeachId(null)}
        extractionId={teachId}
        cliente={history.find((e) => e.id === teachId)?.cliente ?? "natura"}
        onGenerateNatura={
          teachId
            ? async () => {
                const entry = history.find((e) => e.id === teachId);
                if (!entry) throw new Error("Extração não encontrada.");
                await generateNatura(entry);
              }
            : undefined
        }
      />
    </Collapsible>
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
