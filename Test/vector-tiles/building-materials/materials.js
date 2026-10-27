// Example art direction only. Selection, shared atlases and shading belong to the engine.
const textures = (name) => ({
  baseColorTexture: `./textures/${name}-color.jpg`,
  normalTexture: `./textures/${name}-normal.png`,
  metallicRoughnessTexture: `./textures/${name}-rm.png`,
});
const glass = {
  ...textures("glass"),
  repeat: [21, 25.6],
  metallic: 0.85,
  roughness: 0.7,
  normalScale: 0.3,
};
const stone = {
  ...textures("limestone"),
  repeat: [10, 12.8],
  metallic: 0.55,
  roughness: 1,
  normalScale: 0.8,
  emissiveTexture: "./textures/limestone-emissive.png",
  emissive: [0.18, 0.14, 0.09],
};
const roof = {
  ...textures("roof-flat"),
  repeat: [16, 16],
  roughness: 1,
  normalScale: 0.5,
};
export const materials = {
  glassBlue: { ...glass, baseColor: [0.48, 0.66, 0.78] },
  glassBronze: { ...glass, baseColor: [0.65, 0.48, 0.32], repeat: [21, 28] },
  glassSilver: { ...glass, baseColor: [0.78, 0.8, 0.76] },
  limestone: { ...stone, baseColor: [0.88, 0.84, 0.76] },
  limestoneWarm: {
    ...stone,
    baseColor: [0.72, 0.59, 0.42],
    repeat: [8.8, 12.8],
  },
  brick: {
    ...textures("brick"),
    repeat: [10, 12.8],
    metallic: 0.55,
    roughness: 1,
    normalScale: 0.7,
    emissiveTexture: "./textures/brick-emissive.png",
    emissive: [0.12, 0.09, 0.05],
  },
  roofDark: { ...roof, baseColor: [0.38, 0.4, 0.42] },
  roofLight: { ...roof, baseColor: [0.9, 0.85, 0.73] },
};
// Decoded MVT uint64 IDs are strings. Explicit conversion is required by expressions.
// A prime modulus avoids the source's even-valued low discriminator digit.
const identity = ["to-number", ["id"], 0];
const variation = ["%", identity, 11];
const height = ["coalesce", ["get", "render_height"], 10];
const idSelection = [
  "case",
  ["==", ["get", "colour"], "black"],
  "glassBlue",
  ["all", [">", height, 65], ["<", variation, 5]],
  [
    "match",
    ["%", identity, 3],
    0,
    "glassBlue",
    1,
    "glassBronze",
    "glassSilver",
  ],
  ["<", variation, 4],
  "brick",
  ["<", variation, 7],
  "limestoneWarm",
  "limestone",
];
// Shared colors keep independently identified building parts visually coherent.
export const wallSelector = [
  "match",
  ["coalesce", ["get", "colour"], ""],
  ["black", "#5a81a0", "#313034", "#48555e", "#505e61", "#424a4d"],
  "glassBlue",
  ["#c2c7ca", "#b8b8b6", "#a8aba0"],
  "glassSilver",
  [
    "white",
    "lightgray",
    "#dfdeca",
    "#ddd8c4",
    "#f2e9ca",
    "#ede6d6",
    "#fcf7e4",
    "#f8faec",
    "#e1dcbf",
    "#d2cbb8",
  ],
  "limestone",
  [
    "#a08769",
    "#9e8a72",
    "#dccbad",
    "#dbd0b4",
    "#cbbc9d",
    "#b4a28e",
    "#a19376",
    "#baaf93",
  ],
  "limestoneWarm",
  ["red", "brown", "#9c817a"],
  "brick",
  idSelection,
];
export const roofSelector = [
  "case",
  ["<", variation, 5],
  "roofDark",
  "roofLight",
];
