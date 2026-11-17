import { spawnSync } from "node:child_process";
for (const args of [
  ["scripts/system-admin-test.mjs"],
  ["scripts/accounts-test.mjs"],
  ["--test", "--test-timeout=15000", "scripts/activation-links-test.mjs"],
  ["--test", "scripts/recovery-test.mjs"],
]) {
  const result = spawnSync(process.execPath, args, { env: process.env, stdio: "inherit", timeout: 120000 });
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
