import { webpSrc, onCoverImageLoad } from '../utils/bookCovers';

/** Drop-in cover <picture> with WebP + landscape front-crop. */
export default function CoverImage({
  src,
  alt = '',
  className,
  priority = false,
  onLoad,
  ...rest
}) {
  if (!src) return null;
  const webp = webpSrc(src);

  return (
    <picture>
      {webp && <source srcSet={webp} type="image/webp" />}
      <img
        src={src}
        alt={alt}
        className={className}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={(e) => {
          onCoverImageLoad(e);
          onLoad?.(e);
        }}
        {...rest}
      />
    </picture>
  );
}
