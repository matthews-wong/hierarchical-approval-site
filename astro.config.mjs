import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://hierarchical-approval.matthewswong.com',
  integrations: [sitemap()],
  output: 'static',
});
