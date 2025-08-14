import assert from "node:assert";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { RollupOutput } from "rollup";
import { build } from "vite";
import { beforeEach, describe, expect, it } from "vitest";

import pages from "../src/index.ts";

let testDir: string;

describe("vite-plugin-pages", () => {
  beforeEach(async () => {
    testDir = await mkdtemp(".tmp-test");

    const pagesDir = join(testDir, "src", "pages");

    await mkdir(pagesDir, { recursive: true });

    await writeFile(
      join(pagesDir, "index.html"),
      "<!DOCTYPE html><title>Home</title>",
    );
    await writeFile(
      join(pagesDir, "about.html"),
      "<!DOCTYPE html><title>About</title>",
    );

    return async () => {
      await rm(testDir, { recursive: true, force: true });
    };
  });

  it("creates working plugins for Vite", () => {
    const plugins = pages();
    expect(plugins).toHaveLength(2);
    expect(
      plugins.findIndex(
        (plugin) => plugin.name === "@malobre/vite-plugin-pages:dev",
      ),
    ).not.toBe(-1);
    expect(
      plugins.findIndex(
        (plugin) => plugin.name === "@malobre/vite-plugin-pages:build",
      ),
    ).not.toBe(-1);
  });

  it("builds pages correctly", async () => {
    const result = await build({
      root: testDir,
      plugins: [pages()],
      build: { write: false, minify: false },
      logLevel: "silent",
    });

    assert(!Array.isArray(result));

    const outputFiles = (result as RollupOutput).output.map((o) => o.fileName);

    expect(outputFiles).toContain("index.html");
    expect(outputFiles).toContain("about.html");
  });

  it("cleans output paths", async () => {
    await mkdir(join(testDir, "src/pages/blog"), { recursive: true });
    await writeFile(
      join(testDir, "src/pages/blog/post.html"),
      "<html><body>Post</body></html>",
    );

    const result = (await build({
      root: testDir,
      plugins: [pages()],
      build: { write: false, minify: false },
      logLevel: "silent",
    })) as RollupOutput;

    const outputFiles = result.output.map((o) => o.fileName);

    expect(outputFiles).toContain("blog/post.html");
    expect(outputFiles).not.toContain("src/pages/blog/post.html");
  });

  it("uses custom directory", async () => {
    const customDir = join(testDir, "custom");
    await mkdir(customDir, { recursive: true });
    await writeFile(
      join(customDir, "page.html"),
      "<html><body>Custom</body></html>",
    );

    const result = (await build({
      root: testDir,
      plugins: [pages({ dir: "custom" })],
      build: { write: false, minify: false },
      logLevel: "silent",
    })) as RollupOutput;

    const outputFiles = result.output.map((o) => o.fileName);

    expect(outputFiles).toContain("page.html");
  });
});
