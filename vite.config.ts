import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { resolve } from "node:path";
import { readFileSync } from 'node:fs';

// `npm run dev:phone` serves over HTTPS with a self-signed certificate so a phone on the
// same Wi-Fi can use the motion sensors (they only work on secure pages).
const https = process.env.MARSWALK_HTTPS === "1";

export default defineConfig({
  plugins: [
    ...(https ? [basicSsl()] : []),
    {
      name: 'mgl-requirements',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] !== '/MGL_requirements.md') return next();
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(readFileSync(resolve(import.meta.dirname, 'MGL_requirements.md')));
        });
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'MGL_requirements.md', source: readFileSync(resolve(import.meta.dirname, 'MGL_requirements.md'), 'utf8') });
      },
    },
  ],
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        dev: resolve(__dirname, "dev.html"),
        terrain: resolve(__dirname, "terrain-test.html"),
        sensors: resolve(__dirname, "sensor-test.html"),
        map: resolve(__dirname, "map-test.html"),
      },
    },
  },
});
