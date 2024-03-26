import { access, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { type Plugin, type ResolvedConfig, normalizePath } from "vite";

type PagesConfig = {
  dir: string;
};

const PAGES_CONFIG_DEFAULT: PagesConfig = {
  dir: "src/pages",
};

const dev = (config: PagesConfig): Plugin => {
  let viteConfig: ResolvedConfig;
  let pagesDir: string;

  return {
    name: "@malobre/vite-plugin-pages:dev",
    enforce: "pre",
    apply: (_viteConfig, env) => env.command === "serve" && !env.isPreview,
    configResolved(resolved) {
      viteConfig = resolved;
      pagesDir = relative(viteConfig.root, config.dir);
    },
    configureServer(server) {
      server.middlewares.use(async (req, _res, next) => {
        if (req.url === undefined) return next();

        const pagePath = `${pagesDir}${
          new URL(req.url, "http://dummy.invalid").pathname
        }`;

        await access(pagePath)
          .then(() => {
            req.url = `/${pagePath}`;
          })
          .catch(() => {});

        next();
      });
    },
    handleHotUpdate(ctx) {
      if (viteConfig.server.middlewareMode) return;

      if (
        relative(viteConfig.root, ctx.file).startsWith(config.dir) &&
        ctx.file.endsWith(".html")
      ) {
        ctx.server.ws.send({
          type: "full-reload",
          path: `/${normalizePath(relative(config.dir, ctx.file))}`,
        });
      }
    },
  };
};

const build = (config: PagesConfig): Plugin => {
  let viteConfig: ResolvedConfig;

  return {
    name: "@malobre/vite-plugin-pages:build",
    enforce: "post",
    apply: "build",
    async config(viteConfig, _env) {
      if (!Array.isArray(viteConfig.build?.rollupOptions?.input)) {
        viteConfig.build ??= {};
        viteConfig.build.rollupOptions ??= {};

        viteConfig.build.rollupOptions.input =
          typeof viteConfig.build.rollupOptions.input === "object"
            ? Object.keys(viteConfig.build.rollupOptions.input)
            : typeof viteConfig.build.rollupOptions.input === "string"
              ? [viteConfig.build.rollupOptions.input]
              : typeof viteConfig.build.rollupOptions.input === "undefined"
                ? []
                : (viteConfig.build.rollupOptions.input satisfies never);
      }

      const pagesDir = join(viteConfig.root ?? "", config.dir);

      for (const entry of await readdir(pagesDir, {
        recursive: true,
        withFileTypes: true,
      })) {
        if (entry.isFile() && entry.name.endsWith(".html")) {
          viteConfig.build.rollupOptions.input.push(
            join(entry.path, entry.name),
          );
        }
      }

      // Defaults to "index.html" inside `pagesDir`.
      if (viteConfig.build.rollupOptions.input.length === 0) {
        viteConfig.build.rollupOptions.input.push(join(pagesDir, "index.html"));
      }
    },
    configResolved(resolved) {
      viteConfig = resolved;
    },
    async generateBundle(_options, bundle) {
      const pagesDir = relative(viteConfig.root, config.dir);

      const paths = Object.keys(bundle);

      // Remove `pagesDir` prefix from output paths.
      for (const output of Object.values(bundle)) {
        if (!output.fileName.startsWith(pagesDir)) continue;

        const from = output.fileName;

        const to = relative(pagesDir, output.fileName);

        if (paths.includes(to)) {
          throw new Error(
            `Conflicting inputs, "${from}" would override "${to}"`,
          );
        }

        output.fileName = to;
      }
    },
  };
};

export default (config?: Partial<PagesConfig>): Plugin[] => {
  const resolvedConfig: PagesConfig = {
    ...PAGES_CONFIG_DEFAULT,
    ...config,
  };

  return [dev(resolvedConfig), build(resolvedConfig)];
};
