import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// 아이패드 인쇄용 개인 페이지 — 본체(vite.config.ts)와 완전히 분리된 두 번째 빌드.
// 결과물은 dist/ipad/ 에만 쓰므로 본체 index.html·번들은 그대로다(배포해도 열린 탭 새로고침 없음).
export default defineConfig({
  root: path.resolve(__dirname, 'ipad'),
  base: '/exec-project-dashboard/ipad/',
  envDir: __dirname,
  publicDir: false,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/ipad'),
    emptyOutDir: true,
  },
})
