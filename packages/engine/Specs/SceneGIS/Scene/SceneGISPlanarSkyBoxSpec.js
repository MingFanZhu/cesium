import { Credit, Matrix3, SceneGISPlanarSkyBox } from "../../../index.js";

describe("SceneGIS/Scene/SceneGISPlanarSkyBox", function () {
  function sources(Source = Object) {
    return {
      positiveX: Object.assign(new Source(), { width: 1, height: 1 }),
      negativeX: Object.assign(new Source(), { width: 1, height: 1 }),
      positiveY: Object.assign(new Source(), { width: 1, height: 1 }),
      negativeY: Object.assign(new Source(), { width: 1, height: 1 }),
      positiveZ: Object.assign(new Source(), { width: 1, height: 1 }),
      negativeZ: Object.assign(new Source(), { width: 1, height: 1 }),
    };
  }

  it("retains six same-type preloaded faces in fixed planar axes", function () {
    const faces = sources();
    const credit = new Credit("Planar sky");
    const skyBox = new SceneGISPlanarSkyBox({ sources: faces, credit });
    expect(skyBox.sources).not.toBe(faces);
    expect(Object.isFrozen(skyBox.sources)).toBe(true);
    expect(skyBox.sources.positiveX).toBe(faces.positiveX);
    expect(skyBox.sources.positiveY).toBe(faces.positiveY);
    expect(skyBox.sources.positiveZ).toBe(faces.positiveZ);
    expect(skyBox.credit).toBe(credit);
    expect(skyBox._panorama.transform).toBe(Matrix3.IDENTITY);
    expect(skyBox._panorama._returnCommand).toBe(true);
    faces.positiveX = { width: 2, height: 2 };
    expect(skyBox.sources.positiveX).not.toBe(faces.positiveX);
    skyBox.destroy();
  });

  it("rejects missing, URL, unloaded, non-square, and mismatched faces", function () {
    expect(() => new SceneGISPlanarSkyBox()).toThrowDeveloperError();
    const missing = sources();
    delete missing.negativeZ;
    expect(
      () => new SceneGISPlanarSkyBox({ sources: missing }),
    ).toThrowDeveloperError();
    const urls = sources();
    urls.positiveX = "positive-x.png";
    expect(
      () => new SceneGISPlanarSkyBox({ sources: urls }),
    ).toThrowDeveloperError();
    const unloaded = sources();
    unloaded.positiveZ.width = 0;
    expect(
      () => new SceneGISPlanarSkyBox({ sources: unloaded }),
    ).toThrowDeveloperError();
    const nonSquare = sources();
    nonSquare.positiveX.width = 2;
    expect(
      () => new SceneGISPlanarSkyBox({ sources: nonSquare }),
    ).toThrowDeveloperError();
    const mismatched = sources();
    mismatched.negativeX.width = 2;
    mismatched.negativeX.height = 2;
    expect(
      () => new SceneGISPlanarSkyBox({ sources: mismatched }),
    ).toThrowDeveloperError();
    class OtherSource {}
    const mixed = sources();
    mixed.negativeY = new OtherSource();
    expect(
      () => new SceneGISPlanarSkyBox({ sources: mixed }),
    ).toThrowDeveloperError();
  });

  it("accepts only Credit or string credit values", function () {
    const creditShapedObject = {
      html: "Planar sky",
      showOnScreen: false,
    };
    expect(
      () =>
        new SceneGISPlanarSkyBox({
          sources: sources(),
          credit: creditShapedObject,
        }),
    ).toThrowDeveloperError();
    expect(
      () => new SceneGISPlanarSkyBox({ sources: sources(), credit: {} }),
    ).toThrowDeveloperError();
    const stringCredit = new SceneGISPlanarSkyBox({
      sources: sources(),
      credit: "Planar sky",
    });
    expect(stringCredit.credit).toBeInstanceOf(Credit);
    stringCredit.destroy();
  });

  it("owns its panorama resources and follows exactly-once destruction", function () {
    const skyBox = new SceneGISPlanarSkyBox({ sources: sources() });
    const panorama = skyBox._panorama;
    const destroySpy = spyOn(panorama, "destroy").and.callThrough();
    expect(skyBox.isDestroyed()).toBe(false);
    skyBox.destroy();
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(skyBox.isDestroyed()).toBe(true);
    expect(() => skyBox.destroy()).toThrowDeveloperError();
  });
});
