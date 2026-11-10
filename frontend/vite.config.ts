import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The API's http launch profile. Only the dev server uses it: in production the API serves the built app from the
// same origin, so the app itself only ever calls relative URLs.
const apiOrigin = 'http://localhost:5283';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Vite 8 reads the `@/*` alias from tsconfig.app.json itself, so the alias is written in one place.
    tsconfigPaths: true,
  },
  build: {
    rolldownOptions: {
      output: {
        // Fluent is most of the app's weight and changes far less often than the app, so it gets its own file: a
        // redeploy of the app leaves a phone's cached copy of it valid, and no single file passes the size notice.
        codeSplitting: {
          groups: [{ name: 'fluent', test: /node_modules[\\/]@fluentui[\\/]/ }],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': { target: apiOrigin },
      // SignalR upgrades to a WebSocket, which the proxy only forwards with `ws`.
      '/hubs': { target: apiOrigin, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
