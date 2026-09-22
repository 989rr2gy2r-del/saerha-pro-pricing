import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const partsDir = resolve(root, "public/logo-parts");
const output = resolve(root, "public/al-awab-logo.jpg");
const parts = ["part1", "part2", "part3"];

const base64 = (await Promise.all(
  parts.map((part) => readFile(resolve(partsDir, `al-awab-logo.${part}.b64`, "utf8"))),
)).join("").replace(/\s+/g, "");

const buffer = Buffer.from(base64, "base64");
if (buffer.length < 10000 || buffer.toString("ascii", 0, 2) !== "\xFF\xD8") {
  throw new Error("Official AL-AWAB logo assembly failed.");
}

await mkdir(resolve(root, "public"), { recursive: true });
await writeFile(output, buffer);
console.log(`Assembled official AL-AWAB logo: ${buffer.length} bytes`);
