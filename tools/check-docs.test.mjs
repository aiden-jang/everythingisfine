import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "eif-docs-"));
const checker = fileURLToPath(new URL("./check-docs.mjs", import.meta.url));
mkdirSync(join(root, "src"));
mkdirSync(join(root, ".github"));
writeFileSync(join(root, "vite.config.ts"), "");
writeFileSync(join(root, "ARCHITECTURE.md"), "# Architecture\n");
writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: {} }));
writeFileSync(join(root, "src/example.ts"), "export const validSymbol = 1;\n");
after(() => rmSync(root, { recursive: true, force: true }));

function check(readme, policy = "") {
  writeFileSync(join(root, "README.md"), readme);
  writeFileSync(join(root, ".github/SECURITY.md"), policy);
  return spawnSync(process.execPath, [checker], { cwd: root, encoding: "utf8", timeout: 2_000 });
}

test("documented symbols resolve against source", () => {
  const result = check("Use validSymbol.\n");
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test("unknown symbols fail documentation verification", () => {
  const result = check("Use missingSymbol.\n");
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /nothing named `missingSymbol`/);
});

test("GitHub policies are checked", () => {
  const result = check("", "Use missingPolicySymbol.\n");
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /\.github\/SECURITY\.md:1: nothing named `missingPolicySymbol`/);
});

test("almost-matching identifiers cannot stall verification", () => {
  const result = check(`a${"Ab".repeat(28)}_\n`);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});

test("wrapped architecture pointers still require a real anchor", () => {
  writeFileSync(
    join(root, "src/example.ts"),
    "/* See\nARCHITECTURE.md#missing-section. */\nexport const validSymbol = 1;\n",
  );
  try {
    const result = check("");
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /no heading/);
  } finally {
    writeFileSync(join(root, "src/example.ts"), "export const validSymbol = 1;\n");
  }
});

test("package executables are not mistaken for repository scripts", () => {
  const result = check("```bash\npnpm exec playwright show-trace trace.zip\n```\n");
  assert.equal(result.status, 0, result.stderr);
});
