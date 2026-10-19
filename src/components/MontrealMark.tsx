import montrealLogo from "@/assets/montreal-logo.png";

interface Props {
  size?: number;
  className?: string;
}

export const MontrealMark = ({ size = 20, className = "" }: Props) => {
  return (
    <img
      src={montrealLogo}
      alt="Montreal"
      draggable={false}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default MontrealMark;
