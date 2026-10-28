import {
  BoxGeometry,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  GeometryInstance,
  Globe,
  JulianDate,
  Matrix4,
  PerInstanceColorAppearance,
  Primitive,
  SceneGISWindSimulation,
  SceneGISWindVisualization,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  Transforms,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISWindVisualization", function () {
  let scene, wind, view;
  const time = JulianDate.fromIso8601("2026-10-28T00:00:00Z");
  afterEach(function () {
    if (view && !view.isDestroyed()) {
      scene.primitives.remove(view);
    }
    scene?.destroyForSpecs();
    scene = wind = view = undefined;
  });
  [false, true].forEach(function (planar) {
    it(`renders tracer volume/slice, preserves pause and occludes behind geometry in ${planar ? "Planar" : "Globe"}`, async function () {
      scene = createScene({ canvas: createCanvas(64, 64), scene3DOnly: true });
      scene.skyBox = scene.skyAtmosphere = scene.sun = scene.moon = undefined;
      scene.fog.enabled = false;
      let matrix;
      if (planar) {
        scene._initializeWorld(
          new SceneGISPlanarWorld({
            coordinateSystem: new SceneGISPlanarCoordinateSystem({
              extent: new SceneGISPlanarExtent({
                minimumX: 19999000,
                maximumX: 20001000,
                minimumY: -30001000,
                maximumY: -29999000,
              }),
            }),
            maximumLevel: 0,
          }),
        );
        matrix = Matrix4.fromTranslation(
          new Cartesian3(20000000, -30000000, 100),
        );
      } else {
        scene.globe = new Globe();
        matrix = Transforms.eastNorthUpToFixedFrame(
          Cartesian3.fromDegrees(118.8, 32, 100),
        );
      }
      scene.camera.setView({
        destination: Matrix4.multiplyByPoint(
          matrix,
          new Cartesian3(4, 4, 24),
          new Cartesian3(),
        ),
        orientation: {
          direction: Matrix4.multiplyByPointAsVector(
            matrix,
            new Cartesian3(0, 0, -1),
            new Cartesian3(),
          ),
          up: Matrix4.multiplyByPointAsVector(
            matrix,
            Cartesian3.UNIT_Y,
            new Cartesian3(),
          ),
        },
      });
      scene.camera.frustum.near = 0.1;
      scene.camera.frustum.far = 200;
      wind = scene.primitives.add(
        new SceneGISWindSimulation({
          dimensions: new Cartesian3(8, 8, 8),
          cellSize: 1,
          timeStep: 1,
          kinematicViscosity: 0.1,
          windSpeed: 0.02,
          modelMatrix: matrix,
          paused: true,
          tracerSources: [
            { position: new Cartesian3(4, 4, 4), radius: 20, rate: 1 },
          ],
        }),
      );
      view = scene.primitives.add(
        new SceneGISWindVisualization({
          scene,
          simulation: wind,
          colorBy: "concentration",
          colorMaximum: 1,
          extinction: 1,
          showStreamlines: false,
          sliceHeight: 4,
        }),
      );
      wind.step();
      await pollToPromise(() => {
        scene.renderForSpecs(time);
        return view._stage?.ready;
      });
      const pixel = () =>
        Array.from(
          scene.context.readPixels({ x: 32, y: 32, width: 1, height: 1 }),
        );
      scene.renderForSpecs(time);
      const snapshot = pixel(),
        version = wind.getGpuField().version;
      expect(snapshot[0]).toBeGreaterThan(100);
      const later = JulianDate.addSeconds(time, 100, new JulianDate());
      scene.renderForSpecs(later);
      expect(pixel()).toEqual(snapshot);
      expect(wind.getGpuField().version).toEqual(version);
      view.mode = "slice";
      scene.renderForSpecs(later);
      expect(pixel()[0]).toBeGreaterThan(100);
      view.mode = "volume";
      view.showStreamlines = true;
      scene.primitives.add(
        new Primitive({
          asynchronous: false,
          modelMatrix: Matrix4.multiplyByTranslation(
            matrix,
            new Cartesian3(4, 4, 12),
            new Matrix4(),
          ),
          geometryInstances: new GeometryInstance({
            geometry: BoxGeometry.fromDimensions({
              dimensions: new Cartesian3(10, 10, 1),
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
        }),
      );
      scene.renderForSpecs(later);
      const covered = pixel();
      expect(covered[2]).toBeGreaterThan(100);
      expect(covered[0]).toBeLessThan(5);
      view.show = false;
      scene.renderForSpecs(later);
      expect(pixel()).toEqual(covered);
      const stage = view._stage,
        program = view._command.shaderProgram,
        array = view._array;
      view.show = true;
      scene.renderForSpecs(later);
      scene.primitives.remove(view);
      expect(stage.isDestroyed()).toBeTrue();
      expect(array.isDestroyed()).toBeTrue();
      expect(wind.isDestroyed()).toBeFalse();
      scene.renderForSpecs(later);
      expect(pixel()).toEqual(covered);
      scene.destroyForSpecs();
      scene = undefined;
      expect(program.isDestroyed()).toBeTrue();
    });
  });
});
