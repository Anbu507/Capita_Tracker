import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

export default defineConfig({
  // Relative asset paths, so dist/ works on any host or sub-folder (Cloudflare Pages, GitHub Pages).
  base: './',
  build: { target: 'es2022' },
  // The version shown in Settings comes from package.json.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
});
