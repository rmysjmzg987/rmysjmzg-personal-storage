/// <reference types="vitest/config" />
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  resolve: {
    alias: [
      // satellite.js 的根入口会把 WASM 版传播器一起导出，浏览器打包会失败；
      // 这里把裸包名指向纯 JS 的实现文件（不改变依赖版本，也不需要 fork）。
      {
        find: /^satellite\.js$/,
        replacement: resolve(root, 'src/orbit/satellite-core.ts'),
      },
      {
        find: /^satellite\.js\/(.+)$/,
        replacement: resolve(root, 'node_modules/satellite.js/$1'),
      },
    ],
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'], globals: true },
});
