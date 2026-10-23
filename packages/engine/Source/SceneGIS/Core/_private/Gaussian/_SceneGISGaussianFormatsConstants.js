/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
export const GSP_MAGIC = Uint8Array.from([
  0x47, 0x53, 0x50, 0x00, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export const VERSION = Object.freeze({ major: 0, minor: 0 });

export const BYTE_ORDER = Object.freeze({ LITTLE_ENDIAN: 1 });
export const CHECKSUM = Object.freeze({ NONE: 0, CRC32: 1 });
export const CODEC = Object.freeze({ RAW: 0 });
export const PACK_KIND = Object.freeze({ CORE: 1, SH: 2 });
export const PAGE_SEMANTIC = Object.freeze({
  CORE: 1,
  SH1: 2,
  SH2: 3,
  SH3: 4,
});
export const LAYOUT_KIND = Object.freeze({
  EXT_CORE_32: 1,
  EXT_SH1_16: 2,
  EXT_SH2_32: 3,
  EXT_SH3_64: 4,
});
export const TEXEL_FORMAT = Object.freeze({ RGBA32UI: 1 });
export const QUANTIZATION = Object.freeze({ NONE: 0 });

export const GSP_HEADER_BYTES = 256;
export const PAGE_ALIGNMENT = 256;
export const MAX_PAGE_SPLATS = 65536;
export const UINT32_MAX = 0xffffffff;
export const UINT64_MAX = 0xffffffffffffffffn;

export const BUILTIN_LAYOUTS = Object.freeze([
  Object.freeze({
    id: 1,
    kind: LAYOUT_KIND.EXT_CORE_32,
    version: 1,
    bytesPerSplat: 32,
    texelsPerSplat: 2,
    texelFormat: TEXEL_FORMAT.RGBA32UI,
    attributeFlags: 0x0000007f,
    maxShDegree: 0,
    quantization: QUANTIZATION.NONE,
  }),
  Object.freeze({
    id: 2,
    kind: LAYOUT_KIND.EXT_SH1_16,
    version: 1,
    bytesPerSplat: 16,
    texelsPerSplat: 1,
    texelFormat: TEXEL_FORMAT.RGBA32UI,
    attributeFlags: 0x00000100,
    maxShDegree: 1,
    quantization: QUANTIZATION.NONE,
  }),
  Object.freeze({
    id: 3,
    kind: LAYOUT_KIND.EXT_SH2_32,
    version: 1,
    bytesPerSplat: 32,
    texelsPerSplat: 2,
    texelFormat: TEXEL_FORMAT.RGBA32UI,
    attributeFlags: 0x00000300,
    maxShDegree: 2,
    quantization: QUANTIZATION.NONE,
  }),
  Object.freeze({
    id: 4,
    kind: LAYOUT_KIND.EXT_SH3_64,
    version: 1,
    bytesPerSplat: 64,
    texelsPerSplat: 4,
    texelFormat: TEXEL_FORMAT.RGBA32UI,
    attributeFlags: 0x00000700,
    maxShDegree: 3,
    quantization: QUANTIZATION.NONE,
  }),
]);

export function packFileName(pack) {
  const prefix = pack.kind === PACK_KIND.CORE ? "core" : "sh";
  return `scene.${prefix}.${String(pack.id).padStart(3, "0")}.gsp`;
}

/** @private */
const _SceneGISGaussianFormatsConstants = {
  GSP_MAGIC,
  VERSION,
  BYTE_ORDER,
  CHECKSUM,
  CODEC,
  PACK_KIND,
  PAGE_SEMANTIC,
  LAYOUT_KIND,
  TEXEL_FORMAT,
  QUANTIZATION,
  GSP_HEADER_BYTES,
  PAGE_ALIGNMENT,
  MAX_PAGE_SPLATS,
  UINT32_MAX,
  UINT64_MAX,
  BUILTIN_LAYOUTS,
  packFileName,
};
export default _SceneGISGaussianFormatsConstants;
