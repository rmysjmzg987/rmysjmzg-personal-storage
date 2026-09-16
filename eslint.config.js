import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '_probe/**', 'public/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // 构建/抓取脚本跑在 Node 里，浏览器与 DOM 的全局对象在这里不存在
    files: ['scripts/**/*.mjs', '*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
      },
    },
  },
);
