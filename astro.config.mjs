import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://krapac.cz',
  trailingSlash: 'always',
  integrations: [sitemap()],
});
