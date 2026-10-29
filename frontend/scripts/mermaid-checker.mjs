export function extractMermaidBlocks(markdown, file) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  const errors = [];
  let fence = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    if (!fence) {
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (!opening) continue;

      const marker = opening[1];
      const info = opening[2].trim().split(/\s+/, 1)[0].toLowerCase();
      fence = {
        character: marker[0],
        length: marker.length,
        isMermaid: info === "mermaid",
        startLine: index + 1,
        body: [],
      };
      continue;
    }

    const closing = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
    if (closing && closing[1][0] === fence.character && closing[1].length >= fence.length) {
      if (fence.isMermaid) {
        blocks.push({ file, line: fence.startLine, source: fence.body.join("\n") });
      }
      fence = null;
      continue;
    }

    if (fence.isMermaid) fence.body.push(line);
  }

  if (fence?.isMermaid) {
    errors.push(`${file}:${fence.startLine}: bloque Mermaid sin fence de cierre`);
  }

  return { blocks, errors };
}

export async function validateMermaidBlocks(blocks, parseDiagram) {
  if (blocks.length === 0) return ["No se encontraron bloques Mermaid para validar"];
  if (typeof parseDiagram !== "function") throw new TypeError("Se requiere un parser Mermaid");

  const errors = [];
  for (const block of blocks) {
    try {
      await parseDiagram(block.source);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${block.file}:${block.line}: ${message}`);
    }
  }
  return errors;
}
