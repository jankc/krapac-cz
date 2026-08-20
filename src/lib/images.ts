import manifestJson from '../../content/images-manifest.json';

/** A gallery photo stored in R2, described by the committed manifest. */
export interface GalleryPhoto {
  /** Object key in the R2 bucket, e.g. "galleries/lfs/photo.jpg". */
  path: string;
  width: number;
  height: number;
}

interface ManifestEntry {
  width: number;
  height: number;
  hash: string;
  synced: boolean;
}

const manifest = manifestJson as Record<string, ManifestEntry>;

export const IMAGE_CDN_BASE =
  import.meta.env.PUBLIC_IMAGE_CDN ?? 'https://img.krapac.cz';

export interface TransformOptions {
  width: number;
  quality?: number;
  format?: string;
}

// Cloudflare Image Transformations URL. `fit=scale-down` never upscales past
// the original; `format=auto` negotiates AVIF/WebP via the Accept header.
export const cdnUrl = (
  path: string,
  { width, quality = 82, format = 'auto' }: TransformOptions
) =>
  `${IMAGE_CDN_BASE}/cdn-cgi/image/width=${width},quality=${quality},format=${format},fit=scale-down/${path}`;

export const getPhoto = (path: string): GalleryPhoto => {
  const entry = manifest[path];
  if (!entry) {
    throw new Error(
      `Image "${path}" is missing from content/images-manifest.json — run \`npm run images:sync\`.`
    );
  }
  return { path, width: entry.width, height: entry.height };
};

export const listPhotoPaths = (): string[] => Object.keys(manifest);
