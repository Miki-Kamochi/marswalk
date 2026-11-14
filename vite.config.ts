import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { resolve } from "node:path";

// `npm run dev:phone` serves over HTTPS with a self-signed certificate so a phone on the
// same Wi-Fi can use the motion sensors (they only work on secure pages).
const https = process.env.MARSWALK_HTTPS === "1";

export default defineConfig({
  plugins: https ? [basicSsl()] : [],
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        sim: resolve(__dirname, "sim.html"),
        game: resolve(__dirname, "game.html"),
        how: resolve(__dirname, "how.html"),
        credits: resolve(__dirname, "credits.html"),
        dev: resolve(__dirname, "dev.html"),
        terrain: resolve(__dirname, "terrain-test.html"),
        sensors: resolve(__dirname, "sensor-test.html"),
        map: resolve(__dirname, "map-test.html"),
      },
    },
  },
});
