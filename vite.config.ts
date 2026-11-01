import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
    // 编辑器保存时会写临时文件，Windows 上偶发 EBUSY 导致 watcher 崩溃，这里直接忽略
    watch: { ignored: ['**/*.tmp', '**/.*.tmpdir/**', '**/*.tmpdir/**'] },
  },
});
