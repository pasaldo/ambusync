import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: "ambusync-passive-worker-version",
    apply: "build",
    writeBundle(options, bundle) {
      const hash = createHash("sha256");
      for (const output of Object.values(bundle).sort((a, b) => a.fileName.localeCompare(b.fileName))) {
        hash.update(output.type === "chunk" ? output.code : output.source);
      }
      const publicDir = path.resolve(__dirname, "public");
      for (const name of readdirSync(publicDir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile()).sort((a, b) => path.join(a.parentPath, a.name).localeCompare(path.join(b.parentPath, b.name)))) {
        hash.update(readFileSync(path.join(name.parentPath, name.name)));
      }
      const source = readFileSync(path.join(publicDir, "sw.js"), "utf8");
      writeFileSync(path.join(options.dir ?? "dist", "sw.js"), `${source}\n// Build: ${hash.digest("hex").slice(0, 16)}\n`);
    },
  }],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
      },
      "/ws": {
        target: "ws://127.0.0.1:8000",
        ws: true,
      },
    },
  },
});
