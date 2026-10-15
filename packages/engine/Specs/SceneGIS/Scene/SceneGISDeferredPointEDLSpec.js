import {
  Cartesian2,
  Cartesian3,
  Cesium3DTileStyle,
  BoxGeometry,
  ClippingPlane,
  ClippingPlaneCollection,
  Clock,
  Color,
  ColorGeometryInstanceAttribute,
  DirectionalLight,
  GeometryInstance,
  HeadingPitchRange,
  JulianDate,
  Matrix4,
  OrthographicFrustum,
  PointCloud,
  PointCloudEyeDomeLighting,
  PerInstanceColorAppearance,
  Primitive,
  SceneGISScreenSpaceReflections,
  SceneGISScreenSpaceIndirectLighting,
  SceneGISTemporalAntialiasing,
  TimeDynamicPointCloud,
  TimeIntervalCollection,
} from "../../../index.js";
import Cesium3DTilesTester from "../../../../../Specs/Cesium3DTilesTester.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

function steppedPoints() {
  const positions = [];
  const normals = [];
  for (let y = -10; y <= 10; ++y) {
    for (let x = -10; x <= 10; ++x) {
      positions.push(x * 0.1, y * 0.1, x < 0 ? 1 : 0);
      normals.push(0, 0, 1);
    }
  }
  const positionBytes = positions.length * 4;
  let json = JSON.stringify({
    POINTS_LENGTH: positions.length / 3,
    POSITION: { byteOffset: 0 },
    NORMAL: { byteOffset: positionBytes },
    CONSTANT_RGBA: [255, 255, 255, 255],
  });
  json = json.padEnd(Math.ceil(json.length / 4) * 4, " ");
  const buffer = new ArrayBuffer(28 + json.length + positionBytes * 2);
  const bytes = new Uint8Array(buffer);
  bytes.set([112, 110, 116, 115]);
  const header = new DataView(buffer);
  header.setUint32(4, 1, true);
  header.setUint32(8, buffer.byteLength, true);
  header.setUint32(12, json.length, true);
  header.setUint32(16, positionBytes * 2, true);
  bytes.set(new TextEncoder().encode(json), 28);
  new Float32Array(buffer, 28 + json.length).set([...positions, ...normals]);
  return buffer;
}

describe("SceneGIS/Scene/SceneGISDeferredPointEDL", function () {
  let scene;
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
    scene.skyBox = scene.skyAtmosphere = scene.sun = scene.moon = undefined;
  });
  afterEach(function () {
    scene.destroyForSpecs();
  });

  function synthetic() {
    scene.camera.setView({
      destination: new Cartesian3(7000000, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.camera.frustum = new OrthographicFrustum({
      width: 4,
      aspectRatio: 1,
      near: 0.1,
      far: 30,
    });
    const cloud = new PointCloud({
      arrayBuffer: steppedPoints(),
      pickIdLoaded: () => undefined,
    });
    cloud.modelMatrix = Matrix4.fromTranslation(new Cartesian3(7000000, 0, 0));
    cloud.normalShading = false;
    cloud.style = new Cesium3DTileStyle({ pointSize: 4 });
    const processor = new PointCloudEyeDomeLighting();
    const shading = { eyeDomeLightingStrength: 1, eyeDomeLightingRadius: 2 };
    const wrapper = {
      show: true,
      enabled: true,
      update(frameState) {
        if (!this.show) {
          return;
        }
        const start = frameState.commandList.length;
        cloud.update(frameState);
        if (this.enabled && frameState.passes.render) {
          processor.update(frameState, start, shading, cloud.boundingSphere);
        }
      },
      isDestroyed() {
        return false;
      },
      destroy() {
        cloud.destroy();
        processor.destroy();
      },
    };
    scene.primitives.add(wrapper);
    return { cloud, processor, wrapper, shading };
  }

  function pixels() {
    return scene.context.readPixels({ width: 64, height: 64 });
  }

  function changed(a, b) {
    let count = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (a[i] > b[i] + 20) {
        ++count;
      }
    }
    return count;
  }

  function readDepth(processor) {
    const gl = scene.context._gl;
    const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    const buffer = new Float32Array(64 * 64);
    processor._sceneGISDeferredEDL.depth.framebuffer._bind();
    gl.readPixels(0, 0, 64, 64, gl.RED, gl.FLOAT, buffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
    return buffer;
  }

  it("shades depth steps without replaying lit color and releases hidden targets", function () {
    const { cloud, processor, wrapper, shading } = synthetic();
    shading.eyeDomeLightingStrength = 0;
    scene.renderForSpecs();
    const plain = pixels();
    const renderer = scene._sceneGISDeferred;
    const draws = renderer.lightDrawCount;
    shading.eyeDomeLightingStrength = 1;
    scene.renderForSpecs();
    expect(changed(plain, pixels())).toBeGreaterThan(20);
    expect(renderer.lightDrawCount).toBe(draws);
    expect(renderer.drawCount).toBe(1);
    expect(renderer.pointEDLDrawCount).toBe(1);
    expect(renderer.pointEDLByteLength).toBe(64 * 64 * 8);
    expect(processor.framebuffer).toBeUndefined();
    shading.eyeDomeLightingStrength = 0.1;
    scene.renderForSpecs();
    const edlColor = pixels();
    const edge = plain.findIndex(
      (v, i) => i % 4 === 0 && v > edlColor[i] + 20 && edlColor[i] > 20,
    );
    expect(edge).toBeGreaterThanOrEqual(0);
    spyOn(Color, "fromRandom").and.returnValue(new Color(0.5, 0.25, 0.125));
    scene.debugShowCommands = true;
    scene.renderForSpecs();
    const tinted = pixels();
    for (let i = 0; i < 3; ++i) {
      expect(tinted[edge + i]).toEqualEpsilon(
        edlColor[edge + i] * Math.pow([0.5, 0.25, 0.125][i], 1 / scene.gamma),
        2,
      );
    }
    expect(renderer.debugTintDrawCount).toBe(1);
    expect(renderer.pointEDLDrawCount).toBe(1);
    scene.debugShowCommands = false;
    const depth = processor._sceneGISDeferredEDL.depth.getColorTexture();
    scene.light = new DirectionalLight({
      color: Color.BLUE,
      direction: new Cartesian3(0, 0, -1),
    });
    cloud.normalShading = true;
    scene.renderForSpecs();
    expect(renderer.pointEDLDrawCount).toBe(1);
    const lit = pixels();
    expect(lit[(32 * 64 + 24) * 4]).toBe(0);
    expect(lit[(32 * 64 + 24) * 4 + 2]).toBeGreaterThan(0);
    cloud.style = new Cesium3DTileStyle({
      pointSize: 4,
      color: "color('red', 0.5)",
    });
    scene.renderForSpecs();
    expect(renderer.pointEDLDrawCount).toBe(0);
    expect(processor._sceneGISDeferredEDL).toBeUndefined();
    expect(depth.isDestroyed()).toBe(true);
    cloud.style = new Cesium3DTileStyle({ pointSize: 4 });
    scene.renderForSpecs();
    const hiddenDepth = processor._sceneGISDeferredEDL.depth.getColorTexture();
    wrapper.show = false;
    scene.renderForSpecs();
    expect(hiddenDepth.isDestroyed()).toBe(true);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("deduplicates full-view point depth across frustums and retains TAA depth", function () {
    const { processor } = synthetic();
    scene.logarithmicDepthFarToNearRatio = 1e9;
    scene.renderForSpecs();
    const single = pixels();
    scene.logarithmicDepthFarToNearRatio = 1.05;
    scene.farToNearRatio = 1.05;
    scene.renderForSpecs();
    expect(scene._view.frustumCommandsList.length).toBeGreaterThan(1);
    expect(pixels()).toEqualEpsilon(single, 1);
    expect(scene._sceneGISDeferred.pointEDLDrawCount).toBe(1);
    scene.highDynamicRange = true;
    const taa = new SceneGISTemporalAntialiasing({ scene, enabled: true });
    scene.renderForSpecs();
    expect(scene._sceneGISDeferred.pointEDLDrawCount).toBe(1);
    expect(readDepth(processor)[32 * 64 + 32]).toEqualEpsilon(10, 0.001);
    expect(scene.context._gl.getError()).toBe(0);
    taa.destroy();
  });

  it("preserves tileset styles, picking, resize and disabled ownership", async function () {
    scene.camera.lookAt(
      Cartesian3.fromRadians(-1.31968, 0.698874, 5),
      new HeadingPitchRange(0, -1.57, 5),
    );
    const tileset = await Cesium3DTilesTester.loadTileset(
      scene,
      "./Data/Cesium3DTiles/PointCloud/PointCloudNoColor/tileset.json",
    );
    const shading = tileset.pointCloudShading;
    shading.attenuation = shading.eyeDomeLighting = true;
    tileset.style = new Cesium3DTileStyle({
      pointSize: 8,
      color: "color('red')",
    });
    scene.renderForSpecs();
    const renderer = scene._sceneGISDeferred;
    const processor = tileset._pointCloudEyeDomeLighting;
    expect(renderer.pointEDLDrawCount).toBe(1);
    expect(scene.pick(new Cartesian2(32, 32))).toBeDefined();
    const original = processor._sceneGISDeferredEDL.depth.getColorTexture();
    scene.canvas.width = 80;
    scene.renderForSpecs();
    expect(original.isDestroyed()).toBe(true);
    expect(renderer.pointEDLByteLength).toBe(80 * 64 * 8);
    const resized = processor._sceneGISDeferredEDL.depth.getColorTexture();
    shading.eyeDomeLighting = false;
    scene.renderForSpecs();
    expect(resized.isDestroyed()).toBe(true);
    tileset.style = new Cesium3DTileStyle({
      pointSize: 8,
      color: "color('blue')",
    });
    shading.eyeDomeLighting = true;
    scene.renderForSpecs();
    expect(renderer.pointEDLDrawCount).toBe(1);
    const finalDepth = processor._sceneGISDeferredEDL.depth.getColorTexture();
    scene.primitives.remove(tileset);
    expect(finalDepth.isDestroyed()).toBe(true);
    scene.renderForSpecs();
    expect(renderer.pointEDLByteLength).toBe(0);
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("keeps private point neighbors behind ordinary occluders and separates processors", function () {
    const first = synthetic();
    scene.renderForSpecs();
    const firstDepth = readDepth(first.processor);
    const firstPixels = pixels();
    const panel = scene.primitives.add(
      new Primitive({
        asynchronous: false,
        geometryInstances: new GeometryInstance({
          geometry: BoxGeometry.fromDimensions({
            dimensions: new Cartesian3(0.2, 2, 0.1),
            vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.BLUE),
          },
        }),
        appearance: new PerInstanceColorAppearance({
          flat: true,
          translucent: false,
        }),
        modelMatrix: Matrix4.fromTranslation(new Cartesian3(6999999.8, 0, 2)),
      }),
    );
    scene.renderForSpecs();
    expect(readDepth(first.processor)).toEqual(firstDepth);
    const covered = pixels();
    expect(covered[(32 * 64 + 29) * 4 + 2]).toBe(255);
    expect(covered[(32 * 64 + 33) * 4]).toBe(firstPixels[(32 * 64 + 33) * 4]);
    scene.primitives.remove(panel);
    const second = synthetic();
    first.cloud.modelMatrix = Matrix4.fromTranslation(
      new Cartesian3(6999999, 0, 0),
    );
    second.cloud.modelMatrix = Matrix4.fromTranslation(
      new Cartesian3(7000001, 0, 0),
    );
    second.shading.eyeDomeLightingStrength = 0;
    scene.renderForSpecs();
    expect(scene._sceneGISDeferred.pointEDLDrawCount).toBe(2);
    expect(scene._sceneGISDeferred.pointEDLByteLength).toBe(2 * 64 * 64 * 8);
    const before = pixels();
    second.shading.eyeDomeLightingStrength = 1;
    scene.renderForSpecs();
    const after = pixels();
    expect(changed(before, after)).toBeGreaterThan(10);
    for (let y = 0; y < 64; ++y) {
      expect(after.slice(y * 256, y * 256 + 64)).toEqual(
        before.slice(y * 256, y * 256 + 64),
      );
    }
    expect(scene.context._gl.getError()).toBe(0);
  });

  it("retains clipping and point color correction with shared screen effects", async function () {
    scene.highDynamicRange = true;
    scene.camera.lookAt(
      Cartesian3.fromRadians(-1.31968, 0.698874, 5),
      new HeadingPitchRange(0, -1.57, 5),
    );
    const tileset = await Cesium3DTilesTester.loadTileset(
      scene,
      "./Data/Cesium3DTiles/PointCloud/PointCloudNormals/tileset.json",
    );
    tileset.pointCloudShading.attenuation = true;
    tileset.style = new Cesium3DTileStyle({
      pointSize: 5,
      color: "color('white')",
    });
    scene.renderForSpecs();
    const processor = tileset._pointCloudEyeDomeLighting;
    const full = readDepth(processor).filter((v) => v > 0).length;
    tileset.clippingPlanes = new ClippingPlaneCollection({
      planes: [new ClippingPlane(Cartesian3.UNIT_X, 0)],
      edgeWidth: 2,
    });
    scene.renderForSpecs();
    const clipped = readDepth(processor).filter((v) => v > 0).length;
    expect(clipped).toBeGreaterThan(0);
    expect(clipped).toBeLessThan(full);
    scene.postProcessStages.ambientOcclusion.enabled = true;
    const ssr = new SceneGISScreenSpaceReflections({ scene, enabled: true });
    const ssil = new SceneGISScreenSpaceIndirectLighting({
      scene,
      enabled: true,
    });
    scene.renderForSpecs();
    expect(scene._sceneGISDeferred.colorCorrectionDrawCount).toBe(1);
    expect(scene._sceneGISDeferred.pointEDLDrawCount).toBe(1);
    expect(pixels().some((v) => v > 0 && v < 255)).toBe(true);
    expect(scene.context._gl.getError()).toBe(0);
    ssil.destroy();
    ssr.destroy();
  });

  it("registers TimeDynamicPointCloud frames with their native processor", async function () {
    const date = JulianDate.fromIso8601("2018-07-19T15:18:00Z");
    const clock = new Clock({ currentTime: date, shouldAnimate: false });
    const sharedStyle = new Cesium3DTileStyle({
      pointSize: 10,
      show: "${POSITION}.x > -10000000",
      color: "color('red')",
    });
    scene.camera.lookAt(
      Cartesian3.fromRadians(-1.31968, 0.698874, 5),
      new HeadingPitchRange(0, -1.57, 5),
    );
    const tileset = await Cesium3DTilesTester.loadTileset(
      scene,
      "./Data/Cesium3DTiles/PointCloud/PointCloudNormals/tileset.json",
    );
    tileset.style = sharedStyle;
    const dates = [
      date,
      JulianDate.addSeconds(date, 1, new JulianDate()),
      JulianDate.addSeconds(date, 2, new JulianDate()),
    ];
    const cloud = scene.primitives.add(
      new TimeDynamicPointCloud({
        clock,
        intervals: TimeIntervalCollection.fromJulianDateArray({
          julianDates: dates,
          dataCallback: (_, index) => ({
            uri: `Data/Cesium3DTiles/PointCloud/PointCloudTimeDynamic/${index}.pnts`,
          }),
        }),
        shading: { attenuation: true, eyeDomeLighting: true },
        style: sharedStyle,
      }),
    );
    scene.camera.lookAt(
      new Cartesian3(1215012.8828876738, -4736313.051199594, 4081605.22126042),
      new HeadingPitchRange(0, -1.57, 5),
    );
    const activeScene = scene;
    for (let index = 0; index < 2; ++index) {
      clock.currentTime = dates[index];
      await pollToPromise(function () {
        activeScene.renderForSpecs();
        return cloud._frames[index]?.ready;
      });
      scene.renderForSpecs();
      expect(scene._sceneGISDeferred.pointEDLDrawCount).toBe(1);
      expect(scene.pick(new Cartesian2(32, 32))).toBeDefined();
    }
    const depth =
      cloud._pointCloudEyeDomeLighting._sceneGISDeferredEDL.depth.getColorTexture();
    scene.primitives.remove(cloud);
    expect(depth.isDestroyed()).toBe(true);
    expect(scene.context._gl.getError()).toBe(0);
  });
});
