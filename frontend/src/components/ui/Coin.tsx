type Props = {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
};

/** The gold coin motif: LEVee's visual stand-in for money moving. */
export default function Coin({ size = 40, className = "", style }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      style={style}
      aria-hidden
    >
      <ellipse cx="26" cy="25" rx="18" ry="19" fill="#c28a0e" />
      <ellipse cx="22" cy="23" rx="18" ry="19" fill="#ffc439" stroke="#c28a0e" strokeWidth="1.5" />
      <ellipse cx="22" cy="23" rx="12" ry="13" fill="none" stroke="#e8a317" strokeWidth="2" />
      <path d="M14 14 q4 -5 10 -5" stroke="#fff6b0" strokeWidth="3" strokeLinecap="round" fill="none" />
    </svg>
  );
}
