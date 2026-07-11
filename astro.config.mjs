// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// COOP/COEP hlavičky: AI odstránenie pozadia potrebuje SharedArrayBuffer
// a prehliadač ho povolí len s nimi. Tu platia pre dev server;
// pre nasadenie na Vercel je to isté vo vercel.json.
const bezpecnostneHlavicky = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  server: {
    headers: bezpecnostneHlavicky,
  },

  vite: {
    plugins: [tailwindcss()]
  }
});
