import { defineConfig } from "vite";

import pages from "@malobre/vite-plugin-pages";

export default defineConfig({
  plugins: [pages()],
});
