import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  Columns3,
  Plus,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ResultadosActionBar from "@/components/ResultadosActionBar";
import RommanelRevisaoRow, {
  type ColunasOpcionais,
} from "@/components/RommanelRevisaoRow";
import GerarRommanelDialog from "@/components/GerarRommanelDialog";
import { updateHistoryPieces } from "@/lib/historyStorage";
import type { Piece } from "@/data/extractedPieces";
import {
  novaLinhaRommanel,
  type CampoDecidivel,
  type RommanelPiece,
} from "@/data/rommanelPieces";
import {
  calcularAvisos,
  calcularPlacar,
  locaisSugeridos,
  marcarAprendizado,
} from "@/lib/rommanelRevisao";
import { cn } from "@/lib/utils";

export interface RevisaoRommanelProps {
  pieces: RommanelPiece[];
  fileName: string;
  entryId: string | null;
  /** Total de páginas do book, quando conhecido (usado nos avisos de página). */
  totalPages?: number;
  onPiecesChange?: (pieces: RommanelPiece[]) => void;
}

const COLUNAS_KEY = "revisao_rommanel_colunas";
const COLUNAS_PADRAO: ColunasOpcionais = { local: false, kit: false, cores: false, quant: false };

const lerColunas = (): ColunasOpcionais => {
  try {
    const bruto = localStorage.getItem(COLUNAS_KEY);
    if (!bruto) return COLUNAS_PADRAO;
    return { ...COLUNAS_PADRAO, ...JSON.parse(bruto) };
  } catch {
    return COLUNAS_PADRAO;
  }
};

/** Cabeçalho de coluna comum: fixo no topo da região rolável. */
const HeadFixa = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <TableHead className={cn("sticky top-0 z-20 whitespace-nowrap bg-card text-xs", className)}>
    {children}
  </TableHead>
);

export const RevisaoRommanel = ({
  pieces,
  fileName,
  entryId,
  totalPages,
  onPiecesChange,
}: RevisaoRommanelProps) => {
  const [linhas, setLinhas] = useState<RommanelPiece[]>(pieces);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [destaque, setDestaque] = useState<number | null>(null);
  const [gerarAberto, setGerarAberto] = useState(false);
  const [colunas, setColunas] = useState<ColunasOpcionais>(lerColunas);
  const [avisosAbertosManual, setAvisosAbertosManual] = useState<boolean | null>(null);

  // Marca RECORRENTE/NOVA e aplica a especificação já aprovada pelo usuário.
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    marcarAprendizado(pieces)
      .then((res) => {
        if (!ativo) return;
        setLinhas(res);
        setSujo(false);
      })
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [pieces]);

  // Aviso do navegador quando há alterações não salvas.
  useEffect(() => {
    if (!sujo) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [sujo]);

  const alternarColuna = (chave: keyof ColunasOpcionais, valor: boolean) => {
    setColunas((atual) => {
      const proximo = { ...atual, [chave]: valor };
      try {
        localStorage.setItem(COLUNAS_KEY, JSON.stringify(proximo));
      } catch {
        // Sem localStorage — vale só para esta sessão.
      }
      return proximo;
    });
  };

  const aplicar = useCallback(
    (fn: (atual: RommanelPiece[]) => RommanelPiece[]) => {
      setLinhas((atual) => {
        const proximo = fn(atual);
        onPiecesChange?.(proximo);
        return proximo;
      });
      setSujo(true);
    },
    [onPiecesChange]
  );

  /** Ação em lote com desfazer de 10 segundos no toast. */
  const emLote = (rotulo: string, fn: (atual: RommanelPiece[]) => RommanelPiece[]) => {
    const anterior = linhas;
    aplicar(fn);
    toast.success(rotulo, {
      duration: 10000,
      action: {
        label: "Desfazer",
        onClick: () => aplicar(() => anterior),
      },
    });
  };

  const onPatch = useCallback(
    (index: number, patch: Partial<RommanelPiece>) =>
      aplicar((atual) => atual.map((p, i) => (i === index ? { ...p, ...patch } : p))),
    [aplicar]
  );

  const onToggleBranco = useCallback(
    (index: number, campo: CampoDecidivel) =>
      aplicar((atual) =>
        atual.map((p, i) =>
          i === index
            ? {
                ...p,
                camposEmBranco: p.camposEmBranco.includes(campo)
                  ? p.camposEmBranco.filter((c) => c !== campo)
                  : [...p.camposEmBranco, campo],
              }
            : p
        )
      ),
    [aplicar]
  );

  const onDuplicar = useCallback(
    (index: number) =>
      aplicar((atual) => [
        ...atual.slice(0, index + 1),
        { ...atual[index] },
        ...atual.slice(index + 1),
      ]),
    [aplicar]
  );

  const onExcluir = useCallback(
    (index: number) => aplicar((atual) => atual.filter((_, i) => i !== index)),
    [aplicar]
  );

  const onMover = useCallback(
    (index: number, direcao: -1 | 1) =>
      aplicar((atual) => {
        const destino = index + direcao;
        if (destino < 0 || destino >= atual.length) return atual;
        const copia = [...atual];
        [copia[index], copia[destino]] = [copia[destino], copia[index]];
        return copia;
      }),
    [aplicar]
  );

  const locais = useMemo(() => locaisSugeridos(linhas), [linhas]);
  const avisos = useMemo(() => calcularAvisos(linhas, totalPages), [linhas, totalPages]);
  const placar = useMemo(() => calcularPlacar(linhas), [linhas]);
  const recorrentes = linhas.filter((p) => p.origemAprendizado === "recorrente").length;

  // Até três avisos a barra nasce aberta; mais que isso, fechada.
  const avisosAbertos = avisosAbertosManual ?? avisos.length <= 3;

  const irParaLinha = (index: number) => {
    setDestaque(index);
    document
      .getElementById(`rommanel-linha-${index}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setDestaque(null), 2000);
  };

  const salvar = async () => {
    if (!entryId) {
      toast.error("Esta extração não está no histórico — não há onde salvar a revisão.");
      return;
    }
    setSalvando(true);
    try {
      await updateHistoryPieces(entryId, linhas as unknown as Piece[], placar.linhas);
      setSujo(false);
      toast.success("Revisão salva!");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível salvar a revisão.");
    } finally {
      setSalvando(false);
    }
  };

  const estatistica = (
    rotulo: string,
    valor: number,
    alerta = false
  ) => (
    <span
      className={cn(
        "flex items-center gap-1 text-xs",
        alerta ? "font-semibold text-destructive" : "text-muted-foreground"
      )}
    >
      {alerta && <AlertTriangle className="h-3 w-3" />}
      {rotulo}
      <span className={cn("font-semibold tabular-nums", !alerta && "text-foreground")}>
        {valor}
      </span>
    </span>
  );

  return (
    <div className="pb-24">
      <GerarRommanelDialog
        open={gerarAberto}
        onOpenChange={setGerarAberto}
        pieces={linhas}
        fileName={fileName}
      />
      <datalist id="rommanel-locais">
        {locais.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      <ResultadosActionBar
        cliente="rommanel"
        clienteNome="Rommanel"
        titulo={fileName || "Revisão"}
        resumo={`${linhas.length} linhas de peça`}
        extra={
          <p className="text-xs text-muted-foreground tabular-nums">
            {carregando
              ? "Conferindo o que já foi aprendido..."
              : `${recorrentes} recorrentes · ${linhas.length - recorrentes} novas`}
          </p>
        }
        primaria={{
          label: "Gerar Planilha Padrão Rommanel",
          onClick: () => setGerarAberto(true),
          title: "Gera a pasta Excel a partir da campanha anterior",
        }}
        secundaria={{
          label: "Salvar revisão",
          icon: Save,
          onClick: salvar,
          disabled: salvando || !entryId,
          loading: salvando,
        }}
        menu={[
          {
            label: "Adicionar linha",
            icon: Plus,
            onClick: () => aplicar((atual) => [...atual, novaLinhaRommanel()]),
          },
        ]}
      />

      {/* Ações em lote recolhidas + seletor de colunas */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              Ações em lote
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem
              onClick={() =>
                emLote("Especificação em branco nas linhas novas", (atual) =>
                  atual.map((p) =>
                    p.origemAprendizado === "nova" && !p.camposEmBranco.includes("especificacao")
                      ? { ...p, camposEmBranco: [...p.camposEmBranco, "especificacao"] }
                      : p
                  )
                )
              }
            >
              Especificação em branco nas NOVAS
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                emLote("Quant em branco em todas as unidades de compra", (atual) =>
                  atual.map((p) =>
                    p.camposEmBranco.includes("quant")
                      ? p
                      : { ...p, camposEmBranco: [...p.camposEmBranco, "quant"] }
                  )
                )
              }
            >
              Quant em branco em todas
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() =>
                emLote("Todas as linhas incluídas", (atual) =>
                  atual.map((p) => ({ ...p, incluir: true }))
                )
              }
            >
              Incluir todas
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                emLote("Todas as linhas excluídas", (atual) =>
                  atual.map((p) => ({ ...p, incluir: false }))
                )
              }
            >
              Excluir todas
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Columns3 className="h-4 w-4" />
              Colunas
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuCheckboxItem
              checked={colunas.local}
              onCheckedChange={(v) => alternarColuna("local", v === true)}
              onSelect={(e) => e.preventDefault()}
            >
              Local de instalação
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={colunas.kit}
              onCheckedChange={(v) => alternarColuna("kit", v === true)}
              onSelect={(e) => e.preventDefault()}
            >
              Kit
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={colunas.cores}
              onCheckedChange={(v) => alternarColuna("cores", v === true)}
              onSelect={(e) => e.preventDefault()}
            >
              Cores
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={colunas.quant}
              onCheckedChange={(v) => alternarColuna("quant", v === true)}
              onSelect={(e) => e.preventDefault()}
            >
              Quant
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Tabela com cabeçalho fixo e duas colunas congeladas */}
      <div className="max-h-[65vh] overflow-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 top-0 z-30 w-10 min-w-10 bg-card text-xs" />
              <TableHead className="sticky left-10 top-0 z-30 min-w-[220px] whitespace-nowrap bg-card text-xs">
                Nome da Peça
              </TableHead>
              <HeadFixa>Página</HeadFixa>
              <HeadFixa>Tamanho</HeadFixa>
              <HeadFixa>Especificação</HeadFixa>
              <HeadFixa>Un. compra</HeadFixa>
              <HeadFixa>Coluna VAREJO</HeadFixa>
              {colunas.local && <HeadFixa>Local de instalação</HeadFixa>}
              {colunas.kit && <HeadFixa>Kit</HeadFixa>}
              {colunas.cores && <HeadFixa>Cores</HeadFixa>}
              {colunas.quant && <HeadFixa>Quant</HeadFixa>}
              <HeadFixa>Ações</HeadFixa>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((p, i) => {
              const kitAtual = p.kit.trim();
              const mesmoKitAnterior =
                i > 0 && kitAtual !== "" && linhas[i - 1].kit.trim() === kitAtual;
              return (
                <RommanelRevisaoRow
                  key={i}
                  piece={p}
                  index={i}
                  locais={locais}
                  destacado={destaque === i}
                  zebra={i % 2 === 1}
                  kitRotulo={kitAtual !== "" && !mesmoKitAnterior ? p.kit : null}
                  kitFilha={mesmoKitAnterior}
                  visivel={colunas}
                  onPatch={onPatch}
                  onToggleBranco={onToggleBranco}
                  onDuplicar={onDuplicar}
                  onExcluir={onExcluir}
                  onMover={onMover}
                />
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Barra fixa: avisos compactos + placar legível */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur">
        {avisos.length > 0 && (
          <div className="border-b px-4 py-1.5">
            <button
              type="button"
              onClick={() => setAvisosAbertosManual(!avisosAbertos)}
              aria-expanded={avisosAbertos}
              className="flex w-full items-center gap-2 rounded-md text-left text-xs text-warning transition-colors duration-150 hover:text-warning/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="font-semibold tabular-nums">
                {avisos.length} avisos de consistência
              </span>
              <ChevronDown
                className={cn(
                  "ml-auto h-3.5 w-3.5 transition-transform duration-150",
                  avisosAbertos && "rotate-180"
                )}
              />
            </button>
            {avisosAbertos && (
              <div className="mt-1 max-h-28 overflow-y-auto">
                {avisos.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => irParaLinha(a.linha)}
                    className="block rounded text-left text-xs text-warning transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {a.mensagem}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {estatistica("Linhas incluídas", placar.linhas)}
            <span className="text-muted-foreground/50">·</span>
            {estatistica("Unidades de compra", placar.unidades, placar.divergente)}
            <span className="text-muted-foreground/50">·</span>
            {estatistica("Linhas na DADOS NF", placar.dadosNf, placar.divergente)}
          </div>
          {sujo && (
            <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-warning" />
              alterações não salvas
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default RevisaoRommanel;
