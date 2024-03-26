import { access, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
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
                ? await access(join(viteConfig.root ?? ".", "index.html")).then(
                    () => ["index.html"],
                    () => [],
                  )
                : (viteConfig.build.rollupOptions.input satisfies never);
      }

      for (const entry of await readdir(
        join(viteConfig.root ?? "", config.dir),
        {
          recursive: true,
          withFileTypes: true,
        },
      )) {
        if (entry.isFile() && entry.name.endsWith(".html")) {
          viteConfig.build.rollupOptions.input.push(
            join(entry.path, entry.name),
          );
        }
      }
    },
    configResolved(resolved) {
      viteConfig = resolved;
    },
    async generateBundle(_options, bundle) {
      const pagesDir = relative(viteConfig.root, config.dir);

      const paths = Object.keys(bundle);

      for (const output of Object.values(bundle)) {
        const path = relative(pagesDir, output.fileName);

        if (dirname(path).startsWith("..") || isAbsolute(path)) continue;

        if (paths.includes(path)) {
          throw new Error(
            `Conflict between "${path}" and "${output.fileName}"`,
          );
        }

        output.fileName = path;
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
