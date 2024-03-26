# `@malobre/vite-plugin-pages`

This plugin does two things:
- in development mode, it rebase requests for HTML files to `src/pages` if they are not found at their canonical url,
- in build mode, it automatically use all HTML files from `src/pages` as input and move them to `dist/`.

## Usage

1. Install `npm install --save-dev https://github.com/malobre/vite-plugin-pages.git`
1. Add plugin to your vite config
    ```js
    import { defineConfig } from 'vite'
    import pages from '@malobre/vite-plugin-pages'

    export default defineConfig({
      plugins: [pages()],
    })
    ```

## Configuration

```ts
type Config = {
  // Where to look for HTML files, defaults to `src/pages`.
  // Relative to vite's project root: https://vitejs.dev/guide/#index-html-and-project-root
  dir: string;
};
```

e.g:
```js
import { defineConfig } from 'vite'
import pages from '@malobre/vite-plugin-pages'

export default defineConfig({
  plugins: [pages({
    dir: "other/dir"
  })],
})
```
