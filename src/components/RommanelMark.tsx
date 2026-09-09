import rommanelLogo from "@/assets/rommanel-logo.png";

interface Props {
  size?: number;
  className?: string;
}

export const RommanelMark = ({ size = 20, className = "" }: Props) => {
  return (
    <img
      src={rommanelLogo}
      alt="Rommanel"
      draggable={false}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default RommanelMark;
