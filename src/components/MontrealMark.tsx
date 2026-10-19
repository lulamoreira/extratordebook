import montrealLogo from "@/assets/montreal-logo.png.asset.json";

interface Props {
  size?: number;
  className?: string;
}

export const MontrealMark = ({ size = 20, className = "" }: Props) => {
  return (
    <img
      src={montrealLogo.url}
      alt="Montreal"
      draggable={false}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default MontrealMark;
