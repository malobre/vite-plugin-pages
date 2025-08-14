import console from "node:console";
import { access, readdir } from "node:fs/promises";
import { join, normalize, relative, resolve } from "node:path";
import process from "node:process";

import { normalizePath, type Plugin, type ResolvedConfig } from "vite";

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
      pagesDir = normalize(config.dir);
    },
    // Proxy requests to `pagesDir` if requested file exists.
    configureServer(server) {
      server.middlewares.use(async (req, _res, next) => {
        if (req.url === undefined) return next();

        const requestedPath = new URL(req.url, "http://dummy.invalid").pathname;
        const pagePath = normalize(join(pagesDir, requestedPath));

        // Prevent directory traversal by ensuring the resolved path is within pagesDir
        if (!resolve(pagePath).startsWith(pagesDir)) {
          return next();
        }

        // Proxy existing files only
        await access(pagePath)
          .then(() => {
            req.url = `/${normalizePath(pagePath)}`;
          })
          .catch((error) => {
            console.debug(`Unable to access ${pagePath}, skipping: ${error}`);
          });

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
    async config(userConfig, _env) {
      if (!Array.isArray(userConfig.build?.rollupOptions?.input)) {
        userConfig.build ??= {};
        userConfig.build.rollupOptions ??= {};

        // Ensure input is initialized to an array while preserving values set by the user.
        userConfig.build.rollupOptions.input =
          typeof userConfig.build.rollupOptions.input === "object"
            ? Object.keys(userConfig.build.rollupOptions.input)
            : typeof userConfig.build.rollupOptions.input === "string"
            ? [userConfig.build.rollupOptions.input]
            : typeof userConfig.build.rollupOptions.input === "undefined"
            ? []
            : (() => {
              userConfig.build.rollupOptions.input satisfies never;
              throw new Error(
                "unable to convert rollupOptions.input to an array",
              );
            })();
      }

      const pagesDir = join(userConfig.root ?? process.cwd(), config.dir);

      // Add all files in `pagesDir` to rollup inputs.
      for (
        const entry of await readdir(pagesDir, {
          recursive: true,
          withFileTypes: true,
        }).catch((error) => {
          console.warn(`Unable to read dir ${pagesDir}: ${error}`);
          return [];
        })
      ) {
        if (!entry.isFile()) continue;

        userConfig.build.rollupOptions.input.push(
          join(entry.parentPath, entry.name),
        );
      }

      // Defaults to "index.html" inside `pagesDir`.
      if (userConfig.build.rollupOptions.input.length === 0) {
        userConfig.build.rollupOptions.input.push(join(pagesDir, "index.html"));
      }
    },
    configResolved(resolved) {
      viteConfig = resolved;
    },
    generateBundle(_options, bundle) {
      const absolutePagesDir = resolve(viteConfig.root, config.dir);

      const paths = Object.keys(bundle);

      // Remove `pagesDir` prefix from output paths.
      for (const output of Object.values(bundle)) {
        const absoluteFileName = resolve(viteConfig.root, output.fileName);

        // Skip if this file is outside the pages directory
        if (!absoluteFileName.startsWith(absolutePagesDir)) {
          continue;
        }

        const from = output.fileName;

        // Calculate the relative path from the pages directory,
        // effectively removing the pages directory prefix.
        const to = relative(absolutePagesDir, absoluteFileName);

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
