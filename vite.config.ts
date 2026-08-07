import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: true, // 允许手机通过局域网 IP 访问（注意：需 https 或 localhost 才能开摄像头）
    port: 5173,
  },
});
