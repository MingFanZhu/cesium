import {
  Cartesian3,
  Cartesian4,
  Color,
  Ellipsoid,
  Globe,
  JulianDate,
  Matrix3,
  Matrix4,
  Resource,
  SceneGISEnvironmentEffects,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarEnvironment,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  Transforms,
} from "../../../index.js";
import ClearCommand from "../../../Source/Renderer/ClearCommand.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISAtmosphereStars", function () {
  let scene;
  let effects;
  let environment;
  const host = {};
  const time = JulianDate.fromIso8601("2026-06-21T15:00:00Z");
  const face = {
    width: 1,
    height: 1,
    arrayBufferView: new Uint8Array([128, 128, 128, 255]),
  };

  function setup(mode = "planar", imagePromise = Promise.resolve(face)) {
    scene = createScene({ scene3DOnly: true });
    const sizes = {
      "transmittance.bin": 256 * 64 * 4 * 2,
      "scattering.bin": 256 * 128 * 32 * 4 * 2,
      "irradiance.bin": 64 * 16 * 4 * 2,
      "globe-shape.bin": 128 * 128 * 128,
      "globe-detail.bin": 32 * 32 * 32,
      "globe-weather.bin": 512 * 512 * 4,
      "globe-turbulence.bin": 128 * 128 * 4,
      "globe-stbn.bin": 128 * 128 * 64,
    };
    spyOn(Resource, "fetchArrayBuffer").and.callFake((url) => {
      const name = url.split("/").pop();
      const buffer = new ArrayBuffer(sizes[name]);
      if (name === "transmittance.bin") {
        new Uint16Array(buffer).fill(15360);
      }
      return Promise.resolve(buffer);
    });
    spyOn(Resource, "fetchImage").and.returnValue(imagePromise);
    let world;
    if (mode === "planar") {
      world = new SceneGISPlanarWorld({
        coordinateSystem: new SceneGISPlanarCoordinateSystem({
          extent: new SceneGISPlanarExtent({
            minimumX: -1e6,
            minimumY: -1e6,
            maximumX: 1e6,
            maximumY: 1e6,
          }),
        }),
        maximumLevel: 0,
      });
      scene._initializeWorld(world);
      environment = new SceneGISPlanarEnvironment({
        world,
        showAtmosphere: false,
        showSun: false,
        showMoon: false,
        sunDirection: new Cartesian3(1, 0, -1),
        moonDirection: Cartesian3.UNIT_Z,
      });
      environment.connectedCallback(host);
      environment.firstUpdate(scene, time);
    } else {
      scene.globe = new Globe(Ellipsoid.WGS84);
      scene.globe.showGroundAtmosphere = false;
      scene.globe.enableLighting = false;
    }
    for (const item of [
      scene.skyBox,
      scene.skyAtmosphere,
      scene.sun,
      scene.moon,
    ]) {
      if (item) {
        item.show = false;
      }
    }
    scene.fog.enabled = false;
    scene.sunBloom = false;
    scene.highDynamicRange = true;
    scene.camera.setView({
      destination:
        mode === "planar"
          ? new Cartesian3(0, 0, 200)
          : Cartesian3.fromDegrees(118.8406, 32.0725, 200),
      orientation: { heading: 0, pitch: Math.PI / 4, roll: 0 },
    });
    scene.renderForSpecs(time);
    effects = new SceneGISEnvironmentEffects({
      mode,
      world,
      enabled: true,
      showClouds: false,
      showHeightFog: false,
      showAerialPerspective: false,
      showCloudShadows: false,
      showCrepuscularRays: false,
      showBloom: false,
      showLensFlare: false,
    });
    effects.connectedCallback(host);
  }

  async function ready() {
    let failure;
    effects.errorEvent.addEventListener((_owner, error) => {
      failure = error;
    });
    effects.firstUpdate(scene, time);
    await pollToPromise(() => {
      effects.update(scene, time);
      if (failure) {
        throw failure;
      }
      return effects.ready;
    });
  }

  function pixel() {
    new ClearCommand({ color: Color.BLACK }).execute(scene.context);
    effects._pipeline._resources.backgroundCommand.execute(scene.context);
    return Array.from(scene.context.readPixels({ width: 1, height: 1 }));
  }

  function isolateBackground() {
    const renderer = effects._pipeline;
    const frame = renderer._frame;
    frame.altitude = 200;
    Cartesian3.clone(Cartesian3.UNIT_X, frame.east);
    Cartesian3.clone(Cartesian3.UNIT_Y, frame.north);
    Cartesian3.clone(Cartesian3.UNIT_Z, frame.vertical);
    Cartesian3.clone(Cartesian3.UNIT_Z, frame.cameraDirection);
    Cartesian3.clone(Cartesian3.UNIT_X, frame.cameraRight);
    Cartesian3.clone(Cartesian3.UNIT_Y, frame.cameraUp);
    Cartesian4.clone(new Cartesian4(-1, 1, -1, 1), renderer._frustum);
    renderer._sunDirection = new Cartesian3(1, 0, -1);
    Cartesian3.normalize(renderer._sunDirection, renderer._sunDirection);
    return renderer;
  }

  afterEach(function () {
    if (effects?._element) {
      effects.disconnectedCallback(host);
    }
    if (environment?._element) {
      environment.disconnectedCallback(host);
    }
    if (scene && !scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
    effects = environment = scene = undefined;
  });

  it("exposes validated stars controls and reuses resources on warm changes", async function () {
    setup();
    expect(effects.showStars).toBe(true);
    expect(effects.starIntensity).toBe(1);
    [-1, 65, NaN, Infinity].forEach((value) => {
      expect(() => {
        effects.starIntensity = value;
      }).toThrowDeveloperError();
      expect(
        () =>
          new SceneGISEnvironmentEffects({
            mode: "globe",
            starIntensity: value,
          }),
      ).toThrowDeveloperError();
    });
    await ready();
    const resources = effects._pipeline._resources;
    const requestRender = spyOn(scene, "requestRender");
    effects.showStars = false;
    effects.starIntensity = 2;
    effects.showStars = true;
    effects.update(scene, time);
    expect(requestRender).toHaveBeenCalled();
    expect(effects._pipeline._resources).toBe(resources);
    expect(Resource.fetchImage).toHaveBeenCalledTimes(6);
    expect(Resource.fetchImage.calls.first().args[0].preferImageBitmap).toBe(
      false,
    );
    expect(Resource.fetchArrayBuffer).toHaveBeenCalledTimes(8);
    effects.disconnectedCallback(host);
    expect(resources.starTexture.isDestroyed()).toBe(true);
  });

  ["globe", "planar"].forEach((mode) => {
    it(`composes ${mode} stars through atmospheric extinction, twilight and fog on the GPU`, async function () {
      setup(mode);
      await ready();
      const renderer = isolateBackground();
      const night = pixel()[0];
      expect(night).toBeGreaterThan(20);
      expect(night).toBeLessThan(58); // Linearized 128/255 star texel, then extinction.
      effects.showStars = false;
      expect(pixel()[0]).toBe(0);
      effects.showStars = true;
      effects.starIntensity = 0.5;
      expect(pixel()[0]).toEqualEpsilon(night / 2, 1);
      effects.starIntensity = 1;
      renderer._sunDirection = new Cartesian3(1, 0, 0);
      expect(pixel()[0]).toBe(0);
      renderer._sunDirection = Cartesian3.normalize(
        new Cartesian3(1, 0, -0.16),
        new Cartesian3(),
      );
      const twilight = pixel()[0];
      expect(twilight).toBeGreaterThan(0);
      expect(twilight).toBeLessThan(night);
      renderer._sunDirection = Cartesian3.normalize(
        new Cartesian3(1, 0, -1),
        new Cartesian3(),
      );
      renderer._frame.cameraDirection = Cartesian3.negate(
        Cartesian3.UNIT_Z,
        new Cartesian3(),
      );
      expect(pixel()[0]).toBe(0);
      Cartesian3.clone(Cartesian3.UNIT_Z, renderer._frame.cameraDirection);
      effects.heightFogDensity = 0.001;
      effects.heightFogHeightFalloff = 0;
      effects.heightFogMaximumOpacity = 1;
      effects.heightFogInscatteringScale = 0;
      effects.heightFogDirectionalInscatteringScale = 0;
      renderer._showHeightFog = true;
      expect(pixel()[0]).toBeLessThan(night / 10);
      renderer._showHeightFog = false;
      renderer._frame.altitude = 100000;
      renderer._sunDirection = new Cartesian3(1, 0, 0);
      expect(pixel()[0]).toBeGreaterThan(50); // Outside the atmosphere, including Planar no-hit rays.
    });
  });

  it("keeps Globe stars in TEME while time advances", async function () {
    setup("globe");
    await ready();
    scene.renderForSpecs(time);
    const rotation = Matrix3.clone(effects._pipeline._worldToStars);
    const expected = Transforms.computeTemeToPseudoFixedMatrix(
      time,
      new Matrix3(),
    );
    Matrix3.transpose(expected, expected);
    expect(rotation).toEqualEpsilon(expected, 1e-12);
    scene.camera.rotateRight(0.1);
    scene.renderForSpecs(time);
    expect(effects._pipeline._worldToStars).toEqualEpsilon(rotation, 1e-12);
    scene.renderForSpecs(JulianDate.addHours(time, 6, new JulianDate()));
    expect(effects._pipeline._worldToStars).not.toEqual(rotation);
  });

  it("uses the explicit Planar ENU origin in astronomy and fixed axes in manual mode", async function () {
    setup();
    await ready();
    scene.renderForSpecs(time);
    expect(effects._pipeline._worldToStars).toEqual(Matrix3.IDENTITY);
    environment.originLongitude = 1.2;
    environment.originLatitude = 0.6;
    environment.directionMode = "astronomical";
    environment.update(scene, time);
    scene.renderForSpecs(time);
    const enu = Matrix4.getMatrix3(
      Transforms.eastNorthUpToFixedFrame(Cartesian3.fromRadians(1.2, 0.6)),
      new Matrix3(),
    );
    const expected = Transforms.computeTemeToPseudoFixedMatrix(
      time,
      new Matrix3(),
    );
    Matrix3.transpose(expected, expected);
    Matrix3.multiply(expected, enu, expected);
    expect(effects._pipeline._worldToStars).toEqualEpsilon(expected, 1e-12);
    environment.directionMode = "manual";
    environment.update(scene, time);
    scene.renderForSpecs(time);
    expect(effects._pipeline._worldToStars).toEqual(Matrix3.IDENTITY);
  });

  it("publishes no GPU resources after a star load completes on a disconnected generation", async function () {
    let resolve;
    setup(
      "globe",
      new Promise((r) => {
        resolve = r;
      }),
    );
    effects.firstUpdate(scene, time);
    const pipeline = effects._pipeline;
    const publish = spyOn(pipeline, "publishResources");
    effects.disconnectedCallback(host);
    resolve(face);
    await Promise.resolve();
    await Promise.resolve();
    expect(publish).not.toHaveBeenCalled();
    expect(pipeline.isDestroyed()).toBe(true);
    expect(effects._pendingBuffers).toBeUndefined();
  });

  it("reports a star asset failure once through the existing error event", async function () {
    const error = new Error("star image unavailable");
    setup("globe", Promise.reject(error));
    const errors = [];
    effects.errorEvent.addEventListener((_owner, value) => errors.push(value));
    effects.firstUpdate(scene, time);
    await pollToPromise(() => errors.length > 0);
    effects.update(scene, time);
    expect(errors).toEqual([error]);
    expect(effects.ready).toBe(false);
    expect(effects._pipeline._resources).toBeUndefined();
  });
});
