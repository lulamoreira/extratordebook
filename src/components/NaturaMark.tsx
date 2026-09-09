import naturaLogo from "@/assets/natura-logo.png";

interface Props {
  size?: number;
  className?: string;
}

export const NaturaMark = ({ size = 20, className = "" }: Props) => {
  return (
    <img
      src={naturaLogo}
      alt="Natura"
      draggable={false}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default NaturaMark;
