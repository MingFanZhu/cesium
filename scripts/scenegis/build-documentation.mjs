import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createIndexJs } from "../build.js";
import { getDistributionSymbols } from "./distribution-symbols.mjs";

/** Reuse native JSDoc rendering with a generated presentation-only template. */
export async function buildDocumentation() {
  await createIndexJs("engine");
  await createIndexJs("widgets");
  const symbols = await getDistributionSymbols();
  const { version } = JSON.parse(await readFile("package.json", "utf8"));
  const output = path.resolve("Build/SceneGIS/Documentation");
  const template = path.resolve("Build/SceneGIS-doc-template");
  for (const target of [output, template]) {
    // Build cleanup is restricted to these generated directories under Build.
    if (!target.startsWith(`${path.resolve("Build")}${path.sep}`)) {
      throw new Error("Documentation output must remain inside Build.");
    }
    await rm(target, { recursive: true, force: true });
  }
  await mkdir(template, { recursive: true });
  for (const folder of ["tmpl", "static"]) {
    await cp(
      `Tools/jsdoc/cesium_template/${folder}`,
      path.join(template, folder),
      { recursive: true },
    );
  }
  for (const filename of await readdir(path.join(template, "tmpl"))) {
    const target = path.join(template, "tmpl", filename);
    let source = await readFile(target, "utf8");
    source = source
      .replaceAll("'Cesium Documentation'", "'SceneGIS API Documentation'")
      .replaceAll("'Cesium.'", "'SceneGIS.'")
      .replaceAll(
        'src="javascript/cesiumDoc.js"',
        'src="javascript/scenegisDoc.js"',
      )
      .replace(
        /<a href="(?:index\.html|https:\/\/cesium\.com\/)"[^>]*><img[^>]*CesiumLogo\.png[^>]*><\/a>/g,
        '<a href="index.html" style="font-weight:700;font-size:24px">SceneGIS</a>',
      )
      .replace(
        /<div class="help">[\s\S]*?<\/div>/,
        '<div class="help">SceneGIS engine API · generated from the distributed engine sources.</div>',
      );
    // Source checkouts and hosted source browsers are not required by this artifact.
    if (filename === "sourceLink.tmpl") {
      source = "";
    }
    await writeFile(target, source);
  }
  await cp(
    "scripts/scenegis/jsdoc/search.js",
    path.join(template, "static/javascript/scenegisDoc.js"),
  );
  await writeFile(path.join(template, "package.json"), '{"type":"commonjs"}');
  await writeFile(
    path.join(template, "publish.js"),
    `module.exports = require(${JSON.stringify(path.resolve("scripts/scenegis/publish-documentation.cjs"))});\n`,
  );
  const configuration = JSON.parse(
    await readFile("Tools/jsdoc/conf.json", "utf8"),
  );
  configuration.templates.sourceUrl = "";
  configuration.templates.scenegis = {
    version,
    nativeTemplate: template,
    exports: [...symbols.names],
    aliases: Object.fromEntries(symbols.aliases),
  };
  configuration.opts = {
    ...configuration.opts,
    destination: output,
    template,
    readme: "./scripts/scenegis/jsdoc/README.md",
    mainpagetitle: "SceneGIS engine API",
  };
  const configPath = path.resolve("Build/SceneGIS-jsdoc.json");
  await writeFile(configPath, JSON.stringify(configuration, null, 2));
  execFileSync(
    process.execPath,
    ["node_modules/jsdoc/jsdoc.js", "--configure", configPath, "--pedantic"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        CESIUM_VERSION: version,
        CESIUM_PACKAGES: "",
      },
    },
  );
  await cp("Documentation/Images", path.join(output, "Images"), {
    recursive: true,
  });
  await cp(
    "Documentation/SceneGIS/Distribution.md",
    path.resolve("Build/SceneGIS/README.md"),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await buildDocumentation();
}
