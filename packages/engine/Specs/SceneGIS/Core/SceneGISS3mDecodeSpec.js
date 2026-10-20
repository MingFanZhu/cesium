import RuntimeError from "../../../Source/Core/RuntimeError.js";
import parseS3m from "../../../Source/SceneGIS/Core/_private/_SceneGISS3mParser.js";
import texture from "../../../Source/SceneGIS/Core/_private/_SceneGISS3mTexture.js";

describe("SceneGIS/Core/SceneGISS3mDecode", function () {
  it("rejects unqualified versions and truncated binary headers", function () {
    const header = new ArrayBuffer(12);
    new DataView(header).setFloat32(0, 3, true);
    expect(() => parseS3m(header)).toThrowError(RuntimeError);
    expect(() => parseS3m(new ArrayBuffer(3))).toThrowError(RuntimeError);
  });

  it("retains the first and last BC1 rows and partial edge blocks", function () {
    // Red and blue endpoints, first row red, final row blue.
    const data = new Uint8Array([0, 248, 31, 0, 0, 0, 0, 85]);
    const rgba = texture.decode({ width: 4, height: 4, format: 10, data });
    expect(Array.from(rgba.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(rgba.subarray(60))).toEqual([0, 0, 255, 255]);
    const edge = texture.decode({ width: 3, height: 4, format: 10, data });
    expect(edge.length).toBe(48);
    expect(Array.from(edge.subarray(44))).toEqual([0, 0, 255, 255]);
  });

  it("decodes BC3 alpha endpoints and rejects incomplete blocks", function () {
    const data = new Uint8Array(16);
    data.set([64, 255]);
    data[8] = 255;
    data[9] = 255;
    const rgba = texture.decode({ width: 4, height: 4, format: 13, data });
    expect(Array.from(rgba.subarray(60))).toEqual([255, 255, 255, 64]);
    expect(() =>
      texture.decode({ width: 8, height: 4, format: 13, data }),
    ).toThrowError(RuntimeError);
  });

  it("emits a browser-decodable PNG retaining alpha and row order", async function () {
    const data = new Uint8Array([0, 248, 31, 0, 0, 0, 0, 85]);
    const png = texture.toPng({ width: 4, height: 4, format: 10, data });
    const bitmap = await createImageBitmap(
      new Blob([png], { type: "image/png" }),
    );
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 4;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, 4, 4).data;
    expect(Array.from(pixels.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(pixels.subarray(60))).toEqual([0, 0, 255, 255]);
    bitmap.close();
  });
});
