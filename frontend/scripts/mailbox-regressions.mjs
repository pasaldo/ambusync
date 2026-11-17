import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
const suites = process.argv.includes("--all")
  ? Object.entries(JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).scripts)
    .filter(([name]) => name.startsWith("test:"))
  : [
    ["test:system-admin", "node scripts/system-admin-test.mjs"],
    ["test:accounts", "node scripts/accounts-test.mjs"],
    ["test:activation-links", "node --test --test-timeout=15000 scripts/activation-links-test.mjs"],
    ["test:recovery", "node --test scripts/recovery-test.mjs"],
  ];
for (const [name, script] of suites) {
  for (const part of script.split(" && ")) {
    const args = part === "npm run build"
      ? [join(dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), "run", "build"]
      : part.replace(/^node /, "").split(/\s+/);
    const result = spawnSync(process.execPath, args, { env: process.env, stdio: "inherit", timeout: 180000 });
    if (result.status !== 0) { process.exit(result.status ?? 1); }
  }
  console.log(`PASS suite ${name}`);
}
