// Deterministic authoring data shared by the fixture generator and preview assembly.
const cases = [];
function add(id, title, type, paint, layout, parts, extra = {}) {
  const i = cases.length;
  cases.push({
    id,
    title,
    type,
    paint,
    layout,
    x: ((i % 3) - 1) * 380,
    y: 270 - Math.floor(i / 3) * 180,
    features: [{ parts, ...extra }],
  });
}
const straight = [
  [
    [-125, 0],
    [125, 0],
  ],
];
for (const [cap, label] of [
  ["butt", "平头"],
  ["square", "方头"],
  ["round", "圆头"],
]) {
  add(
    `cap-${cap}`,
    `${label} · ${cap}`,
    "line",
    { "line-color": "#257e8b", "line-width": 24 },
    { "line-cap": cap },
    straight,
  );
}
for (const [join, label] of [
  ["miter", "尖角"],
  ["bevel", "斜角"],
  ["round", "圆角"],
]) {
  add(
    `join-${join}`,
    `${label} · ${join}`,
    "line",
    { "line-color": "#ae593e", "line-width": 24, "line-opacity": 0.6 },
    { "line-join": join },
    [
      [
        [-125, -25],
        [-30, -25],
        [0, 30],
        [35, -25],
        [125, -25],
      ],
    ],
  );
}
add(
  "dashes",
  "虚线 · 不同周期共用批次",
  "line",
  {
    "line-color": "#257e8b",
    "line-width": 9,
    "line-dasharray": [
      "case",
      ["get", "long"],
      ["literal", [4, 1, 1, 1]],
      ["literal", [2, 1]],
    ],
  },
  {},
  [
    [
      [-125, 20],
      [125, 20],
    ],
  ],
  { properties: { long: false } },
);
cases[6].features.push({
  parts: [
    [
      [-125, -20],
      [125, -20],
    ],
  ],
  properties: { long: true },
});
add(
  "dots",
  "圆点虚线 · 零长度 dash",
  "line",
  { "line-color": "#876449", "line-width": 12, "line-dasharray": [0, 2.5] },
  { "line-cap": "round", "line-join": "round" },
  [
    [
      [-125, -25],
      [-40, 25],
      [40, -25],
      [125, 25],
    ],
  ],
);
add(
  "rails",
  "间隙与偏移 · 双轨",
  "line",
  {
    "line-color": "#557a48",
    "line-width": 5,
    "line-gap-width": 12,
    "line-offset": 8,
  },
  { "line-join": "round" },
  [
    [
      [-125, -25],
      [-40, 25],
      [40, -25],
      [125, 25],
    ],
  ],
);
add(
  "fill",
  "矢量面 · 外边缘与孔洞 AA",
  "fill",
  { "fill-color": "#257e8b", "fill-opacity": 0.65 },
  {},
  [
    [
      [-125, -45],
      [125, -45],
      [105, 40],
      [-105, 40],
    ],
    [
      [-40, -20],
      [-40, 20],
      [40, 20],
      [40, -20],
    ],
  ],
);
add(
  "circles",
  "圆与描边 · blur 0 / 0.3 / 0.8",
  "circle",
  {
    "circle-color": "#ae593e",
    "circle-radius": 27,
    "circle-stroke-width": 5,
    "circle-stroke-color": "#876449",
    "circle-blur": ["get", "blur"],
  },
  {},
  [[[-85, 0]]],
  { properties: { blur: 0 } },
);
cases[10].features.push(
  { parts: [[[0, 0]]], properties: { blur: 0.3 } },
  { parts: [[[85, 0]]], properties: { blur: 0.8 } },
);
add(
  "blur",
  "线条模糊 · blur 0 / 3 / 7",
  "line",
  { "line-color": "#876449", "line-width": 14, "line-blur": ["get", "blur"] },
  { "line-cap": "round" },
  [
    [
      [-125, 35],
      [125, 35],
    ],
  ],
  { properties: { blur: 0 } },
);
cases[11].features.push(
  {
    parts: [
      [
        [-125, 0],
        [125, 0],
      ],
    ],
    properties: { blur: 3 },
  },
  {
    parts: [
      [
        [-125, -35],
        [125, -35],
      ],
    ],
    properties: { blur: 7 },
  },
);
export default cases;
