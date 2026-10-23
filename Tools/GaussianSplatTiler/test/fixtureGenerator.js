import { Buffer } from "node:buffer";
import { open } from "node:fs/promises";

const CORE_PROPERTY_NAMES = [
  "x",
  "y",
  "z",
  "scale_0",
  "scale_1",
  "scale_2",
  "rot_0",
  "rot_1",
  "rot_2",
  "rot_3",
  "opacity",
  "f_dc_0",
  "f_dc_1",
  "f_dc_2",
];
const BATCH_RECORDS = 4096;

function recordValues(
  index,
  shCount,
  extraPropertyCount,
  invalidGaussianCount,
  wideGrid,
) {
  const tileOrdinal = wideGrid ? Math.floor(index / 40000) : 0;
  const localIndex = wideGrid ? index % 40000 : index;
  const x =
    (wideGrid ? -1_000_000 + (tileOrdinal % 5) * 10 : 0) +
    (localIndex % 200) * 0.01;
  const y =
    (wideGrid ? 2_000_000 + Math.floor(tileOrdinal / 5) * 10 : 0) +
    (Math.floor(localIndex / 200) % 200) * 0.01;
  const z = wideGrid
    ? (localIndex % 97) * 0.001
    : Math.floor(index / 40000) * 0.01;
  return [
    x,
    y,
    z,
    index >= 1 && index <= invalidGaussianCount ? Number.NaN : -3,
    -3,
    -3,
    1,
    0,
    0,
    0,
    0,
    ((index % 17) - 8) / 32,
    ((index % 13) - 6) / 32,
    ((index % 11) - 5) / 32,
    ...Array.from(
      { length: shCount },
      (_, coefficient) => ((index + coefficient) % 19) / 64,
    ),
    ...Array.from(
      { length: extraPropertyCount },
      (_, extra) => ((index + extra) % 101) / 100,
    ),
  ];
}

function writeRecord(
  view,
  byteOffset,
  index,
  shCount,
  extraPropertyCount,
  typeBytes,
  invalidGaussianCount,
  wideGrid,
) {
  const values = recordValues(
    index,
    shCount,
    extraPropertyCount,
    invalidGaussianCount,
    wideGrid,
  );
  for (let property = 0; property < values.length; property++) {
    const offset = byteOffset + property * typeBytes;
    if (typeBytes === Float64Array.BYTES_PER_ELEMENT) {
      view.setFloat64(offset, values[property], true);
    } else {
      view.setFloat32(offset, values[property], true);
    }
  }
}

export async function writeDeterministicGaussianPly(
  filePath,
  vertexCount,
  options = {},
) {
  if (!Number.isSafeInteger(vertexCount) || vertexCount <= 0) {
    throw new RangeError("vertexCount must be a positive safe integer");
  }
  const propertyType = options.propertyType ?? "float";
  if (propertyType !== "float" && propertyType !== "double") {
    throw new RangeError("propertyType must be float or double");
  }
  const extraPropertyCount = options.extraPropertyCount ?? 0;
  if (!Number.isSafeInteger(extraPropertyCount) || extraPropertyCount < 0) {
    throw new RangeError("extraPropertyCount must be a non-negative integer");
  }
  const maxShDegree = options.maxShDegree ?? 0;
  if (![0, 1, 2, 3].includes(maxShDegree)) {
    throw new RangeError("maxShDegree must be 0, 1, 2, or 3");
  }
  const shCount = [0, 9, 24, 45][maxShDegree];
  const invalidGaussianCount = options.invalidGaussianCount ?? 0;
  const wideGrid = options.wideGrid === true;
  if (
    !Number.isSafeInteger(invalidGaussianCount) ||
    invalidGaussianCount < 0 ||
    invalidGaussianCount >= vertexCount
  ) {
    throw new RangeError(
      "invalidGaussianCount must retain at least one Gaussian",
    );
  }
  const typeBytes =
    propertyType === "double"
      ? Float64Array.BYTES_PER_ELEMENT
      : Float32Array.BYTES_PER_ELEMENT;
  const propertyNames = [
    ...CORE_PROPERTY_NAMES,
    ...Array.from({ length: shCount }, (_, index) => `f_rest_${index}`),
    ...Array.from(
      { length: extraPropertyCount },
      (_, index) => `unused_${index}`,
    ),
  ];
  const recordBytes = propertyNames.length * typeBytes;
  const header = [
    "ply",
    "format binary_little_endian 1.0",
    "comment T3B-B1 deterministic generated formal fixture",
    `element vertex ${vertexCount}`,
    ...propertyNames.map((name) => `property ${propertyType} ${name}`),
    "end_header",
    "",
  ].join("\n");
  const file = await open(filePath, "w");
  try {
    await file.write(header);
    for (let start = 0; start < vertexCount; start += BATCH_RECORDS) {
      const count = Math.min(BATCH_RECORDS, vertexCount - start);
      const buffer = Buffer.allocUnsafe(count * recordBytes);
      const view = new DataView(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength,
      );
      for (let localIndex = 0; localIndex < count; localIndex++) {
        writeRecord(
          view,
          localIndex * recordBytes,
          start + localIndex,
          shCount,
          extraPropertyCount,
          typeBytes,
          invalidGaussianCount,
          wideGrid,
        );
      }
      await file.write(buffer);
    }
  } finally {
    await file.close();
  }
}
