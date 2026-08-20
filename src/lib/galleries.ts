import { getCollection, type CollectionEntry } from 'astro:content';
import {
  cdnUrl,
  getPhoto,
  listPhotoPaths,
  type GalleryPhoto,
} from './images';

export interface GalleryIndexItem {
  slug: string;
  title: string;
  order: number;
  hidden: boolean;
  description: string;
  featuredPhoto: GalleryPhoto;
  featuredPhotoSrc: string;
  imageCount: number;
}

type GalleryEntry =
  CollectionEntry<'galleries'> | CollectionEntry<'hiddenGalleries'>;

export interface GalleryDetail extends GalleryIndexItem {
  entry: GalleryEntry;
  images: GalleryPhoto[];
}

const normalizeSlug = (id: string) => {
  const normalizedId = id.replace(/\\/g, '/');
  const fileName = normalizedId.split('/').pop() ?? normalizedId;
  return fileName.replace(/\.md$/, '');
};

// The glob() loader uses a `slug` frontmatter field (when present) as the entry's `id`,
// so `entry.id` can no longer be trusted to key the on-disk image folder once a gallery
// declares a `slug` override. `entry.filePath` always points at the real source file
// (e.g. `.../content/hidden-galleries/test-hidden.md`), so derive the folder from that —
// falling back to `entry.id` for safety if `filePath` is ever unavailable.
const entryFolder = (entry: GalleryEntry) =>
  entry.filePath ? normalizeSlug(entry.filePath) : normalizeSlug(entry.id);

// Manifest keys mirror the content layout: "galleries/<folder>/<file>" and
// "hidden-galleries/<folder>/<file>", with gallery covers at the collection root.
const collectionDir = (hidden: boolean) =>
  hidden ? 'hidden-galleries' : 'galleries';

const fileNameFromPath = (filePath: string) => {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return normalizedPath.split('/').pop() ?? normalizedPath;
};

const sortByFileName = (a: string, b: string) =>
  fileNameFromPath(a).localeCompare(fileNameFromPath(b), undefined, {
    numeric: true,
    sensitivity: 'base',
  });

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

const getGalleryImages = (folder: string, hidden: boolean) => {
  const imagePrefix = `${collectionDir(hidden)}/${folder}/`;

  return listPhotoPaths()
    .filter((path) => path.startsWith(imagePrefix))
    .sort(sortByFileName)
    .map(getPhoto);
};

const getFeaturedPhoto = (featuredPhoto: string, hidden: boolean) => {
  try {
    return getPhoto(`${collectionDir(hidden)}/${featuredPhoto}`);
  } catch {
    throw new Error(`Unable to resolve featured photo: ${featuredPhoto}`);
  }
};

const toIndexItem = (
  entry: GalleryEntry,
  hidden: boolean
): GalleryIndexItem => {
  const folder = entryFolder(entry);
  const slug = entry.data.slug ?? folder;
  const featuredPhoto = getFeaturedPhoto(entry.data.featuredPhoto, hidden);

  return {
    slug,
    title: entry.data.title,
    order: 'order' in entry.data ? entry.data.order : Number.MAX_SAFE_INTEGER,
    hidden,
    description: createGalleryDescription(entry.body, entry.data.title),
    featuredPhoto,
    featuredPhotoSrc: cdnUrl(featuredPhoto, { width: 1200 }),
    imageCount: getGalleryImages(folder, hidden).length,
  };
};

const toGalleryDetail = (
  entry: GalleryEntry,
  hidden: boolean
): GalleryDetail => {
  const item = toIndexItem(entry, hidden);
  const folder = entryFolder(entry);

  return {
    ...item,
    entry,
    images: getGalleryImages(folder, hidden),
  };
};

const assertNoDuplicateEntries = (entries: GalleryEntry[]) => {
  const seenSlugs = new Map<string, GalleryEntry>();
  const seenFolders = new Map<string, GalleryEntry>();

  for (const entry of entries) {
    const folder = entryFolder(entry);
    const slug = entry.data.slug ?? folder;

    const slugClash = seenSlugs.get(slug);
    if (slugClash) {
      throw new Error(
        `Duplicate gallery slug "${slug}" shared by "${slugClash.data.title}" and "${entry.data.title}".`
      );
    }
    seenSlugs.set(slug, entry);

    const folderClash = seenFolders.get(folder);
    if (folderClash) {
      throw new Error(
        `Duplicate gallery folder "${folder}" shared by "${folderClash.data.title}" and "${entry.data.title}".`
      );
    }
    seenFolders.set(folder, entry);
  }
};

export const getAllGalleries = async (): Promise<GalleryIndexItem[]> => {
  const officialEntries = await getCollection('galleries');
  const hiddenEntries = await getCollection('hiddenGalleries');

  assertNoDuplicateEntries([...officialEntries, ...hiddenEntries]);

  const officialItems = officialEntries
    .map((entry) => toIndexItem(entry, false))
    .sort((a, b) => a.order - b.order);

  const hiddenItems = hiddenEntries.map((entry) => toIndexItem(entry, true));

  return [...officialItems, ...hiddenItems];
};

export const getSortedGalleries = async (): Promise<GalleryIndexItem[]> => {
  const galleries = await getAllGalleries();
  return galleries.filter((gallery) => !gallery.hidden);
};

export const getGalleryBySlug = async (
  slug: string
): Promise<GalleryDetail | undefined> => {
  const officialEntries = await getCollection('galleries');
  const hiddenEntries = await getCollection('hiddenGalleries');

  const officialEntry = officialEntries.find(
    (item) => (item.data.slug ?? entryFolder(item)) === slug
  );
  if (officialEntry) {
    return toGalleryDetail(officialEntry, false);
  }

  const hiddenEntry = hiddenEntries.find(
    (item) => (item.data.slug ?? entryFolder(item)) === slug
  );
  if (hiddenEntry) {
    return toGalleryDetail(hiddenEntry, true);
  }

  return undefined;
};

export const getAllGalleryDetails = async (): Promise<GalleryDetail[]> => {
  const officialEntries = await getCollection('galleries');
  const hiddenEntries = await getCollection('hiddenGalleries');

  assertNoDuplicateEntries([...officialEntries, ...hiddenEntries]);

  const officialDetails = officialEntries.map((entry) =>
    toGalleryDetail(entry, false)
  );
  const hiddenDetails = hiddenEntries.map((entry) =>
    toGalleryDetail(entry, true)
  );

  return [...officialDetails, ...hiddenDetails];
};
