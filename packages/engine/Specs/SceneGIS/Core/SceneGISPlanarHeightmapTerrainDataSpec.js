import {
  Credit,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
} from "../../../index.js";

describe("SceneGIS/Core/SceneGISPlanarHeightmapTerrainData", function () {
  const extent = new SceneGISPlanarExtent({
    minimumX: 0.0,
    minimumY: 0.0,
    maximumX: 2.0,
    maximumY: 2.0,
  });

  it("decodes default float and integer buffers in north-west row order", function () {
    const floatData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([10.0, 20.0, 30.0, 40.0, 50.0, 60.0]),
      width: 3,
      height: 2,
    });
    const integerData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Int16Array([-5, 2, 7, 11]),
      width: 2,
      height: 2,
    });

    expect(floatData.width).toBe(3);
    expect(floatData.height).toBe(2);
    expect(floatData.minimumHeight).toBe(10.0);
    expect(floatData.maximumHeight).toBe(60.0);
    expect(floatData.interpolateHeight(extent, 0.0, 2.0)).toBe(10.0);
    expect(floatData.interpolateHeight(extent, 2.0, 2.0)).toBe(30.0);
    expect(floatData.interpolateHeight(extent, 0.0, 0.0)).toBe(40.0);
    expect(integerData.minimumHeight).toBe(-5.0);
    expect(integerData.maximumHeight).toBe(11.0);
    expect(floatData._getSample(0, 0)).toBe(10.0);
    expect(floatData._getSample(1, 2)).toBe(60.0);
    expect(() => floatData._getSample(-1, 0)).toThrowDeveloperError();
  });

  it("decodes scale, offset, stride, and both endian orders", function () {
    const littleEndian = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Uint8Array([1, 2, 99, 3, 4, 99, 5, 6, 99, 7, 8, 99]),
      width: 2,
      height: 2,
      structure: {
        heightScale: 0.5,
        heightOffset: -10.0,
        elementsPerHeight: 2,
        stride: 3,
        elementMultiplier: 256.0,
        isBigEndian: false,
      },
    });
    const bigEndian = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Uint8Array([2, 1, 4, 3, 6, 5, 8, 7]),
      width: 2,
      height: 2,
      structure: {
        heightScale: 0.5,
        heightOffset: -10.0,
        elementsPerHeight: 2,
        stride: 2,
        isBigEndian: true,
      },
    });

    expect(littleEndian.minimumHeight).toBe((2 * 256 + 1) * 0.5 - 10);
    expect(littleEndian.maximumHeight).toBe((8 * 256 + 7) * 0.5 - 10);
    expect(bigEndian.minimumHeight).toBe(littleEndian.minimumHeight);
    expect(bigEndian.maximumHeight).toBe(littleEndian.maximumHeight);
  });

  it("decodes a local Terrain-RGB-compatible three-byte fixture", function () {
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Uint8Array([
        1, 134, 160, 1, 134, 170, 1, 134, 180, 1, 134, 190,
      ]),
      width: 2,
      height: 2,
      structure: {
        heightScale: 0.1,
        heightOffset: -10000.0,
        elementsPerHeight: 3,
        stride: 3,
        isBigEndian: true,
      },
    });

    expect(data.minimumHeight).toBe(0.0);
    expect(data.maximumHeight).toBe(3.0);
  });

  it("decodes and interpolates RGBA Terrain-RGB over a full EPSG:3857 extent", function () {
    const webMercatorExtent = new SceneGISPlanarExtent({
      minimumX: -20037508.342789244,
      minimumY: -20037508.342789244,
      maximumX: 20037508.342789244,
      maximumY: 20037508.342789244,
    });
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Uint8Array([
        1, 134, 160, 255, 1, 134, 170, 255, 1, 134, 180, 255, 1, 134, 190, 255,
      ]),
      width: 2,
      height: 2,
      structure: {
        heightScale: 0.1,
        heightOffset: -10000.0,
        elementsPerHeight: 3,
        stride: 4,
        isBigEndian: true,
      },
    });

    expect(data.minimumHeight).toBe(0.0);
    expect(data.maximumHeight).toBe(3.0);
    expect(
      data.interpolateHeight(
        webMercatorExtent,
        webMercatorExtent.minimumX,
        webMercatorExtent.maximumY,
      ),
    ).toBe(0.0);
    expect(
      data.interpolateHeight(
        webMercatorExtent,
        webMercatorExtent.maximumX,
        webMercatorExtent.maximumY,
      ),
    ).toBe(1.0);
    expect(
      data.interpolateHeight(
        webMercatorExtent,
        webMercatorExtent.minimumX,
        webMercatorExtent.minimumY,
      ),
    ).toBe(2.0);
    expect(data.interpolateHeight(webMercatorExtent, 0.0, 0.0)).toBeCloseTo(
      1.5,
      14,
    );
  });

  it("interpolates both triangles split from southwest to northeast", function () {
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float64Array([20.0, 100.0, 0.0, 40.0]),
      width: 2,
      height: 2,
    });

    expect(data.interpolateHeight(extent, 0.5, 1.0)).toBeCloseTo(30.0, 14);
    expect(data.interpolateHeight(extent, 1.5, 1.0)).toBeCloseTo(60.0, 14);
    expect(data.interpolateHeight(extent, 1.0, 1.0)).toBeCloseTo(50.0, 14);
    expect(data.interpolateHeight(extent, 2.0, 0.0)).toBe(40.0);
    expect(
      data.interpolateHeight(extent, -Number.EPSILON, 1.0),
    ).toBeUndefined();
    expect(data.interpolateHeight(extent, 1.0, 2.0 + 1.0e-12)).toBeUndefined();
  });

  it("uses southwest, southeast, northwest, northeast child mask bits", function () {
    const full = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Uint8Array(4),
      width: 2,
      height: 2,
    });
    const partial = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Uint8Array(4),
      width: 2,
      height: 2,
      childTileMask: 5,
    });
    const empty = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Uint8Array(4),
      width: 2,
      height: 2,
      childTileMask: 0,
    });

    expect(full.isChildAvailable(3, 4, 6, 9)).toBe(true);
    expect(full.isChildAvailable(3, 4, 7, 9)).toBe(true);
    expect(full.isChildAvailable(3, 4, 6, 8)).toBe(true);
    expect(full.isChildAvailable(3, 4, 7, 8)).toBe(true);
    expect(partial.isChildAvailable(3, 4, 6, 9)).toBe(true);
    expect(partial.isChildAvailable(3, 4, 7, 9)).toBe(false);
    expect(partial.isChildAvailable(3, 4, 6, 8)).toBe(true);
    expect(partial.isChildAvailable(3, 4, 7, 8)).toBe(false);
    expect(empty.isChildAvailable(3, 4, 6, 9)).toBe(false);
  });

  it("preserves read-only metadata and ownership references", function () {
    const credit = new Credit("terrain source");
    const credits = [credit];
    const waterMask = new Uint8Array([0, 255]);
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Uint8Array(4),
      width: 2,
      height: 2,
      waterMask: waterMask,
      credits: credits,
      createdByUpsampling: true,
    });

    expect(data.credits).toBe(credits);
    expect(data.waterMask).toBe(waterMask);
    expect(data.wasCreatedByUpsampling).toBe(true);
    for (const propertyName of [
      "width",
      "height",
      "minimumHeight",
      "maximumHeight",
      "credits",
      "waterMask",
      "wasCreatedByUpsampling",
    ]) {
      const descriptor = Object.getOwnPropertyDescriptor(
        SceneGISPlanarHeightmapTerrainData.prototype,
        propertyName,
      );
      expect(descriptor.get).toBeDefined();
      expect(descriptor.set).toBeUndefined();
    }
    expect(data.destroy).toBeUndefined();
    expect(data.createMesh).toBeUndefined();
    expect(data.upsample).toBeUndefined();
  });

  it("rejects invalid buffers, dimensions, structures, and decoded heights", function () {
    const valid = { buffer: new Uint8Array(4), width: 2, height: 2 };
    const invalidOptions = [
      { ...valid, buffer: [0, 0, 0, 0] },
      { ...valid, buffer: new BigInt64Array(4) },
      { ...valid, width: 1 },
      { ...valid, height: 2.5 },
      { ...valid, buffer: new Uint8Array(3) },
      { ...valid, structure: { elementsPerHeight: 2, stride: 1 } },
      { ...valid, structure: { elementMultiplier: 0 } },
      { ...valid, structure: { heightScale: Infinity } },
      { ...valid, structure: { isBigEndian: 1 } },
      {
        buffer: new Float64Array([0.0, 1.0, Number.NaN, 3.0]),
        width: 2,
        height: 2,
      },
      {
        ...valid,
        buffer: new Uint8Array([2, 2, 2, 2]),
        structure: { heightScale: Number.MAX_VALUE },
      },
    ];

    for (const options of invalidOptions) {
      expect(function () {
        return new SceneGISPlanarHeightmapTerrainData(options);
      }).toThrowDeveloperError();
    }
  });

  it("rejects invalid masks and metadata", function () {
    const valid = { buffer: new Uint8Array(4), width: 2, height: 2 };
    for (const options of [
      { ...valid, childTileMask: -1 },
      { ...valid, childTileMask: 16 },
      { ...valid, childTileMask: 1.5 },
      { ...valid, waterMask: new Uint16Array(2) },
      { ...valid, credits: {} },
      { ...valid, credits: [{}] },
      { ...valid, createdByUpsampling: 1 },
    ]) {
      expect(function () {
        return new SceneGISPlanarHeightmapTerrainData(options);
      }).toThrowDeveloperError();
    }
  });

  it("rejects invalid interpolation and non-direct child queries", function () {
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Uint8Array(4),
      width: 2,
      height: 2,
    });

    for (const query of [
      [undefined, 0.0, 0.0],
      [extent, Number.NaN, 0.0],
      [extent, 0.0, Infinity],
    ]) {
      expect(function () {
        data.interpolateHeight(...query);
      }).toThrowDeveloperError();
    }
    for (const address of [
      [-1, 0, 0, 0],
      [0, 0, 0.5, 0],
      [0, 0, 2, 0],
      [0, 0, 0, 2],
      [Number.MAX_SAFE_INTEGER, 0, 0, 0],
    ]) {
      expect(function () {
        data.isChildAvailable(...address);
      }).toThrowDeveloperError();
    }
  });
});
