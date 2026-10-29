import { createReadStream, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { extractMermaidBlocks, validateMermaidBlocks } from "./mermaid-checker.mjs";

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = resolve(frontendDir, "..");

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(path);
      return entry.isFile() && /\.md$/i.test(entry.name) ? [path] : [];
    });
}

const files = [resolve(rootDir, "README.md"), ...markdownFiles(resolve(rootDir, "docs"))];
const blocks = [];
const errors = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const result = extractMermaidBlocks(source, relative(rootDir, file));
  blocks.push(...result.blocks);
  errors.push(...result.errors);
}

console.log(`Encontrados ${blocks.length} diagramas Mermaid en README.md y docs/.`);

const mermaidDist = resolve(frontendDir, "node_modules/mermaid/dist");
const server = createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  if (requestPath === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end('<!doctype html><script type="module">import mermaid from "/mermaid.esm.min.mjs"; window.__mermaid = mermaid; window.__ready = true;</script>');
    return;
  }

  const file = resolve(mermaidDist, `.${requestPath}`);
  if (file !== mermaidDist && !file.startsWith(`${mermaidDist}${sep}`)) {
    response.writeHead(403).end();
    return;
  }

  response.setHeader("content-type", extname(file) === ".mjs" || extname(file) === ".js"
    ? "text/javascript; charset=utf-8"
    : "application/octet-stream");
  createReadStream(file).on("error", () => response.writeHead(404).end()).pipe(response);
});

let browser;
try {
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.waitForFunction("window.__ready === true");

  const parseDiagram = async (source) => {
    const result = await page.evaluate(async (diagram) => {
      try {
        await window.__mermaid.parse(diagram);
        return { ok: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    }, source);
    if (!result.ok) throw new Error(result.message);
  };

  errors.push(...await validateMermaidBlocks(blocks, parseDiagram));
} catch (error) {
  errors.push(`No se pudo ejecutar el parser Mermaid local: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser?.close();
  if (server.listening) await new Promise((resolveClose) => server.close(resolveClose));
}

if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  process.exitCode = 1;
} else {
  for (const block of blocks) console.log(`✓ ${block.file}:${block.line} válido`);
  console.log(`\n${blocks.length}/${blocks.length} diagramas válidos.`);
}
