import { build as viteBuild } from "vite";
import { build as bundle } from "esbuild";
import { readFile, readdir, writeFile, mkdir, rm, copyFile, cp } from "node:fs/promises";
await viteBuild();
const assets = {};
const types = { html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", svg: "image/svg+xml", jpg: "image/jpeg", png: "image/png" };
async function collect(dir, prefix = "") {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await collect(`${dir}/${entry.name}`, name);
    else {
      const type = types[entry.name.split(".").pop()];
      if (!type) throw new Error(`Add explicit asset encoding for ${name}`);
      const binary = /\.(jpg|png)$/.test(name);
      const bytes = await readFile(`${dir}/${entry.name}`);
      assets[name] = { body: bytes.toString(binary ? "base64" : "utf8"), type, binary };
    }
  }
}
await collect("dist");
await writeFile("worker/assets.generated.js", `export default ${JSON.stringify(assets)};\n`);
await rm("dist", { recursive: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await bundle({ entryPoints: ["worker/index.ts"], outfile: "dist/server/index.js", bundle: true, format: "esm", platform: "browser", target: "es2022" });
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
await cp("drizzle", "dist/.openai/drizzle", { recursive: true });
console.log("Built OTTO frontend, Nessie receipts and persistent Grow ledger.");
