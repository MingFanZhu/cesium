import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import translations from "./doclets.cjs";

const { values } = parseArgs({
  options: {
    source: { type: "string" },
    catalog: { type: "string" },
    locale: { type: "string" },
    output: { type: "string" },
  },
});
if (!["source", "catalog", "locale", "output"].every((key) => values[key])) {
  throw new Error(
    "Usage: node catalog.mjs --source inventory.json --catalog locale/api --locale zh-CN --output pending.json",
  );
}
const inventory = JSON.parse(await readFile(values.source, "utf8"));
const catalog = translations.readCatalog(values.catalog, values.locale);
const pending = translations.pendingEntries(inventory, catalog);
await mkdir(path.dirname(values.output), { recursive: true });
await writeFile(values.output, `${JSON.stringify(pending, null, 2)}\n`);
process.stdout.write(
  `Wrote ${pending.entries.length} pending fields to ${values.output}\n`,
);
