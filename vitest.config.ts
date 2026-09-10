import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Reusable components, domain rules, storage and server routes run under Vitest;
      // router-bound views (src/views, App.vue) are exercised by the Playwright e2e
      // suite instead, so measuring them here would just read as a false gap.
      include: [
        'src/components/**/*.vue',
        'src/domain/**/*.ts',
        'src/composables/**/*.ts',
        'src/services/**/*.ts',
        'server/**/*.ts',
      ],
      exclude: ['server/index.ts'],
    },
  },
});
