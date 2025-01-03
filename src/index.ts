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
    // Proxy requests to `pagesDir` if requested file exists.
    configureServer(server) {
      server.middlewares.use(async (req, _res, next) => {
        if (req.url === undefined) return next();

        const pagePath = join(
          pagesDir,
          new URL(req.url, "http://dummy.invalid").pathname,
        );

        await access(pagePath)
          .then(() => {
            req.url = `/${pagePath}`;
          })
          .catch(() => {});

        next();
      });
    },
    // Rewrite paths for HMR, such that files in `pagesDir` also reload the proxied URLs.
    handleHotUpdate(ctx) {
      if (!relative(viteConfig.root, ctx.file).startsWith(config.dir)) return;

      ctx.server.ws.send({
        type: "full-reload",
        path: viteConfig.server.middlewareMode
          ? "*"
          : "/".concat(normalizePath(relative(config.dir, ctx.file))),
      });
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

        // Ensure input is initialized to an array while preserving values set by the user.
        viteConfig.build.rollupOptions.input =
          typeof viteConfig.build.rollupOptions.input === "object"
            ? Object.keys(viteConfig.build.rollupOptions.input)
            : typeof viteConfig.build.rollupOptions.input === "string"
              ? [viteConfig.build.rollupOptions.input]
              : typeof viteConfig.build.rollupOptions.input === "undefined"
                ? []
                : (() => {
                    viteConfig.build.rollupOptions.input satisfies never;
                    throw new Error(
                      "unable to convert rollupOptions.input to an array",
                    );
                  })();
      }

      const pagesDir = join(viteConfig.root ?? process.cwd(), config.dir);

      // Add all files in `pagesDir` to rollup inputs.
      for (const entry of await readdir(pagesDir, {
        recursive: true,
        withFileTypes: true,
      })) {
        if (!entry.isFile()) continue;

        viteConfig.build.rollupOptions.input.push(
          join(entry.parentPath, entry.name),
        );
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
