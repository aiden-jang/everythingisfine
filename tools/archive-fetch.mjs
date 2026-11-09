import { writeFile } from "node:fs/promises";
const [url, path] = process.argv.slice(2);
if (!url || !path) throw new Error("Supply an archive URL and an output path");
const { AbortSignal } = globalThis;
const response = await fetch(url, { signal: AbortSignal.timeout(90_000) });
if (!response.ok) throw new Error(`${response.status}: ${url}`);
await writeFile(path, Buffer.from(await response.arrayBuffer()));
