import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(),   tailwindcss(),],
  base: '/tcgen-ai-genaiexchange-frontend/', // <-- Use your bucket name here
});