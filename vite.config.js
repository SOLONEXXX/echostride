import { defineConfig } from 'vite';

// Base path is overridable so the same build works on GitHub Pages
// (/echostride/) and on a plain static host (/).
export default defineConfig({
  base: process.env.ECHOSTRIDE_BASE ?? '/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      // gallery.html is a second entry: it renders the design documentation
      // from the same meshes the game uses, so the docs cannot go stale.
      input: { main: 'index.html', gallery: 'gallery.html' },
    },
  },
  server: { host: '127.0.0.1', port: 5173 },
});
