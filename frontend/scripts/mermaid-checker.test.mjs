import assert from "node:assert/strict";
import test from "node:test";
import { extractMermaidBlocks, validateMermaidBlocks } from "./mermaid-checker.mjs";

test("extrae bloques Mermaid con finales CRLF", () => {
  const result = extractMermaidBlocks("# Demo\r\n```mermaid\r\nflowchart LR\r\n  A-->B\r\n```\r\n", "demo.md");

  assert.deepEqual(result.errors, []);
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0].file, "demo.md");
  assert.equal(result.blocks[0].line, 2);
});

test("entrega al parser cada bloque Mermaid", async () => {
  const sources = [
    "flowchart LR\n  A-->B",
    "stateDiagram-v2\n  [*] --> Ready\n  Ready --> [*]",
    "erDiagram\n  CASE ||--|| PATIENT : includes\n  CASE { string id }",
  ];
  const blocks = sources.map((source, index) => ({ file: "fixture.md", line: index + 1, source }));

  const parsed = [];
  const parseDiagram = async (source) => parsed.push(source);

  assert.deepEqual(await validateMermaidBlocks(blocks, parseDiagram), []);
  assert.deepEqual(parsed, sources);
});

test("propaga errores del parser con ubicación", async () => {
  const blocks = [{ file: "broken.md", line: 4, source: "flowchart LR\n  A -->" }];
  const parseDiagram = async () => { throw new Error("syntax error"); };

  assert.match((await validateMermaidBlocks(blocks, parseDiagram))[0], /^broken\.md:4: syntax error$/);
});

test("rechaza una validación vacía", async () => {
  assert.deepEqual(await validateMermaidBlocks([]), ["No se encontraron bloques Mermaid para validar"]);
});
