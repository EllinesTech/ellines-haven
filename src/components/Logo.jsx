// Uses the high-res icon with visible dark background
export default function Logo({ size = 38, className = '' }) {
  return (
    <img
      src="/pwa-icon-192.png"
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
        borderRadius: Math.round(size * 0.22),
      }}
    />
  );
}
