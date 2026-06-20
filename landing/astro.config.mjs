// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

// ponytail: `site` is only used for canonical/OG URLs — point it at wherever this
// deploys (GitHub Pages / Vercel). Asset paths are relative so no `base` needed.
export default defineConfig({
  site: "https://antedotee.github.io/Pragmat",
  vite: {
    plugins: [tailwindcss()],
  },
});
