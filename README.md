# `@malobre/vite-plugin-pages`

Enhanced MPA DX:
- in dev mode, rebase requests to `src/pages` if the requested file exists there,
- in build mode, treat all files in `src/pages` as inputs and rebase them to your project root.

## Usage

1. Install `npm install --save-dev @malobre/vite-plugin-pages`
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
  // Where your pages are stored, defaults to `src/pages`.
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
