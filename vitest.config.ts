import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

/** 让测试也能 import "*.md" 拿到正文字符串，与构建时 esbuild 的 text loader 一致。 */
export default defineConfig({
  plugins: [
    {
      name: "markdown-as-text",
      enforce: "pre",
      load(id) {
        const path = id.split("?")[0];
        if (path === undefined || !path.endsWith(".md")) return null;
        return `export default ${JSON.stringify(readFileSync(path, "utf8"))};`;
      },
    },
  ],
});
