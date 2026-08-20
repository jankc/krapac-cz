import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const galleryBaseSchema = z.object({
  title: z.string(),
  featuredPhoto: z.string(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

const galleries = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/galleries' }),
  schema: galleryBaseSchema.extend({
    order: z.number(),
  }),
});

// Hidden galleries: put name.md + name.jpg + name/ photos under content/hidden-galleries/.
// Frontmatter: title, featuredPhoto, optional slug (decouples the URL from the filename).
// No `order` — hidden galleries are never listed or sorted. They build at /{slug}/, are
// excluded from the homepage index and sitemap, and are noindexed; anyone with the direct
// link can open and share it (unlisted, not private).
const hiddenGalleries = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/hidden-galleries' }),
  schema: galleryBaseSchema,
});

export const collections = { galleries, hiddenGalleries };
