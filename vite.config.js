import { defineConfig } from 'vite';

export default defineConfig({
  // Set base to relative so it works on any GitHub Pages repo name automatically
  base: './',

  optimizeDeps: {
    include: ['phaser', '@trystero-p2p/torrent'],
    exclude: [],
  },

  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      output: {
        // Vite 8 (rolldown) requires manualChunks as a function
        manualChunks(id) {
          if (id.includes('phaser')) return 'phaser';
          if (id.includes('trystero') || id.includes('@trystero-p2p')) return 'trystero';
        },
      },
    },
  },

  server: {
    port: 3000,
    open: true,
  },
});
