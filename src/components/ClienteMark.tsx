import NaturaMark from "@/components/NaturaMark";
import RommanelMark from "@/components/RommanelMark";
import type { ClienteId } from "@/lib/clientes";

export interface ClienteMarkProps {
  cliente: ClienteId;
  size?: number;
  className?: string;
}

/** Marca visual do cliente — use SEMPRE este componente na interface. */
export const ClienteMark = ({ cliente, size = 20, className }: ClienteMarkProps) => {
  if (cliente === "rommanel") return <RommanelMark size={size} className={className} />;
  return <NaturaMark size={size} className={className} />;
};

export default ClienteMark;
