import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";
import translations from "../docs-i18n/doclets.cjs";

const root = new URL("../../Build/SceneGIS/Documentation/", import.meta.url);
const load = async (filename) =>
  JSON.parse(await readFile(new URL(filename, root), "utf8"));
const metadata = await load("api-doclets.json");
const source = await load("translation-source.json");
const report = await load("translation-report.json");

test("one Chinese edition retains explicit provenance without locale discovery or switching", async () => {
  assert.equal(metadata.locale, "zh-CN");
  assert.deepEqual(metadata.sourceLocales, ["en-US", "zh-CN"]);
  const files = await readdir(root);
  for (const removed of ["en-US", "zh-CN", "locales.json"]) {
    assert.ok(!files.includes(removed), removed);
  }
  for (const filename of [
    "index.html",
    "Viewer.html",
    "SceneGISWindVisualization.html",
  ]) {
    const page = await readFile(new URL(filename, root), "utf8");
    assert.match(page, /<html lang="zh-CN">/);
    assert.match(page, /id="DocMessages"/);
    assert.doesNotMatch(page, /id="DocLanguage"/);
  }
  for (const doclet of metadata.doclets) {
    assert.ok(metadata.sourceLocales.includes(doclet.sourceLocale), doclet.id);
    if (doclet.meta) {
      const owned = /^packages\/(engine|widgets)\/Source\/SceneGIS\//.test(
        doclet.meta.filename,
      );
      assert.equal(doclet.sourceLocale, owned ? "zh-CN" : "en-US", doclet.id);
    }
  }
});

test("native inventory precedes branding and complete translations retain source provenance", () => {
  assert.equal(source.sourceLocale, "en-US");
  assert.equal(report.counts.total, source.units.length);
  assert.equal(
    report.counts.total,
    report.counts.translated + report.counts.missing + report.counts.stale,
  );
  assert.equal(report.counts.translated, report.counts.total);
  assert.equal(report.counts.missing, 0);
  assert.equal(report.counts.stale, 0);
  assert.equal(report.counts.unused, 0);
  for (const unit of source.units) {
    assert.equal(unit.sourceHash, translations.sourceHash(unit.source));
    assert.doesNotMatch(
      unit.source,
      new RegExp("SCENEGIS_" + "PATCH_(BEGIN|END)"),
    );
  }
  assert.ok(source.units.some((unit) => /\bCesium\./.test(unit.source)));
  for (const doclet of metadata.doclets) {
    if (
      doclet.sourceLocale === "en-US" &&
      translations.collectUnits([doclet]).length > 0
    ) {
      assert.deepEqual(doclet.i18n.fallbackFields, [], doclet.id);
    }
  }
});

test("Chinese source and native translations both reach localized HTML tables", async () => {
  const lookup = new Map(metadata.doclets.map((doclet) => [doclet.id, doclet]));
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
    new URL("SceneGISWindVisualization.html", root),
    "utf8",
  );
  assert.match(page, /<th>名称<\/th>/);
  assert.match(page, /<th class="last">说明<\/th>/);
});

test("API pages omit process notices and footers, with the report only in homepage resources", async () => {
  for (const filename of (await readdir(root)).filter((name) =>
    name.endsWith(".html"),
  )) {
    const page = await readFile(new URL(filename, root), "utf8");
    assert.doesNotMatch(
      page,
      /class="(?:doc-coverage|help)"|<footer\b/,
      filename,
    );
    assert.doesNotMatch(
      page,
      /SceneGIS 扩展说明直接维护中文|根据当前发行版本的源码生成/,
      filename,
    );
    if (filename === "index.html") {
      assert.match(page, /文档资源/);
      assert.match(page, /href="translation-report\.json"/);
      assert.match(page, /href="\.\.\/README\.md"/);
    } else {
      assert.doesNotMatch(page, /href="translation-report\.json"/, filename);
    }
  }
});
