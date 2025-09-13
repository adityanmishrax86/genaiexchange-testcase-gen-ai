import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/tcgen-ai-genaiexchange-frontend/', // <-- Use your bucket name here
});