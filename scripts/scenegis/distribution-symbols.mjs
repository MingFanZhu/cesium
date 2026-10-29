import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

/** Read generated barrels instead of duplicating native discovery globs. */
export async function getDistributionSymbols() {
  const names = new Set(["VERSION"]);
  const aliases = new Map();
  const sources = new Map();
  for (const workspace of ["engine", "widgets"]) {
    const filename = `packages/${workspace}/index.js`;
    const file = ts.createSourceFile(
      filename,
      await readFile(filename, "utf8"),
      ts.ScriptTarget.Latest,
    );
    for (const statement of file.statements) {
      if (
        !ts.isExportDeclaration(statement) ||
        !statement.exportClause ||
        !ts.isNamedExports(statement.exportClause)
      ) {
        continue;
      }
      const sourcePath = path.resolve(
        path.dirname(filename),
        statement.moduleSpecifier.text,
      );
      const source = await readFile(sourcePath, "utf8");
      for (const element of statement.exportClause.elements) {
        const name = element.name.text;
        names.add(name);
        sources.set(sourcePath.replaceAll("\\", "/"), name);
        const alias = /@alias\s+([\w$]+)\s*(?:\r?\n)/.exec(source)?.[1];
        if (alias && alias !== name) {
          aliases.set(alias, name);
        }
      }
    }
  }
  return { names, aliases, sources };
}
