import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals:     true,
    coverage: {
      provider:   'v8',
      reporter:   ['text', 'json', 'html'],
      include:    ['src/lib/**', 'src/features/**/onboarding.validation.js'],
      thresholds: { lines: 90, functions: 90, branches: 80 },
    },
  },
});
