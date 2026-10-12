import {
  Cartesian3,
  Cartesian4,
  Color,
  Ellipsoid,
  Globe,
  JulianDate,
  Matrix3,
  Matrix4,
  OrthographicFrustum,
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
import createCanvas from "../../../../../Specs/createCanvas.js";

describe("SceneGIS/Scene/SceneGISAtmosphereStars", function () {
  let scene;
  let effects;
  let environment;
  const host = {};
  const time = JulianDate.fromIso8601("2026-06-21T15:00:00Z");
  function setup(mode = "planar", size = 1) {
    scene = createScene({
      scene3DOnly: true,
      canvas: createCanvas(size, size),
    });
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
    spyOn(Resource, "fetchImage").and.throwError("Stars must not fetch images");
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
    effects._pipeline._resources.starsCommand.execute(scene.context);
    return Array.from(scene.context.readPixels({ width: 1, height: 1 }));
  }

  function placeTestStar(direction = Cartesian3.UNIT_Z) {
    const resources = effects._pipeline._resources;
    resources.starsCommand.instanceCount = 1;
    resources.starsVertexArray
      .getAttribute(1)
      .vertexBuffer.copyFromArrayView(
        new Float32Array([
          direction.x,
          direction.y,
          direction.z,
          0.5,
          0.5,
          0.5,
        ]),
      );
  }

  function isolateBackground() {
    const renderer = effects._pipeline;
    Matrix3.clone(Matrix3.IDENTITY, renderer._worldToStars);
    placeTestStar();
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
    expect(Resource.fetchImage).not.toHaveBeenCalled();
    expect(Resource.fetchArrayBuffer).toHaveBeenCalledTimes(8);
    const stars = resources.starsVertexArray.getAttribute(1).vertexBuffer;
    expect(stars.sizeInBytes).toBe(4096 * 24);
    effects.disconnectedCallback(host);
    expect(resources.starsVertexArray.isDestroyed()).toBe(true);
    expect(stars.isDestroyed()).toBe(true);
  });

  ["globe", "planar"].forEach((mode) => {
    it(`composes ${mode} stars through atmospheric extinction, twilight and fog on the GPU`, async function () {
      setup(mode);
      await ready();
      const renderer = isolateBackground();
      const night = pixel()[0];
      expect(night).toBeGreaterThan(20);
      expect(night).toBeLessThan(58); // Filtered linear star radiance, then extinction.
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
      placeTestStar(renderer._frame.cameraDirection);
      expect(pixel()[0]).toBe(0);
      Cartesian3.clone(Cartesian3.UNIT_Z, renderer._frame.cameraDirection);
      placeTestStar();
      effects.heightFogDensity = 0.001;
      effects.heightFogHeightFalloff = 0;
      effects.heightFogMaximumOpacity = 1;
      effects.heightFogInscatteringScale = 0;
      effects.heightFogDirectionalInscatteringScale = 0;
      renderer._showHeightFog = true;
      if (mode === "globe") {
        // Globe applies fog once in the final Aerial pass, after this star draw.
        expect(pixel()[0]).toEqualEpsilon(night, 1);
      } else {
        expect(pixel()[0]).toBeLessThan(night / 10);
      }
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

  it("recreates the same catalog without network assets or directional bias", async function () {
    setup();
    await ready();
    const first = new Float32Array(4096 * 6);
    effects._pipeline._resources.starsVertexArray
      .getAttribute(1)
      .vertexBuffer.getBufferData(first);
    const mean = new Cartesian3();
    for (let i = 0; i < first.length; i += 6) {
      const direction = new Cartesian3(first[i], first[i + 1], first[i + 2]);
      expect(Cartesian3.magnitude(direction)).toEqualEpsilon(1, 1e-7);
      Cartesian3.add(mean, direction, mean);
    }
    expect(Cartesian3.magnitude(mean) / 4096).toBeLessThan(0.04);
    effects.enabled = false;
    effects.update(scene, time);
    effects.enabled = true;
    await ready();
    const second = new Float32Array(first.length);
    effects._pipeline._resources.starsVertexArray
      .getAttribute(1)
      .vertexBuffer.getBufferData(second);
    expect(second).toEqual(first);
    expect(Resource.fetchImage).not.toHaveBeenCalled();
  });

  it("preserves star energy during subpixel motion without changing background alpha", async function () {
    setup("planar", 16);
    await ready();
    const renderer = isolateBackground();
    renderer._frame.altitude = 100000;
    for (const phase of [0, 0.25, 0.5, 0.75]) {
      placeTestStar(
        Cartesian3.normalize(
          new Cartesian3(phase / 8, phase / 8, 1),
          new Cartesian3(),
        ),
      );
      pixel();
      const pixels = scene.context.readPixels({ width: 16, height: 16 });
      let energy = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        energy += pixels[i];
        expect(pixels[i + 3]).toBe(255);
      }
      // RGBA8 quantization accounts for the small integral error.
      expect(energy).toEqualEpsilon(0.5 * 255, 4);
    }
  });

  it("submits no star draw when hidden, zero intensity or orthographic", async function () {
    setup();
    await ready();
    const draw = spyOn(
      effects._pipeline._resources.starsCommand,
      "execute",
    ).and.callThrough();
    scene.renderForSpecs(time);
    expect(draw).toHaveBeenCalledTimes(1);
    draw.calls.reset();
    effects.showStars = false;
    scene.renderForSpecs(time);
    effects.showStars = true;
    effects.starIntensity = 0;
    scene.renderForSpecs(time);
    effects.starIntensity = 1;
    scene.camera.frustum = new OrthographicFrustum({
      width: 1000,
      aspectRatio: 1,
    });
    scene.renderForSpecs(time);
    expect(draw).not.toHaveBeenCalled();
  });
});
