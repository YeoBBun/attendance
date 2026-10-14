import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' — 어떤 경로(GitHub Pages 하위 경로 등)에 올려도 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: './',
  plugins: [react()],
});
