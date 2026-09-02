import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { migrateLocalHistory } from "@/lib/historyStorage";
import Logo from "@/components/Logo";

interface SessionProviderProps {
  children: ReactNode;
}

/**
 * Ensures a (anonymous) cloud session exists before rendering the app,
 * so every history read/write is scoped to this browser's user.
 */
export const SessionProvider = ({ children }: SessionProviderProps) => {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          const { error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
        }
        if (cancelled) return;
        setReady(true);
        // Best effort: never blocks the app.
        migrateLocalHistory().catch((err) => console.warn("Migração de histórico:", err));
      } catch (err) {
        console.error("Falha ao iniciar sessão na nuvem:", err);
        if (!cancelled) setFailed(true);
      }
    };

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <Logo size={44} showWordmark />
        <p className="max-w-sm text-sm font-medium text-destructive">
          Não foi possível conectar ao armazenamento em nuvem — recarregue a página
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <div className="animate-pulse">
          <Logo size={44} showWordmark />
        </div>
        <p className="text-xs text-muted-foreground">Conectando...</p>
      </div>
    );
  }

  return <>{children}</>;
};

export default SessionProvider;
