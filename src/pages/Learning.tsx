import { useCallback, useEffect, useMemo, useState } from "react";
import { GraduationCap, Loader2, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import AppHeader from "@/components/AppHeader";
import Logo from "@/components/Logo";
import TeachDialog from "@/components/TeachDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import ClienteMark from "@/components/ClienteMark";
import { LISTA_CLIENTES, lerClienteSalvo, type ClienteId } from "@/lib/clientes";
import {
  excluirExemplo,
  excluirTodosExemplos,
  listarExemplos,
  normalizar,
  type SpecExample,
  type Tipo,
} from "@/lib/specLearning";

type FiltroCliente = ClienteId | "todos";


const ORIGEM_LABEL: Record<string, string> = {
  comparacao_planilha: "Planilha",
  comparacao_book: "Book",
  gabarito: "Gabarito",
};

const ALVO_LABEL: Record<string, string> = {
  extracao: "Extração",
  redacao: "Redação",
  ambos: "Extração e redação",
};

const Learning = () => {
  const [itens, setItens] = useState<SpecExample[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Tipo>("exemplo");
  const [teachOpen, setTeachOpen] = useState(false);
  const [filtro, setFiltro] = useState<FiltroCliente>("todos");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setItens(await listarExemplos("todos"));
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível carregar o aprendizado.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const porCliente = useMemo(() => {
    const mapa = new Map<ClienteId, number>();
    for (const i of itens) mapa.set(i.cliente, (mapa.get(i.cliente) ?? 0) + 1);
    return mapa;
  }, [itens]);

  const doFiltro = useMemo(
    () => (filtro === "todos" ? itens : itens.filter((i) => i.cliente === filtro)),
    [itens, filtro]
  );

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    return doFiltro
      .filter((i) => i.tipo === aba)
      .filter((i) =>
        !termo
          ? true
          : normalizar(`${i.item} ${i.nome} ${i.grupo} ${i.especificacaoCorreta}`).includes(termo)
      );
  }, [doFiltro, aba, busca]);

  const remover = async (id: string) => {
    try {
      await excluirExemplo(id);
      setItens((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível excluir.");
    }
  };

  const removerTudo = async () => {
    try {
      // Respeita o filtro ativo: nunca apaga os dois clientes sem escolha explícita.
      await excluirTodosExemplos(filtro);
      setItens((prev) => (filtro === "todos" ? [] : prev.filter((i) => i.cliente !== filtro)));
      toast.success("Aprendizado apagado.");
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível apagar o aprendizado.");
    }
  };


  const vazio = (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="opacity-30 grayscale">
        <Logo size={48} />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">
        {aba === "regra"
          ? "Nenhuma regra aprendida ainda — edite uma planilha gerada e use 'Ensinar com minha planilha'."
          : "Nenhuma especificação aprendida ainda — edite uma planilha gerada e use 'Ensinar com minha planilha'."}
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-extrabold text-foreground">
              <GraduationCap className="h-6 w-6 text-primary" />
              Aprendizado
            </h1>
            <p className="text-sm text-muted-foreground">
              O que o app aprendeu com as suas planilhas.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button
                variant={filtro === "todos" ? "default" : "secondary"}
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setFiltro("todos")}
              >
                Todos ({itens.length})
              </Button>
              {LISTA_CLIENTES.map((c) => (
                <Button
                  key={c.id}
                  variant={filtro === c.id ? "default" : "secondary"}
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => setFiltro(c.id)}
                >
                  <ClienteMark cliente={c.id} size={16} />
                  {c.nome} ({porCliente.get(c.id) ?? 0})
                </Button>
              ))}
            </div>
          </div>


          <div className="flex items-center gap-2">
            <Button onClick={() => setTeachOpen(true)} className="gap-2">
              <Upload className="h-4 w-4" />
              Enviar planilha de referência
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2" disabled={doFiltro.length === 0}>
                  <Trash2 className="h-4 w-4" />
                  Apagar todo o aprendizado
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {filtro === "todos"
                      ? "Apagar o aprendizado de TODOS os clientes?"
                      : `Apagar o aprendizado de ${LISTA_CLIENTES.find((c) => c.id === filtro)?.nome}?`}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {filtro === "todos"
                      ? `Serão removidas todas as ${itens.length} especificações e regras de Natura e Rommanel. Não é possível desfazer.`
                      : `Serão removidas ${doFiltro.length} especificações e regras apenas deste cliente. O aprendizado dos outros clientes continua intacto. Não é possível desfazer.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={removerTudo}>Apagar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="rounded-xl bg-card p-4 shadow-soft md:p-6">
          <Tabs value={aba} onValueChange={(v) => setAba(v as Tipo)}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="exemplo">Especificações</TabsTrigger>
                <TabsTrigger value="regra">Regras</TabsTrigger>
              </TabsList>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar..."
                  className="pl-8"
                />
              </div>
            </div>

            <TabsContent value={aba} forceMount>
              {carregando ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                  ))}
                </div>
              ) : filtrados.length === 0 ? (
                vazio
              ) : (
                <ul className="space-y-2">
                  {filtrados.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-start justify-between gap-3 rounded-lg bg-muted/40 p-3"
                    >
                      <div className="min-w-0">
                        {i.tipo === "exemplo" && (
                          <p className="text-sm font-semibold text-foreground">
                            {i.item || "—"}
                            {i.formato && (
                              <span className="font-normal text-muted-foreground"> · {i.formato}</span>
                            )}
                          </p>
                        )}
                        <p className="whitespace-pre-line break-words text-xs text-foreground">
                          {i.especificacaoCorreta}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <Badge variant="secondary" className="text-[10px]">
                            {ORIGEM_LABEL[i.origem] ?? i.origem}
                          </Badge>
                          {i.tipo === "regra" && (
                            <Badge variant="secondary" className="text-[10px]">
                              {ALVO_LABEL[i.alvo] ?? i.alvo}
                            </Badge>
                          )}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => remover(i.id)}
                        title="Excluir"
                        aria-label="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <TeachDialog
        open={teachOpen}
        onOpenChange={setTeachOpen}
        somenteGabarito
        onLearned={carregar}
      />
    </div>
  );
};

export default Learning;
