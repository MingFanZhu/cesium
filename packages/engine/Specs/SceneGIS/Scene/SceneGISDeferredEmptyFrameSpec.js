import {
  BoxGeometry,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Matrix4,
  PerInstanceColorAppearance,
  PerspectiveFrustum,
  PostProcessStage,
  Primitive,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISDeferredEmptyFrame", function () {
  let scene;

  afterEach(function () {
    scene?.destroyForSpecs();
    scene = undefined;
  });

  function look(up) {
    scene.camera.setView({
      destination: new Cartesian3(0, 0, 10),
      orientation: {
        direction: new Cartesian3(0, 0, up ? 1 : -1),
        up: Cartesian3.UNIT_Y,
      },
    });
  }

  function pixels() {
    return Array.from(scene.context.readPixels());
  }

  [false, true].forEach(function (multiFrustum) {
    it(`clears native post-process depth on the first empty frame after ${multiFrustum ? "multiple frusta" : "one frustum"}`, async function () {
      scene = createScene({ canvas: createCanvas(32, 32), scene3DOnly: true });
      scene._initializeWorld(
        new SceneGISPlanarWorld({
          coordinateSystem: new SceneGISPlanarCoordinateSystem({
            extent: new SceneGISPlanarExtent({
              minimumX: -32,
              minimumY: -32,
              maximumX: 32,
              maximumY: 32,
            }),
          }),
          maximumLevel: 0,
          baseColor: Color.WHITE,
        }),
      );
      // Isolate the native public depth input from environment color composition.
      scene.environmentEffects.enabled = false;
      scene.highDynamicRange = false;
      scene.camera.frustum = new PerspectiveFrustum({
        fov: Math.PI / 3,
        aspectRatio: 1,
        near: 0.1,
        far: 100,
      });
      scene.logarithmicDepthBuffer = false;
      scene.farToNearRatio = multiFrustum ? 2 : 1000;
      // Put real opaque depth in the nearest segment as well as distant terrain.
      scene.primitives.add(
        new Primitive({
          geometryInstances: new GeometryInstance({
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(0.1, 0.1, 0.1),
              vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
            }),
            modelMatrix: Matrix4.fromTranslation(new Cartesian3(0, 0, 9.8)),
            attributes: {
              color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
            },
          }),
          appearance: new PerInstanceColorAppearance({
            flat: true,
            closed: true,
            translucent: false,
          }),
          asynchronous: false,
        }),
      );
      look(false);
      const mask = scene.postProcessStages.add(
        new PostProcessStage({
          fragmentShader:
            "uniform sampler2D depthTexture; in vec2 v_textureCoordinates; void main() { float sky = step(1.0, texture(depthTexture, v_textureCoordinates).r); out_FragColor = vec4(vec3(sky), 1.0); }",
        }),
      );
      await pollToPromise(function () {
        scene.renderForSpecs();
        return mask.ready;
      });
      scene.renderForSpecs();
      expect(pixels().some((value) => value === 0)).toBe(true);
      if (multiFrustum) {
        expect(scene.numberOfFrustums).toBeGreaterThan(1);
      } else {
        expect(scene.numberOfFrustums).toBe(1);
      }
      const depth = scene._view.globeDepth.depthStencilTexture;
      const clear = spyOn(
        scene._depthClearCommand,
        "execute",
      ).and.callThrough();

      look(true);
      scene.renderForSpecs();
      expect(scene.numberOfFrustums).toBe(0);
      expect(pixels().every((value) => value === 255)).toBe(true);
      expect(clear.calls.count()).toBe(1);
      expect(scene._view.globeDepth.depthStencilTexture).toBe(depth);
      expect(depth.isDestroyed()).toBe(false);

      clear.calls.reset();
      scene.renderForSpecs();
      expect(pixels().every((value) => value === 255)).toBe(true);
      expect(clear.calls.count()).toBe(1);

      clear.calls.reset();
      look(false);
      scene.renderForSpecs();
      expect(pixels().some((value) => value === 0)).toBe(true);
      expect(clear.calls.count()).toBe(
        scene.numberOfFrustums * (multiFrustum ? 2 : 1),
      );
      expect(scene._view.globeDepth.depthStencilTexture).toBe(depth);
    });
  });
});
