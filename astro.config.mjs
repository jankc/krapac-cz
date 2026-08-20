import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const hiddenDir = new URL('./content/hidden-galleries/', import.meta.url);
const hiddenSlugs = existsSync(hiddenDir)
  ? readdirSync(hiddenDir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => {
        const source = readFileSync(new URL(file, hiddenDir), 'utf8');
        return (
          source.match(/^slug:\s*['"]?([a-z0-9-]+)['"]?\s*$/m)?.[1] ??
          file.replace(/\.md$/, '')
        );
      })
  : [];

export default defineConfig({
  site: 'https://krapac.cz',
  trailingSlash: 'always',
  integrations: [
    sitemap({
      filter: (page) =>
        !hiddenSlugs.some((slug) =>
          new URL(page).pathname.startsWith(`/${slug}/`)
        ),
    }),
  ],
});
