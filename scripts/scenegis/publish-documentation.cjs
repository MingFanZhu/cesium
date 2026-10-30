"use strict";
/* global env */

const fs = require("node:fs");
const path = require("node:path");
const helper = require("jsdoc/lib/jsdoc/util/templateHelper");
const translations = require("../docs-i18n/doclets.cjs");
const annotationPrefix = "SCENEGIS_" + "PATCH_";
const annotationPattern = new RegExp(
  `^[ \\t]*${annotationPrefix}(?:BEGIN|END) SGP-\\d{4}[^\\r\\n]*`,
  "gm",
);
const native = require("../../Tools/jsdoc/cesium_template/publish.js");

function canonical(name) {
  return name.replace(/^module:/, "");
}

function displayName(name, aliases) {
  const value = canonical(name);
  const root = value.split(/[.#~]/, 1)[0];
  return `SceneGIS.${aliases[root] ?? root}${value.slice(root.length)}`;
}

/** Map examples and prose; retain canonical link targets for the native resolver. */
function brandText(value) {
  return value
    .replace(
      /\{@(link(?:code|plain)?)\s+(?:Cesium|SceneGIS)\.([^\s|}]+)([^}]*)\}/g,
      (...parts) => {
        const [, tag, target, label] = parts;
        return `{@${tag} ${target}${label || `|SceneGIS.${target}`}}`;
      },
    )
    .replace(/\bCesium\./g, "SceneGIS.");
}

function mapText(value) {
  if (typeof value === "string") {
    return brandText(value);
  }
  if (Array.isArray(value)) {
    return value.map(mapText);
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      if (
        [
          "description",
          "classdesc",
          "summary",
          "examples",
          "caption",
          "see",
          "deprecated",
          "performance",
          "demo",
          "experimental",
        ].includes(key)
      ) {
        value[key] = mapText(value[key]);
      } else if (
        ["params", "returns", "properties", "exceptions", "yields"].includes(
          key,
        )
      ) {
        value[key] = mapText(value[key]);
      }
    }
  }
  return value;
}

function cleanDoclet(doclet) {
  const result = {};
  for (const [key, value] of Object.entries(doclet)) {
    if (
      ["comment", "meta", "___id", "___s", "__taffyid", "__taffy"].includes(key)
    ) {
      continue;
    }
    result[key] = Array.isArray(value)
      ? value.map((item) =>
          item && typeof item === "object" ? cleanDoclet(item) : item,
        )
      : value && typeof value === "object"
        ? cleanDoclet(value)
        : value;
  }
  if (doclet.meta) {
    result.meta = {
      filename: path
        .relative(
          process.cwd(),
          path.join(doclet.meta.path, doclet.meta.filename),
        )
        .replaceAll("\\", "/"),
      lineno: doclet.meta.lineno,
      columnno: doclet.meta.columnno,
    };
  }
  return JSON.parse(JSON.stringify(result));
}

exports.publish = function (data, opts, tutorials) {
  const settings = env.conf.templates.scenegis;
  const names = new Set([
    ...settings.exports,
    ...Object.keys(settings.aliases),
  ]);
  const raw = helper.prune(data)().get();
  for (const doclet of raw) {
    if (
      ["typedef", "interface", "external"].includes(doclet.kind) &&
      !doclet.memberof
    ) {
      names.add(canonical(doclet.longname));
    }
  }
  // Native pruning can leave public-looking members of a private parent.
  const publicRoots = new Set(
    raw
      .filter(
        (doclet) => !doclet.memberof && names.has(canonical(doclet.longname)),
      )
      .map((doclet) => canonical(doclet.longname)),
  );
  const publicDoclets = raw.filter((doclet) => {
    if (!doclet.longname || ["file", "package"].includes(doclet.kind)) {
      return false;
    }
    const root = canonical(doclet.longname).split(/[.#~]/, 1)[0];
    return publicRoots.has(root);
  });
  publicDoclets.push({
    name: "VERSION",
    longname: "VERSION",
    kind: "member",
    scope: "global",
    type: { names: ["string"] },
    readonly: true,
    description: "此发行包的引擎版本字符串。",
    defaultvalue: settings.version,
  });
  // Integration annotations in source comments are not API prose or translation units.
  translations.mapProse(publicDoclets, (text) =>
    text.replace(annotationPattern, ""),
  );
  const owned = publicDoclets.filter((doclet) => {
    if (!doclet.meta) {
      return doclet.longname === "VERSION";
    }
    const filename = path
      .relative(
        process.cwd(),
        path.join(doclet.meta.path, doclet.meta.filename),
      )
      .replaceAll("\\", "/");
    return /^packages\/(engine|widgets)\/Source\/SceneGIS\//.test(filename);
  });
  const ownSet = new Set(owned);
  const nativeDoclets = publicDoclets.filter((doclet) => !ownSet.has(doclet));
  for (const doclet of nativeDoclets) {
    doclet.sourceLocale = "en-US";
  }
  translations.markSourceDoclets(owned, "zh-CN");
  fs.mkdirSync(opts.destination, { recursive: true });
  const locale = settings.locale;
  if (locale === "en-US") {
    fs.writeFileSync(
      path.join(opts.destination, "translation-source.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          sourceLocale: locale,
          units: translations.collectUnits(nativeDoclets),
        },
        null,
        2,
      ),
    );
  } else {
    const catalog = translations.readCatalog(
      settings.translationDirectory,
      locale,
    );
    const report = translations.localizeDoclets(nativeDoclets, catalog);
    fs.writeFileSync(
      path.join(opts.destination, "translation-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      `Documentation ${locale}: ${report.counts.translated}/${report.counts.total} translated fields, ${report.counts.stale} stale, ${report.counts.unused} unused.`,
    );
  }
  publicDoclets.forEach(mapText);
  const doclets = publicDoclets.map(cleanDoclet);
  // Render through the native publisher with its actual prune/link/anchor allocation.
  data().remove();
  data.insert(
    publicDoclets.map((doclet) => {
      const result = { ...doclet };
      delete result.___id;
      delete result.___s;
      const alias = settings.aliases[canonical(result.longname)];
      if (alias) {
        result.name = alias;
      }
      return result;
    }),
  );
  native.publish(
    data,
    { ...opts, template: settings.nativeTemplate },
    tutorials,
  );
  const symbols = new Map();
  for (const doclet of doclets) {
    const id = doclet.longname;
    doclet.id = id;
    doclet.displayName = displayName(id, settings.aliases);
    doclet.url = helper.longnameToUrl[canonical(id)];
    const root = canonical(id).split(/[.#~]/, 1)[0];
    const exportName = settings.aliases[root] ?? root;
    if (settings.exports.includes(exportName)) {
      doclet.exportName = exportName;
    }
    if (!symbols.has(id)) {
      symbols.set(id, {
        id,
        name: doclet.name,
        displayName: doclet.displayName,
        kind: doclet.isEnum ? "enum" : doclet.kind,
        memberof: doclet.memberof,
        scope: doclet.scope,
        exportName: doclet.exportName,
        url: doclet.url,
        summary:
          doclet.summary ??
          doclet.description?.replace(/<[^>]*>/g, "").split(/\n\s*\n/)[0],
      });
    }
  }
  const header = {
    schemaVersion: 1,
    namespace: "SceneGIS",
    locale,
    sourceLocales: ["en-US", "zh-CN"],
    version: settings.version,
    generator: { name: "JSDoc", version: env.version.number },
  };
  fs.writeFileSync(
    path.join(opts.destination, "api-doclets.json"),
    JSON.stringify({ ...header, doclets }, null, 2),
  );
  fs.writeFileSync(
    path.join(opts.destination, "api-index.json"),
    JSON.stringify(
      {
        ...header,
        symbols: [...symbols.values()].sort((a, b) => a.id.localeCompare(b.id)),
      },
      null,
      2,
    ),
  );
};
