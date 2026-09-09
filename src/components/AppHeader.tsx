import { useEffect, useState } from "react";
import { GraduationCap, Home } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";
import { contarAprendizado } from "@/lib/specLearning";

export interface AppHeaderProps {
  /** Resets the screen back to the initial upload + history view. */
  onGoHome?: () => void;
  /** Disables the action while an extraction is running. */
  busy?: boolean;
  className?: string;
}

export const AppHeader = ({ onGoHome, busy = false, className }: AppHeaderProps) => {
  const tooltip = busy ? "Aguarde a extração terminar" : "Voltar ao início";
  const navigate = useNavigate();
  const location = useLocation();
  const [aprendizado, setAprendizado] = useState(0);

  useEffect(() => {
    let ativo = true;
    contarAprendizado()
      .then((n) => ativo && setAprendizado(n))
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [location.pathname]);

  const handleClick = () => {
    if (busy) return;
    if (location.pathname !== "/") {
      navigate("/");
      return;
    }
    onGoHome?.();
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-16 w-full bg-card shadow-soft",
        className
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          title={tooltip}
          aria-label={tooltip}
          className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Logo size={34} showWordmark />
        </button>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate("/aprendizado")}
            disabled={busy}
            title="Aprendizado"
            className="gap-2"
          >
            <GraduationCap className="h-4 w-4" />
            <span className="hidden sm:inline">Aprendizado</span>
            {aprendizado > 0 && (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                {aprendizado}
              </span>
            )}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleClick}
            disabled={busy}
            title={tooltip}
            className="gap-2"
          >
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Início</span>
          </Button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
