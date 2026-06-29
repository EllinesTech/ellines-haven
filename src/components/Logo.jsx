// Uses the real logo from /public
export default function Logo({ size = 38, className = '' }) {
  return (
    <img
      src="/logo-icon.png"
      alt="Ellines Haven"
      className={`ellines-logo ${className}`}
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
      }}
    />
  );
}
