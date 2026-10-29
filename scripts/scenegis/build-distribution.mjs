import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { buildCesium, buildEngine, buildWidgets } from "../build.js";

import { getDistributionSymbols } from "./distribution-symbols.mjs";

export const distributionDirectory = "Build/SceneGIS";

/** Generate a standalone external-module declaration from native JSDoc output. */
export function createDistributionDeclarations(source, symbols, version) {
  const file = ts.createSourceFile(
    "Cesium.d.ts",
    source,
    ts.ScriptTarget.Latest,
  );
  const module = file.statements.find(
    (statement) =>
      ts.isModuleDeclaration(statement) && statement.name.text === "cesium",
  );
  if (!module || !ts.isModuleBlock(module.body)) {
    throw new Error("Expected the generated cesium declaration module.");
  }
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const body = module.body.statements
    .map((statement) => {
      let text = printer.printNode(ts.EmitHint.Unspecified, statement, file);
      const name =
        statement.name?.text ??
        statement.declarationList?.declarations[0]?.name?.text;
      // tsd-jsdoc also emits file-local values. Keep their declaration types local.
      if (
        symbols &&
        name &&
        !symbols.names.has(name) &&
        !ts.isInterfaceDeclaration(statement) &&
        !ts.isTypeAliasDeclaration(statement)
      ) {
        text = text.replace(
          /\bexport (?=(?:class|function|namespace|enum|const|let|var)\b)/,
          "declare ",
        );
        const alias = symbols.aliases.get(name);
        if (alias) {
          text += `\nexport { ${name} as ${alias} };`;
        }
      }
      return text.replace(/\bCesium\./g, "SceneGIS.");
    })
    .join("\n\n");
  return `// Generated from the current engine and Widgets JSDoc.\nexport as namespace SceneGIS;\n\n${
    body
  }\n${
    version === undefined
      ? ""
      : `export const VERSION: ${JSON.stringify(version)};\n`
  }`;
}

/** Build a self-contained browser/ESM distribution from the native source chain. */
export async function buildDistribution() {
  await buildEngine({});
  await buildWidgets({});
  await buildCesium({
    outputDirectory: distributionDirectory,
    globalName: "SceneGIS",
    iife: true,
    node: false,
    minify: true,
    // Keep public input validation in this first branded distribution.
    removePragmas: false,
    sourcemap: false,
  });

  execFileSync(process.execPath, ["node_modules/gulp/bin/gulp.js", "buildTs"], {
    stdio: "inherit",
  });
  await mkdir(distributionDirectory, { recursive: true });
  const { version } = JSON.parse(await readFile("package.json", "utf8"));
  await writeFile(
    path.join(distributionDirectory, "SceneGIS.d.ts"),
    createDistributionDeclarations(
      await readFile("Source/Cesium.d.ts", "utf8"),
      await getDistributionSymbols(),
      version,
    ),
  );
  await writeFile(
    path.join(distributionDirectory, "index.d.ts"),
    'export * from "./SceneGIS.js";\nexport as namespace SceneGIS;\n',
  );
  await writeFile(
    path.join(distributionDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "@scenegis/engine",
        version,
        private: true,
        type: "module",
        module: "./index.js",
        types: "./SceneGIS.d.ts",
        exports: {
          ".": { types: "./SceneGIS.d.ts", import: "./index.js" },
          "./*": "./*",
        },
        sideEffects: ["./Widgets/**/*.css"],
        license: "Apache-2.0",
      },
      null,
      2,
    )}\n`,
  );
  for (const file of [
    "LICENSE.md",
    "ThirdParty.json",
    "ThirdParty.extra.json",
  ]) {
    await copyFile(file, path.join(distributionDirectory, file));
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildDistribution();
}
