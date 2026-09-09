interface Props {
  size?: number;
  className?: string;
}

export const NaturaMark = ({ size = 20, className = "" }: Props) => {
  return (
    <img
      src="/src/assets/natura-logo.png"
      alt="Natura"
      draggable={false}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default NaturaMark;
