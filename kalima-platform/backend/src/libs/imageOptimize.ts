import sharp from "sharp";

// Shared image downsizing for public, non-sensitive images (product thumbnails
// and galleries, sample thumbnails, e-booklet covers). Uploaded originals are
// often 2000+ px PNGs of 4-6 MB while they are shown at a few hundred pixels.
// Payment receipts and buyer-supplied required-field images must NOT go through
// this: they need to stay as the buyer uploaded them.

export interface OptimizeOptions {
  /** Longest allowed width in px. Smaller images are never enlarged. */
  maxWidth: number;
  /** WebP quality 1-100. Default 85. */
  quality?: number;
}

export interface OptimizedImage {
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  /** false when the input was returned untouched (svg/gif or not worth it). */
  changed: boolean;
}

// Already small files are left alone: re-encoding them gains nothing and every
// re-encode costs a little quality.
const MIN_SIZE_WORTH_OPTIMIZING = 150 * 1024;

export async function optimizeImage(
  input: Buffer,
  mimeType: string,
  options: OptimizeOptions,
): Promise<OptimizedImage> {
  // SVG is already vector; GIF may be animated and sharp would flatten it.
  if (mimeType === "image/svg+xml" || mimeType === "image/gif") {
    return { buffer: input, mimeType, extension: "", width: 0, height: 0, changed: false };
  }

  // Default sharp strictness on purpose: a truncated or damaged image must fail
  // here (the caller answers 400) instead of being stored as a half-image.
  const image = sharp(input);
  const metadata = await image.metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (input.length < MIN_SIZE_WORTH_OPTIMIZING && width <= options.maxWidth) {
    // Still decode it once: a damaged small image must be rejected like a big one,
    // not stored as-is for the buyer/admin to discover later.
    await sharp(input).stats();
    return { buffer: input, mimeType, extension: "", width, height, changed: false };
  }

  const output = await image
    .rotate() // apply EXIF orientation, then drop the tag
    .resize({ width: options.maxWidth, withoutEnlargement: true })
    .webp({ quality: options.quality ?? 85 })
    .toBuffer({ resolveWithObject: true });

  // Never make a file bigger (e.g. an already well-compressed small WebP).
  if (output.data.length >= input.length && width <= options.maxWidth) {
    return { buffer: input, mimeType, extension: "", width, height, changed: false };
  }

  return {
    buffer: output.data,
    mimeType: "image/webp",
    extension: ".webp",
    width: output.info.width,
    height: output.info.height,
    changed: true,
  };
}

/** Sizes used across the platform, in one place. */
export const IMAGE_SIZES = {
  productThumbnail: { maxWidth: 1000, quality: 85 },
  productGallery: { maxWidth: 1400, quality: 82 },
  sampleThumbnail: { maxWidth: 1000, quality: 85 },
  eBookletCover: { maxWidth: 1000, quality: 85 },
  // Payment receipts keep more resolution: account numbers and amounts must stay readable.
  paymentReceipt: { maxWidth: 1600, quality: 85 },
} as const;
