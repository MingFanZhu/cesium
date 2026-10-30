"use strict";

const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const proseFields = ["description", "classdesc", "summary", "deprecated"];
const proseArrays = ["performance", "experimental", "see", "demo"];
const pointerPart = (value) =>
  value.replaceAll("~", "~0").replaceAll("/", "~1");
const identity = (unit) =>
  JSON.stringify([unit.id, unit.field, unit.sourceHash]);
const fieldIdentity = (unit) => JSON.stringify([unit.id, unit.field]);

/** Reference tags may contain guidance/labels, or only literal API/URL targets. */
function hasReferenceProse(value) {
  if (typeof value !== "string") {
    return false;
  }
  const lines = value.split(/\r\n?|\n/);
  const codeStart = lines.findIndex((line) => /^\s*\/\//.test(line));
  const text = lines
    .slice(0, codeStart < 0 ? lines.length : codeStart)
    .join("\n")
    .trim();
  return (
    text.length > 0 &&
    !/^(?:\{@(?:link(?:code|plain)?|tutorial)\s+[^\s|}]+\s*\}|https?:\/\/\S+|\{?[\w$]+(?:[:.#~][\w$]+)*\.?\}?)[.!]?$/.test(
      text,
    )
  );
}

/** Hash unbranded source prose; normalize platform line endings only. */
function sourceHash(source) {
  return `sha256:${createHash("sha256").update(source.replace(/\r\n?/g, "\n")).digest("hex")}`;
}

/** Visit only natural-language fields. Names, type expressions and code are never setters. */
function visitProse(doclets, visitor) {
  for (const doclet of doclets) {
    const id = doclet.longname;
    if (!id) {
      continue;
    }
    function visit(holder, key, field, replace) {
      const source = holder[key];
      if (typeof source === "string" && source.trim()) {
        visitor(
          { id, field, source, sourceHash: sourceHash(source) },
          (text) => {
            holder[key] = replace ? replace(text) : text;
          },
          doclet,
        );
      }
    }
    for (const field of proseFields) {
      visit(doclet, field, field);
    }
    for (const field of proseArrays) {
      for (const [index] of (doclet[field] ?? []).entries()) {
        if (
          (field === "see" || field === "demo") &&
          !hasReferenceProse(doclet[field][index])
        ) {
          continue;
        }
        visit(doclet[field], index, `${field}/${index}`);
      }
    }
    for (const field of ["params", "properties"]) {
      for (const item of doclet[field] ?? []) {
        if (item.name) {
          visit(
            item,
            "description",
            `${field}/${pointerPart(item.name)}/description`,
          );
        }
      }
    }
    for (const field of ["returns", "yields", "exceptions"]) {
      (doclet[field] ?? []).forEach((item, index) => {
        visit(item, "description", `${field}/${index}/description`);
      });
    }
    (doclet.examples ?? []).forEach((example, index) => {
      const match = /^(\s*<caption>)([\s\S]*?)(<\/caption>)/.exec(example);
      if (match) {
        const caption = { text: match[2] };
        visit(caption, "text", `examples/${index}/caption`, (text) => {
          doclet.examples[index] =
            `${match[1]}${text}${match[3]}${example.slice(match[0].length)}`;
          return text;
        });
      }
    });
  }
}

/** Extract a deduplicated offline translation inventory from raw JSDoc data. */
function collectUnits(doclets) {
  const units = new Map();
  visitProse(doclets, (unit) => units.set(identity(unit), unit));
  return [...units.values()].sort((a, b) =>
    identity(a).localeCompare(identity(b)),
  );
}

/** Apply build-specific prose cleanup without exposing identifiers or executable examples. */
function mapProse(doclets, transform) {
  visitProse(doclets, (unit, set) => set(transform(unit.source)));
}

/** Preserve link targets, markup/attributes and literal code while allowing translated labels. */
function protectedTokens(text) {
  const links = [];
  const markup = [];
  const literals = [];
  for (const match of text.matchAll(
    /\{@(?:link(?:code|plain)?|tutorial)\s+([^\s|}]+)/g,
  )) {
    links.push(match[1]);
  }
  for (const match of text.matchAll(/<\/?[A-Za-z][^>]*>/g)) {
    markup.push(match[0]);
  }
  for (const match of text.matchAll(
    /<(code|pre)\b[^>]*>[\s\S]*?<\/\1>|`[^`]*`|https?:\/\/[^\s<>"'{}|]+/g,
  )) {
    literals.push(match[0]);
  }
  return { links: links.sort(), markup, literals: literals.sort() };
}

function validateCatalog(catalog, locale) {
  if (
    catalog.schemaVersion !== 1 ||
    catalog.locale !== locale ||
    !Array.isArray(catalog.entries)
  ) {
    throw new Error(`Invalid translation catalog for ${locale}.`);
  }
  for (const entry of catalog.entries) {
    if (
      typeof entry.id !== "string" ||
      !entry.id ||
      typeof entry.field !== "string" ||
      !entry.field ||
      !/^sha256:[a-f0-9]{64}$/.test(entry.sourceHash) ||
      typeof entry.text !== "string" ||
      !entry.text.trim()
    ) {
      throw new Error(`Invalid translation entry: ${entry.id} ${entry.field}.`);
    }
  }
}

/** Read locale data only; independent of source layout and distribution branding. */
function readCatalog(directory, locale) {
  const entries = [];
  for (const filename of fs.readdirSync(directory).sort()) {
    if (filename.endsWith(".json")) {
      const catalog = JSON.parse(
        fs.readFileSync(path.join(directory, filename), "utf8"),
      );
      validateCatalog(catalog, locale);
      entries.push(...catalog.entries);
    }
  }
  return { schemaVersion: 1, locale, entries };
}

/** Isolate mutable JSDoc records before language annotations or text replacement. */
function isolateProse(doclets) {
  // JSDoc enum properties can alias another doclet. Isolate mutable prose records first.
  for (const doclet of doclets) {
    for (const field of [
      "params",
      "properties",
      "returns",
      "yields",
      "exceptions",
    ]) {
      if (doclet[field]) {
        doclet[field] = doclet[field].map((item) => ({ ...item }));
      }
    }
    for (const field of [...proseArrays, "examples"]) {
      if (doclet[field]) {
        doclet[field] = [...doclet[field]];
      }
    }
  }
}

/** Mark prose maintained directly in the requested source language. */
function markSourceDoclets(doclets, locale) {
  isolateProse(doclets);
  for (const doclet of doclets) {
    doclet.sourceLocale = locale;
    doclet.i18n = {
      locale,
      sourceLocale: locale,
      sourceFields: [],
      translatedFields: [],
      fallbackFields: [],
    };
  }
  for (const doclet of doclets) {
    doclet.i18n.sourceFields = collectUnits([doclet]).map((unit) => unit.field);
  }
}

/** Apply exact source-bound prose translations in place before any brand mapping/rendering. */
function localizeDoclets(doclets, catalog) {
  const { locale } = catalog;
  validateCatalog(catalog, locale);
  isolateProse(doclets);
  const translations = new Map();
  const fields = new Set(catalog.entries.map(fieldIdentity));
  for (const entry of catalog.entries) {
    const key = identity(entry);
    if (translations.has(key)) {
      throw new Error(`Duplicate translation: ${entry.id} ${entry.field}.`);
    }
    translations.set(key, entry);
  }
  const records = new Map();
  const liveFields = new Set();
  const used = new Set();
  visitProse(doclets, (unit, set, doclet) => {
    const key = identity(unit);
    const fieldKey = fieldIdentity(unit);
    liveFields.add(fieldKey);
    const entry = translations.get(key);
    const status = entry
      ? "translated"
      : fields.has(fieldKey)
        ? "stale"
        : "missing";
    if (entry) {
      if (
        JSON.stringify(protectedTokens(unit.source)) !==
        JSON.stringify(protectedTokens(entry.text))
      ) {
        throw new Error(
          `Translation changes protected markup, links or code: ${unit.id} ${unit.field}.`,
        );
      }
      set(entry.text);
      used.add(key);
    }
    records.set(key, { ...unit, status });
    doclet.i18n ??= { locale, translatedFields: [], fallbackFields: [] };
    doclet.i18n[entry ? "translatedFields" : "fallbackFields"].push(unit.field);
  });
  const units = [...records.values()].sort((a, b) =>
    identity(a).localeCompare(identity(b)),
  );
  return {
    schemaVersion: 1,
    locale,
    sourceLocale: "en-US",
    counts: {
      total: units.length,
      translated: units.filter((unit) => unit.status === "translated").length,
      missing: units.filter((unit) => unit.status === "missing").length,
      stale: units.filter((unit) => unit.status === "stale").length,
      unused: catalog.entries.filter((entry) => !used.has(identity(entry)))
        .length,
    },
    units,
    unused: catalog.entries
      .filter((entry) => !used.has(identity(entry)))
      .map((entry) => ({
        id: entry.id,
        field: entry.field,
        sourceHash: entry.sourceHash,
        reason: liveFields.has(fieldIdentity(entry))
          ? "source-changed"
          : "field-removed",
      })),
  };
}

/** Pending records remain outside maintained catalogs until their text has been supplied. */
function pendingEntries(inventory, catalog) {
  validateCatalog(catalog, catalog.locale);
  const existing = new Set(catalog.entries.map(identity));
  return {
    schemaVersion: 1,
    locale: catalog.locale,
    entries: inventory.units
      .filter((unit) => !existing.has(identity(unit)))
      .map((unit) => ({
        ...unit,
        text: "",
      })),
  };
}

module.exports = {
  collectUnits,
  localizeDoclets,
  markSourceDoclets,
  mapProse,
  pendingEntries,
  readCatalog,
  sourceHash,
};
