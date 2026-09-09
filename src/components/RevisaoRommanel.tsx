import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ClienteMark from "@/components/ClienteMark";
import RommanelRevisaoRow from "@/components/RommanelRevisaoRow";
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

const COLUNAS = [
  "Incluir",
  "Selo",
  "Página",
  "Local de instalação",
  "Kit",
  "Nome da Peça",
  "Tamanho",
  "Especificação",
  "Cores",
  "Quant",
  "Un. compra",
  "Coluna VAREJO",
  "Ações",
];

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

  const irParaLinha = (index: number) => {
    setDestaque(index);
    document
      .getElementById(`rommanel-linha-${index}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => setDestaque(null), 4000);
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

  return (
    <div className="pb-24">
      <datalist id="rommanel-locais">
        {locais.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">
            {fileName && <span className="text-muted-foreground">{fileName} — </span>}
            {linhas.length} linhas de peça
          </p>
          <p className="text-xs text-muted-foreground">
            {carregando
              ? "Conferindo o que já foi aprendido..."
              : `${recorrentes} recorrentes · ${linhas.length - recorrentes} novas`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={salvar} disabled={salvando || !entryId} className="gap-2">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar revisão
          </Button>
          <Button
            disabled
            className="gap-2"
            size="sm"
            variant="secondary"
            title="A planilha da Rommanel entra na próxima etapa. Revise as peças enquanto isso."
          >
            <ClienteMark cliente="rommanel" size={44} />
            Gerar Planilha Padrão Rommanel
          </Button>
        </div>
      </div>

      {/* Ações em lote */}
      <div className="mb-3 flex flex-wrap gap-2 rounded-xl bg-muted/50 p-2">
        <Button
          variant="outline"
          size="sm"
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
          Deixar Especificação em branco em todas as NOVAS
        </Button>
        <Button
          variant="outline"
          size="sm"
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
          Deixar Quant em branco em todas
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            emLote("Todas as linhas incluídas", (atual) =>
              atual.map((p) => ({ ...p, incluir: true }))
            )
          }
        >
          Incluir todas
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            emLote("Todas as linhas excluídas", (atual) =>
              atual.map((p) => ({ ...p, incluir: false }))
            )
          }
        >
          Excluir todas
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => aplicar((atual) => [...atual, novaLinhaRommanel()])}
        >
          <Plus className="h-4 w-4" />
          Adicionar linha
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUNAS.map((c) => (
                <TableHead key={c} className="whitespace-nowrap text-xs">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((p, i) => (
              <RommanelRevisaoRow
                key={i}
                piece={p}
                index={i}
                locais={locais}
                destacado={destaque === i}
                onPatch={onPatch}
                onToggleBranco={onToggleBranco}
                onDuplicar={onDuplicar}
                onExcluir={onExcluir}
                onMover={onMover}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Barra fixa: avisos + placar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur">
        {avisos.length > 0 && (
          <div className="max-h-28 overflow-y-auto border-b px-4 py-2">
            {avisos.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => irParaLinha(a.linha)}
                className="block text-left text-xs text-warning hover:underline"
              >
                ⚠ {a.mensagem}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          <p className={cn("text-sm font-semibold", placar.divergente && "text-destructive")}>
            {placar.linhas} linhas incluídas · {placar.unidades} unidades de compra (colunas da
            VAREJO) · {placar.dadosNf} linhas na DADOS NF
          </p>
          {sujo && (
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              alterações não salvas
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default RevisaoRommanel;
