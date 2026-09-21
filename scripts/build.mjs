import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

const id = "dsh-trading-agent";
await mkdir("lib", { recursive: true });

await build({
  entryPoints: ["src/index.ts"],
  outfile: "lib/index.js",
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2024",
  external: ["@deepseek-ai/*"],
  sourcemap: false,
  logLevel: "info",
});

await build({
  entryPoints: ["src/client/index.ts"],
  outfile: "lib/client.js",
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2024",
  external: ["react", "react/jsx-runtime", "react-dom"],
  sourcemap: false,
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: "\nreturn module.exports; } });" },
  logLevel: "info",
});
