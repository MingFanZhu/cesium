import RuntimeError from "../../../Core/RuntimeError.js";
import Material from "./_SceneGISVectorBuildingMaterial.js";

const neutral = [
  [255, 255, 255, 255],
  [128, 128, 255, 255],
  [255, 255, 255, 255],
  [255, 255, 255, 255],
];
function linear(x) {
  x /= 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}
function srgb(x) {
  return Math.round(
    255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055),
  );
}
function smaller(image, channel) {
  const width = Math.max(1, Math.ceil(image.width / 2));
  const height = Math.max(1, Math.ceil(image.height / 2));
  const arrayBufferView = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const value =
              image.arrayBufferView[
                (((y * 2 + dy) % image.height) * image.width +
                  ((x * 2 + dx) % image.width)) *
                  4 +
                  c
              ];
            sum +=
              (channel === 0 || channel === 3) && c < 3
                ? linear(value)
                : channel === 2 && c === 1
                  ? value * value
                  : value;
          }
        }
        arrayBufferView[(y * width + x) * 4 + c] =
          (channel === 0 || channel === 3) && c < 3
            ? srgb(sum / 4)
            : channel === 2 && c === 1
              ? Math.round(Math.sqrt(sum / 4))
              : Math.round(sum / 4);
      }
    }
  }
  return { width, height, arrayBufferView };
}
function copyWrapped(target, width, rect, source, fallback) {
  const [rx, ry, rw, rh] = rect;
  for (let y = -1; y <= rh; y++) {
    for (let x = -1; x <= rw; x++) {
      const input = source?.arrayBufferView;
      const offset = (((y + rh) % rh) * rw + ((x + rw) % rw)) * 4;
      const output = ((ry + y) * width + rx + x) * 4;
      for (let c = 0; c < 4; c++) {
        target[output + c] = input ? input[offset + c] : fallback[c];
      }
    }
  }
}

/** Builds isolated, periodic mip chains in four shared atlases in the vector Worker. @private */
function buildMaterialAtlas(parameters) {
  const { materials, images, maximumTextureSize, maximumBytes } = parameters;
  const rows = Object.entries(materials).map(([name, descriptor]) => {
    const maps = Material.channels.map((key) =>
      descriptor[key] ? images[descriptor[key]] : undefined,
    );
    const first = maps.find(Boolean);
    const width = first?.width ?? 1,
      height = first?.height ?? 1;
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1
    ) {
      throw new RuntimeError(
        `Building material ${name}: invalid image dimensions.`,
      );
    }
    for (let i = 0; i < maps.length; i++) {
      const image = maps[i];
      if (
        descriptor[Material.channels[i]] &&
        (!image ||
          image.width !== width ||
          image.height !== height ||
          !(image.arrayBufferView instanceof Uint8Array) ||
          image.arrayBufferView.length !== width * height * 4)
      ) {
        throw new RuntimeError(
          `Building material ${name}: maps must have matching RGBA dimensions.`,
        );
      }
    }
    const levels = [];
    let w = width,
      h = height,
      x = 1;
    while (true) {
      levels.push([x, 0, w, h]);
      x += w + 2;
      if (w === 1 && h === 1) {
        break;
      }
      w = Math.max(1, Math.ceil(w / 2));
      h = Math.max(1, Math.ceil(h / 2));
    }
    return { descriptor, maps, width, height, levels, rowWidth: x - 1 };
  });
  if (!rows.length) {
    throw new RuntimeError("Building material atlas is empty.");
  }
  const width = Math.max(...rows.map((r) => r.rowWidth));
  const height = rows.reduce((n, r) => n + r.height + 2, 0);
  const tableWidth = 3 + Math.max(...rows.map((r) => r.levels.length));
  const byteLength = width * height * 16 + tableWidth * rows.length * 16;
  if (
    width > maximumTextureSize ||
    height > maximumTextureSize ||
    tableWidth > maximumTextureSize ||
    rows.length > maximumTextureSize ||
    byteLength > maximumBytes
  ) {
    throw new RuntimeError(
      "Building material atlas exceeds the Context or maximumMaterialTextureBytes budget.",
    );
  }
  const atlases = Material.channels.map(() => ({
    width,
    height,
    arrayBufferView: new Uint8Array(width * height * 4),
  }));
  const table = new Float32Array(tableWidth * rows.length * 4);
  let y = 1;
  rows.forEach((row, index) => {
    const d = { ...Material.defaults, ...row.descriptor };
    const offset = index * tableWidth * 4;
    table.set(
      [
        ...d.baseColor,
        d.metallic,
        ...d.emissive,
        d.roughness,
        d.normalScale,
        row.width,
        row.height,
        row.levels.length - 1,
      ],
      offset,
    );
    row.levels.forEach((rect, level) => {
      rect[1] = y;
      table.set(rect, offset + (3 + level) * 4);
    });
    for (let channel = 0; channel < 4; channel++) {
      let image = row.maps[channel];
      for (let level = 0; level < row.levels.length; level++) {
        copyWrapped(
          atlases[channel].arrayBufferView,
          width,
          row.levels[level],
          image,
          neutral[channel],
        );
        if (image && level + 1 < row.levels.length) {
          image = smaller(image, channel);
        }
      }
    }
    y += row.height + 2;
  });
  return {
    atlases,
    parameters: {
      width: tableWidth,
      height: rows.length,
      arrayBufferView: table,
    },
    byteLength,
  };
}
export default buildMaterialAtlas;
