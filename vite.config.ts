import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so dist/ works on any host or sub-folder (Cloudflare Pages, GitHub Pages).
  base: './',
  build: { target: 'es2022' },
});
