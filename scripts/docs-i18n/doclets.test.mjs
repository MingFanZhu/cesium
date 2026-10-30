import assert from "node:assert/strict";
import test from "node:test";
import translations from "./doclets.cjs";

const { collectUnits, localizeDoclets, pendingEntries, sourceHash } =
  translations;
const catalog = (entries) => ({ schemaVersion: 1, locale: "zh-CN", entries });
const entry = (doclets, field, text, id = "Example") => ({
  ...collectUnits(doclets).find(
    (unit) => unit.id === id && unit.field === field,
  ),
  text,
});

test("reference and demo prose includes labels while literal references and code stay untouched", () => {
  const references = [
    "Cartesian3",
    "module:Math.PI",
    "PerspectiveFrustum#projectionMatrix.",
    "{Context#depthTexture}",
    "https://example.test/api",
    "{@link Scene}",
    "{@link https://example.test/api}.",
    "queryToObject\r// str will be:\r// 'name=value'\rconst example = 1;",
  ];
  const docs = [
    {
      longname: "Example",
      see: [...references, "Use {@link Scene|the scene} for rendering."],
      demo: ["The {@link https://example.test/demo|Demo} shows three modes."],
    },
  ];
  assert.deepEqual(
    collectUnits(docs)
      .map((u) => u.field)
      .sort(),
    ["demo/0", "see/8"],
  );
  localizeDoclets(
    docs,
    catalog([
      entry(docs, "see/8", "使用 {@link Scene|场景}进行渲染。"),
      entry(
        docs,
        "demo/0",
        "{@link https://example.test/demo|示例}展示三种模式。",
      ),
    ]),
  );
  assert.deepEqual(docs[0].see.slice(0, 8), references);
  assert.match(docs[0].demo[0], /展示三种模式/);
  const changed = [
    {
      longname: "Example",
      demo: [
        "The {@link https://example.test/demo|New demo} shows three modes.",
      ],
    },
  ];
  const stale = localizeDoclets(
    changed,
    catalog([
      entry(
        [
          {
            longname: "Example",
            demo: [
              "The {@link https://example.test/demo|Demo} shows three modes.",
            ],
          },
        ],
        "demo/0",
        "{@link https://example.test/demo|示例}展示三种模式。",
      ),
    ]),
  );
  assert.equal(stale.counts.stale, 1);
  assert.match(changed[0].demo[0], /New demo/);
});

test("reference arrays are isolated between doclets before localization", () => {
  const shared = ["{@link https://example.test/api|API guide}"];
  const docs = [
    { longname: "Example", see: shared },
    { longname: "Other", see: shared },
  ];
  const report = localizeDoclets(
    docs,
    catalog([
      entry(docs, "see/0", "{@link https://example.test/api|API 指南}"),
    ]),
  );
  assert.equal(report.counts.translated, 1);
  assert.equal(report.counts.missing, 1);
  assert.match(docs[0].see[0], /API 指南/);
  assert.equal(docs[1].see[0], shared[0]);
  assert.match(shared[0], /API guide/);
});

test("localizes only prose and captions while preserving semantic and executable data", () => {
  const docs = [
    {
      longname: "Example",
      description:
        "Returns {@link Scene|the scene} with <code>ready</code> state.",
      params: [
        {
          name: "options.enabled",
          type: { names: ["boolean"] },
          defaultvalue: true,
          description: "Enable drawing.",
        },
      ],
      properties: [{ name: "position", description: "Position in meters." }],
      returns: [{ type: { names: ["Scene"] }, description: "The scene." }],
      exceptions: [
        { type: { names: ["Error"] }, description: "Invalid input." },
      ],
      experimental: ["This API may change."],
      examples: [
        "<caption>Create an instance.</caption>\nconst x = new Cesium.Example({ enabled: true });",
      ],
    },
  ];
  const before = JSON.parse(JSON.stringify(docs[0]));
  const entries = [
    entry(
      docs,
      "description",
      "返回处于 <code>ready</code> 状态的{@link Scene|场景}。",
    ),
    entry(docs, "params/options.enabled/description", "是否启用绘制。"),
    entry(docs, "properties/position/description", "位置，单位为米。"),
    entry(docs, "returns/0/description", "场景。"),
    entry(docs, "exceptions/0/description", "输入无效。"),
    entry(docs, "experimental/0", "此 API 可能变化。"),
    entry(docs, "examples/0/caption", "创建实例。"),
  ];
  const report = localizeDoclets(docs, catalog(entries));
  assert.equal(report.counts.translated, 7);
  assert.equal(report.counts.missing, 0);
  assert.equal(docs[0].longname, before.longname);
  assert.deepEqual(docs[0].params[0].type, before.params[0].type);
  assert.equal(docs[0].params[0].name, "options.enabled");
  assert.equal(docs[0].params[0].defaultvalue, true);
  assert.equal(
    docs[0].examples[0].split("</caption>")[1],
    before.examples[0].split("</caption>")[1],
  );
  assert.equal(docs[0].returns[0].type.names[0], "Scene");
  assert.equal(docs[0].i18n.locale, "zh-CN");
});

test("source changes and removed fields are reported without applying outdated translations", () => {
  const docs = [
    {
      longname: "Example",
      description: "New description.",
      params: [{ name: "x", description: "X position." }],
    },
  ];
  const entries = [
    {
      id: "Example",
      field: "description",
      sourceHash: sourceHash("Old description."),
      text: "旧说明。",
    },
    {
      id: "Removed",
      field: "description",
      sourceHash: sourceHash("Removed."),
      text: "已移除。",
    },
  ];
  const report = localizeDoclets(docs, catalog(entries));
  assert.deepEqual(report.counts, {
    total: 2,
    translated: 0,
    missing: 1,
    stale: 1,
    unused: 2,
  });
  assert.equal(docs[0].description, "New description.");
  assert.deepEqual(
    report.unused.map((item) => item.reason),
    ["source-changed", "field-removed"],
  );
  assert.equal(
    pendingEntries({ units: collectUnits(docs) }, catalog(entries)).entries
      .length,
    2,
  );
});

test("named parameter selectors survive reordering and escape pointer characters", () => {
  const docs = [
    {
      longname: "Example",
      params: [
        { name: "a/b~c", description: "First." },
        { name: "options.width", description: "Width." },
      ],
    },
  ];
  const entries = [entry(docs, "params/a~1b~0c/description", "第一个。")];
  docs[0].params.reverse();
  localizeDoclets(docs, catalog(entries));
  assert.equal(docs[0].params[1].description, "第一个。");
  assert.equal(docs[0].params[0].description, "Width.");
});

test("overloads with the same symbol and field use exact source text identities", () => {
  const docs = [
    { longname: "Example", description: "First overload." },
    { longname: "Example", description: "Second overload." },
    { longname: "Example", description: "First overload." },
  ];
  const units = collectUnits(docs);
  assert.equal(units.length, 2);
  localizeDoclets(
    docs,
    catalog(
      units.map((unit) => ({
        ...unit,
        text: unit.source.startsWith("First") ? "第一种。" : "第二种。",
      })),
    ),
  );
  assert.deepEqual(
    docs.map((doc) => doc.description),
    ["第一种。", "第二种。", "第一种。"],
  );
});

test("rejects duplicate catalog identities and malformed records", () => {
  const docs = [{ longname: "Example", description: "Example." }];
  const item = entry(docs, "description", "示例。");
  assert.throws(
    () => localizeDoclets(docs, catalog([item, item])),
    /Duplicate translation/,
  );
  assert.throws(
    () => localizeDoclets(docs, catalog([{ ...item, sourceHash: "bad" }])),
    /Invalid translation entry/,
  );
  assert.throws(
    () => localizeDoclets(docs, { ...catalog([]), schemaVersion: 2 }),
    /Invalid translation catalog/,
  );
});

test("rejects changed HTML attributes, inline link targets and literal code", () => {
  for (const [source, translated] of [
    ["<b>Alpha</b><i>Beta</i>", "</b>甲<b><i>乙</i>"],
    [
      'See <a href="https://example.org/api">API</a>.',
      '查看<a href="https://example.org/other">API</a>。',
    ],
    ["See {@link Scene|the scene}.", "查看{@link Camera|场景}。"],
    ["Use <code>x + 1</code>.", "使用 <code>x + 2</code>。"],
    ["Use `x`.", "使用 `y`。"],
  ]) {
    const docs = [{ longname: "Example", description: source }];
    assert.throws(
      () =>
        localizeDoclets(
          docs,
          catalog([entry(docs, "description", translated)]),
        ),
      /protected markup, links or code/,
    );
  }
});

test("source hashing normalizes CRLF without depending on brand namespace", () => {
  assert.equal(sourceHash("A\r\nB"), sourceHash("A\nB"));
  assert.equal(sourceHash("A\rB"), sourceHash("A\nB"));
  const docs = [{ longname: "NativeClass#run", description: "Run a step." }];
  localizeDoclets(
    docs,
    catalog([{ ...collectUnits(docs)[0], text: "执行一步。" }]),
  );
  assert.equal(docs[0].longname, "NativeClass#run");
  assert.equal(docs[0].description, "执行一步。");
});

test("direct source-language prose has provenance without external translation gaps", () => {
  const member = {
    longname: "Example#value",
    name: "value",
    description: "当前值。",
  };
  const docs = [
    { longname: "Example", description: "自有类型。", properties: [member] },
    member,
  ];
  translations.markSourceDoclets(docs, "zh-CN");
  assert.equal(docs[0].sourceLocale, "zh-CN");
  assert.deepEqual(docs[0].i18n.sourceFields, [
    "description",
    "properties/value/description",
  ]);
  assert.deepEqual(docs[0].i18n.fallbackFields, []);
  assert.deepEqual(docs[0].i18n.translatedFields, []);
  assert.equal(docs[0].properties[0].i18n, undefined);
  assert.equal(member.description, "当前值。");
});

test("inline URL link labels can be translated while the URL target stays fixed", () => {
  const docs = [
    {
      longname: "Example",
      description: "Read {@link https://example.org/api|the API}.",
    },
  ];
  localizeDoclets(
    docs,
    catalog([
      entry(
        docs,
        "description",
        "阅读{@link https://example.org/api|接口说明}。",
      ),
    ]),
  );
  assert.match(docs[0].description, /接口说明/);
});

test("shared JSDoc enum property references cannot leak translations or locale metadata", () => {
  const member = { longname: "Mode.A", name: "A", description: "First mode." };
  const docs = [{ longname: "Mode", properties: [member] }, member];
  const entries = collectUnits(docs).map((unit) => ({
    ...unit,
    text: "第一种模式。",
  }));
  const report = localizeDoclets(docs, catalog(entries));
  assert.equal(report.counts.translated, 2);
  assert.equal(report.counts.missing, 0);
  assert.equal(docs[0].properties[0].i18n, undefined);
  assert.equal(docs[0].properties[0].description, "第一种模式。");
  assert.equal(member.description, "第一种模式。");
  assert.ok(report.units.every((unit) => unit.source === "First mode."));
});

test("prose cleanup cannot alter example code or signature fields", () => {
  const docs = [
    {
      longname: "Example",
      description: "A.\nREMOVE",
      examples: ["<caption>REMOVE</caption>\nconst REMOVE = 1;"],
    },
  ];
  translations.mapProse(docs, (text) => text.replace("REMOVE", ""));
  assert.equal(docs[0].description, "A.\n");
  assert.equal(docs[0].examples[0], "<caption></caption>\nconst REMOVE = 1;");
  assert.equal(docs[0].longname, "Example");
});
