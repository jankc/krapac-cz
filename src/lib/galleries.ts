import type { ImageMetadata } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';

const galleryImageModules = import.meta.glob(
  '../../content/galleries/**/*.{jpg,jpeg,png,webp,gif,JPG,JPEG,PNG,WEBP,GIF}',
  { eager: true, import: 'default' }
) as Record<string, ImageMetadata>;

export interface GalleryIndexItem {
  slug: string;
  title: string;
  order: number;
  description: string;
  featuredPhoto: ImageMetadata;
  featuredPhotoSrc: string;
  imageCount: number;
}

export interface GalleryDetail extends GalleryIndexItem {
  entry: CollectionEntry<'galleries'>;
  images: ImageMetadata[];
}

const normalizeSlug = (id: string) => {
  const normalizedId = id.replace(/\\/g, '/');
  const fileName = normalizedId.split('/').pop() ?? normalizedId;
  return fileName.replace(/\.md$/, '');
};

const fileNameFromPath = (filePath: string) => {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.split('/').pop() ?? normalizedPath;
};

const sortByFileName = (a: string, b: string) =>
  fileNameFromPath(a).localeCompare(fileNameFromPath(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });

const normalizeContentPath = (filePath: string) =>
  filePath.replace(/\\/g, '/').replace(/^.*\/content\/galleries\//, '');

const createGalleryDescription = (body: string | undefined, title: string) => {
  const safeBody = body ?? '';
  const plainText = safeBody
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[>*_~#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!plainText) {
    return `Selected photographs from the ${title} portfolio by Jan Krapáč.`;
  }

  return plainText.slice(0, 180);
};

const getGalleryImages = (slug: string) => {
  const imagePrefix = `${slug}/`;

  return Object.keys(galleryImageModules)
    .filter((filePath) =>
      normalizeContentPath(filePath).startsWith(imagePrefix)
    )
    .sort(sortByFileName)
    .map((filePath) => galleryImageModules[filePath]);
};

const getFeaturedPhoto = (featuredPhoto: string) => {
  const photo = Object.entries(galleryImageModules).find(([filePath]) => {
    return normalizeContentPath(filePath) === featuredPhoto;
  })?.[1];

  if (!photo) {
    throw new Error(`Unable to resolve featured photo: ${featuredPhoto}`);
  }

  return photo;
};

export const getSortedGalleries = async (): Promise<GalleryIndexItem[]> => {
  const galleries = await getCollection('galleries');

  return galleries
    .map((entry) => {
      const slug = normalizeSlug(entry.id);
      const featuredPhoto = getFeaturedPhoto(entry.data.featuredPhoto);

      return {
        slug,
        title: entry.data.title,
        order: entry.data.order,
        description: createGalleryDescription(entry.body, entry.data.title),
        featuredPhoto,
        featuredPhotoSrc: featuredPhoto.src,
        imageCount: getGalleryImages(slug).length,
      };
    })
    .sort((a, b) => a.order - b.order);
};

export const getGalleryBySlug = async (
  slug: string
): Promise<GalleryDetail | undefined> => {
  const galleries = await getCollection('galleries');
  const entry = galleries.find((item) => normalizeSlug(item.id) === slug);

  if (!entry) {
    return undefined;
  }

  const featuredPhoto = getFeaturedPhoto(entry.data.featuredPhoto);

  return {
    slug,
    title: entry.data.title,
    order: entry.data.order,
    description: createGalleryDescription(entry.body, entry.data.title),
    featuredPhoto,
    featuredPhotoSrc: featuredPhoto.src,
    imageCount: getGalleryImages(slug).length,
    entry,
    images: getGalleryImages(slug),
  };
};
