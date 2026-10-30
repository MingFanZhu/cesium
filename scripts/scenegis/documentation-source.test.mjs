import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";
import translations from "../docs-i18n/doclets.cjs";

const root = new URL(
  "../../Build/SceneGIS/Documentation/zh-CN/",
  import.meta.url,
);
const metadata = JSON.parse(
  await readFile(new URL("api-doclets.json", root), "utf8"),
);
const report = JSON.parse(
  await readFile(new URL("translation-report.json", root), "utf8"),
);
const owned = metadata.doclets.filter(
  (doclet) => doclet.sourceLocale === "zh-CN",
);
const ids = new Set(owned.map((doclet) => doclet.id));

test("owned public JSDoc prose is Chinese source with no external fallback", () => {
  assert.ok(owned.length > 900);
  for (const unit of translations.collectUnits(owned)) {
    assert.match(unit.source, /[\u3400-\u9fff]/, `${unit.id} ${unit.field}`);
  }
  for (const doclet of owned) {
    assert.deepEqual(doclet.i18n.translatedFields, []);
    assert.deepEqual(doclet.i18n.fallbackFields, []);
    assert.equal(doclet.i18n.sourceLocale, "zh-CN");
  }
});

test("external catalogs and review reports exclude owned Chinese symbols", () => {
  for (const unit of report.units) {
    assert.ok(!ids.has(unit.id), unit.id);
  }
  const catalog = translations.readCatalog(
    "Documentation/i18n/zh-CN/api",
    "zh-CN",
  );
  for (const entry of catalog.entries) {
    assert.ok(!ids.has(entry.id), entry.id);
  }
  assert.equal(report.counts.stale, 0);
  assert.equal(report.counts.unused, 0);
});
