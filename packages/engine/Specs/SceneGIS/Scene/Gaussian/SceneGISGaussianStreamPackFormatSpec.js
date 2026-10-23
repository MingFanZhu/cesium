import {
  GSP_HEADER_BYTES,
  parsePackHeader,
  validatePagePayload,
} from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianStreamPackFormat.js";
import { PACK_KIND } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import { crc32WithZeroedRanges } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsCrc32.js";
import { encodePack } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsGsp.js";

function createPackVector() {
  const payload = Uint8Array.from(
    { length: 512 },
    (_, index) => (index * 37 + 11) & 0xff,
  );
  const encoded = encodePack({
    packId: 0,
    kind: PACK_KIND.CORE,
    layoutId: 1,
    splatCount: 2,
    pages: [payload],
  });
  return {
    encoded,
    expectedPack: {
      id: 0,
      kind: PACK_KIND.CORE,
      pageCount: 1,
      fileBytes: encoded.bytes.byteLength,
      checksum: encoded.checksum,
      splatCount: 2,
      layoutId: 1,
      payloadOffset: Number(encoded.pages[0].offset),
      payloadBytes: encoded.bytes.byteLength - Number(encoded.pages[0].offset),
      strictA4: true,
    },
    page: {
      index: 0,
      storedBytes: Number(encoded.pages[0].storedBytes),
      checksum: encoded.pages[0].checksum,
    },
    payload,
  };
}

function crcValidMutation(vector, mutate) {
  const bytes = vector.encoded.bytes.slice();
  const view = new DataView(bytes.buffer);
  mutate(view);
  const checksum = crc32WithZeroedRanges(bytes, [
    [64, 4],
    [72, 4],
  ]);
  view.setUint32(64, checksum, true);
  return {
    bytes,
    expectedPack: { ...vector.expectedPack, checksum },
  };
}

describe("SceneGIS/Scene/SceneGISGaussianStreamPackFormat", function () {
  it("preserves strict GSP Header and Page validation", function () {
    const vector = createPackVector();
    const header = parsePackHeader(
      vector.encoded.bytes,
      vector.expectedPack,
      0,
    );
    expect(header.headerBytes).toBe(GSP_HEADER_BYTES);
    expect(header.packId).toBe(0);
    expect(validatePagePayload(vector.page, vector.payload)).toBeDefined();
  });

  it("rejects Header, metadata, Pack checksum, and Page checksum corruption", function () {
    const vector = createPackVector();

    const version = vector.encoded.bytes.slice(0, GSP_HEADER_BYTES);
    new DataView(version.buffer).setUint16(8, 1, true);
    expect(function () {
      parsePackHeader(version, vector.expectedPack, 0);
    }).toThrowError(/Unsupported or inconsistent GSP pack header/);

    const reserved = vector.encoded.bytes.slice(0, GSP_HEADER_BYTES);
    reserved[76] = 1;
    expect(function () {
      parsePackHeader(reserved, vector.expectedPack, 0);
    }).toThrowError(/reserved byte/);

    expect(function () {
      parsePackHeader(vector.encoded.bytes, {
        ...vector.expectedPack,
        splatCount: 3,
      });
    }).toThrowError(/does not match its GSI record/);

    const pack = vector.encoded.bytes.slice();
    pack[pack.length - 1] ^= 1;
    expect(function () {
      parsePackHeader(pack, vector.expectedPack, 0);
    }).toThrowError(/pack checksum mismatch/);

    const payload = vector.payload.slice();
    payload[0] ^= 1;
    expect(function () {
      validatePagePayload(vector.page, payload);
    }).toThrowError(/page 0 checksum mismatch/);
  });

  it("rejects CRC-valid noncanonical A4 Header fields", function () {
    const vector = createPackVector();
    const cases = [
      (view) => view.setUint16(10, 99, true),
      (view) => view.setUint32(16, 1, true),
      (view) => view.setUint16(26, 2, true),
      (view) => {
        view.setBigUint64(40, 512n, true);
        view.setBigUint64(
          48,
          BigInt(vector.encoded.bytes.byteLength - 512),
          true,
        );
      },
      (view) => view.setUint32(72, 0xdecafbad, true),
    ];
    for (const mutate of cases) {
      const invalid = crcValidMutation(vector, mutate);
      expect(function () {
        parsePackHeader(invalid.bytes, invalid.expectedPack, 0);
      }).toThrowError(/does not match its GSI record/);
    }
    expect(function () {
      parsePackHeader(vector.encoded.bytes, {
        ...vector.expectedPack,
        payloadBytes: vector.expectedPack.payloadBytes - 1,
      });
    }).toThrowError(/does not match its GSI record/);
  });
});
