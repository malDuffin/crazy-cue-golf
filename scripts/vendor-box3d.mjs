import { mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "package.json"));
const pkgDir = dirname(require.resolve("box3d.js/package.json"));
const src = resolve(pkgDir, "dist/box3d.inline.mjs");
const destDir = resolve(root, "src/vendor");
const dest = resolve(destDir, "box3d.inline.mjs");

if (!existsSync(src)) {
  console.error("box3d.js inline module not found at", src);
  process.exit(1);
}
mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log("vendored", src, "->", dest);
