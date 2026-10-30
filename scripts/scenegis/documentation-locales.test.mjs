import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";
import translations from "../docs-i18n/doclets.cjs";

const root = new URL("../../Build/SceneGIS/Documentation/", import.meta.url);
const load = async (filename) =>
  JSON.parse(await readFile(new URL(filename, root), "utf8"));
const english = await load("api-doclets.json");
const chinese = await load("zh-CN/api-doclets.json");

function signature(doclet) {
  const {
    id,
    name,
    kind,
    memberof,
    scope,
    type,
    augments,
    exportName,
    url,
    defaultvalue,
    readonly,
    isEnum,
  } = doclet;
  const result = {
    id,
    name,
    kind,
    memberof,
    scope,
    type,
    augments,
    exportName,
    url,
    defaultvalue,
    readonly,
    isEnum,
  };
  for (const field of [
    "params",
    "properties",
    "returns",
    "exceptions",
    "yields",
  ]) {
    result[field] = doclet[field]?.map((item) => {
      const parameter = { ...item };
      delete parameter.description;
      return parameter;
    });
  }
  result.examples = doclet.examples?.map((example) =>
    example.replace(/^(\s*<caption>)[\s\S]*?(<\/caption>)/, "$1$2"),
  );
  return result;
}

test("locale metadata preserves all canonical symbols, signatures, type data and example code", async () => {
  assert.equal(english.locale, "en-US");
  assert.equal(chinese.locale, "zh-CN");
  assert.equal(chinese.sourceLocale, "en-US");
  assert.deepEqual(
    chinese.doclets.map(signature),
    english.doclets.map(signature),
  );
  const locales = await load("locales.json");
  assert.deepEqual(
    locales.locales.map((entry) => entry.locale),
    ["en-US", "zh-CN"],
  );
  for (const locale of ["", "zh-CN/"]) {
    const indexPage = await readFile(
      new URL(`${locale}index.html`, root),
      "utf8",
    );
    assert.match(indexPage, /id="DocLanguage"/);
    assert.match(indexPage, /id="DocMessages"/);
  }
});

test("coverage is honest, source-bound and includes every public extension entry description", async () => {
  const report = await load("zh-CN/translation-report.json");
  const source = await load("translation-source.json");
  assert.equal(report.counts.stale, 0);
  assert.equal(report.counts.unused, 0);
  assert.ok(report.counts.translated > 3000);
  assert.ok(report.counts.missing > 0);
  assert.equal(report.counts.total, source.units.length);
  assert.equal(
    report.counts.total,
    report.counts.translated + report.counts.missing + report.counts.stale,
  );
  for (const doclet of chinese.doclets.filter(
    (doclet) => !doclet.memberof && doclet.exportName?.startsWith("SceneGIS"),
  )) {
    assert.ok(
      doclet.i18n.translatedFields.some(
        (field) => field === "description" || field === "classdesc",
      ),
      doclet.id,
    );
  }
  for (const unit of source.units) {
    assert.equal(unit.sourceHash, translations.sourceHash(unit.source));
    assert.doesNotMatch(
      unit.source,
      new RegExp("SCENEGIS_" + "PATCH_(BEGIN|END)"),
    );
  }
  function inspectMetadata(value) {
    if (!value || typeof value !== "object") {
      return;
    }
    if (value.meta) {
      assert.equal(value.meta.code, undefined);
      assert.equal(value.meta.path, undefined);
    }
    for (const child of Object.values(value)) {
      inspectMetadata(child);
    }
  }
  inspectMetadata(english.doclets);
  inspectMetadata(chinese.doclets);
  const untranslated = report.units.find(
    (unit) => unit.status === "missing" && unit.field === "description",
  );
  const original = english.doclets.find(
    (doclet) => doclet.id === untranslated.id,
  );
  const localized = chinese.doclets.find(
    (doclet) => doclet.id === untranslated.id,
  );
  assert.equal(localized.description, original.description);
  assert.ok(localized.i18n.fallbackFields.includes("description"));
});

test("Chinese prose, localized tables and raw pre-brand inventory reach the generated artifacts", async () => {
  const lookup = new Map(chinese.doclets.map((doclet) => [doclet.id, doclet]));
  assert.match(lookup.get("Scene#pick").description, /拾取/);
  assert.match(lookup.get("Viewer").description, /构建应用/);
  assert.match(
    lookup
      .get("SceneGISWindVisualization")
      .params.find((param) => param.name === "options.trailDuration")
      .description,
    /模拟历史的秒数/,
  );
  const page = await readFile(
    new URL("zh-CN/SceneGISWindVisualization.html", root),
    "utf8",
  );
  assert.match(page, /<html lang="zh-CN">/);
  assert.match(page, /<th>名称<\/th>/);
  assert.match(page, /<th class="last">说明<\/th>/);
  assert.match(page, /未译及待复核字段保留英文/);
  assert.match(page, /id="DocLanguage" data-root="\.\.\/"/);
  const source = await load("translation-source.json");
  assert.ok(source.units.some((unit) => /\bCesium\./.test(unit.source)));
});
