// Valida los bloques ```mermaid``` del README con mermaid.parse en Chromium.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(resolve(__dirname, "../../README.md"), "utf8");

const blocks = [...md.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
console.log(`Encontrados ${blocks.length} diagramas mermaid.`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<!doctype html><html><body>
<script type="module">
  import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
  window.__mermaid = mermaid;
  window.__ready = true;
</script></body></html>`);
await page.waitForFunction("window.__ready === true", { timeout: 20000 });

let ok = 0;
for (let i = 0; i < blocks.length; i++) {
  const res = await page.evaluate(async (src) => {
    try {
      await window.__mermaid.parse(src);
      return { ok: true };
    } catch (e) {
      return { ok: false, err: String(e && e.message ? e.message : e) };
    }
  }, blocks[i]);
  if (res.ok) {
    ok++;
    console.log(`✓ diagrama ${i + 1} válido`);
  } else {
    console.log(`✗ diagrama ${i + 1} ERROR: ${res.err}`);
  }
}
await browser.close();
console.log(`\n${ok}/${blocks.length} diagramas válidos.`);
process.exit(ok === blocks.length ? 0 : 1);
