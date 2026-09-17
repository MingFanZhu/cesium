import {
  Cartesian2,
  Cartesian3,
  Color,
  Globe,
  Matrix4,
  HeadingPitchRange,
  PerspectiveFrustum,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISVectorTileLayer,
  SceneGISVectorTileSource,
} from "../../../index.js";
import Coordinates from "../../../Source/SceneGIS/Core/_private/_SceneGISVectorGlobeCoordinates.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISVectorState", function () {
  for (const globeMode of [false, true]) {
    describe(globeMode ? "Globe" : "Planar", function () {
      let scene, world, layer, requests, errors;
      const target = { source: "s", sourceLayer: "a", id: "1" };
      beforeEach(function () {
        scene = createScene({ canvas: createCanvas(128, 128) });
        scene.msaaSamples = 1;
        scene.fog.enabled = false;
        scene.postProcessStages.fxaa.enabled = false;
        let scheme,
          bounds,
          level = 0;
        if (globeMode) {
          scene.globe = world = new Globe();
          world.showGroundAtmosphere = false;
          scheme = Coordinates.scheme();
          level = 14;
          bounds = scheme.tileXYToExtent(8801, 5373, level);
        } else {
          scene.frameState.scene3DOnly = true;
          world = new SceneGISPlanarWorld({
            coordinateSystem: new SceneGISPlanarCoordinateSystem({
              extent: new SceneGISPlanarExtent({
                minimumX: -2048,
                minimumY: -2048,
                maximumX: 2048,
                maximumY: 2048,
              }),
            }),
            maximumLevel: 0,
          });
          scene._initializeWorld(world);
          scheme = world.tilingScheme;
          bounds = scheme.tileXYToExtent(0, 0, 0);
        }
        world.baseColor = Color.BLACK;
        scene.camera.frustum = new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 1,
          far: 10000,
        });
        const x = (bounds.minimumX + bounds.maximumX) / 2,
          y = (bounds.minimumY + bounds.maximumY) / 2;
        if (globeMode) {
          scene.camera.lookAt(
            Coordinates.position(x, y, 0),
            new HeadingPitchRange(0, -Math.PI / 2, 300),
          );
          scene.camera.lookAtTransform(Matrix4.IDENTITY);
        } else {
          scene.camera.setView({
            destination: new Cartesian3(x, y, 300),
            orientation: {
              direction: new Cartesian3(0, 0, -1),
              up: new Cartesian3(0, 1, 0),
            },
          });
        }
        const source = new SceneGISVectorTileSource({
          url: "/{z}/{x}/{y}",
          tilingScheme: scheme,
          minimumLevel: level,
          maximumLevel: level,
        });
        requests = spyOn(source, "requestTile").and.resolveTo({
          layers: [
            {
              name: "a",
              extent: 4096,
              features: [
                {
                  id: "1",
                  type: 3,
                  properties: {},
                  geometry: {
                    parts: [
                      new Float64Array([0, 0, 4096, 0, 4096, 4096, 0, 4096]),
                    ],
                    polygonStarts: new Uint32Array([0]),
                  },
                },
              ],
            },
            {
              name: "b",
              extent: 4096,
              features: [
                {
                  id: "1",
                  type: 3,
                  properties: {},
                  geometry: {
                    parts: [
                      new Float64Array([
                        2048, 0, 4096, 0, 4096, 4096, 2048, 4096,
                      ]),
                    ],
                    polygonStarts: new Uint32Array([0]),
                  },
                },
              ],
            },
          ],
        });
        layer = scene.primitives.add(
          new SceneGISVectorTileLayer({
            scene,
            tilingScheme: scheme,
            sources: { s: source },
            style: {
              version: 8,
              sources: { s: { type: "vector", tiles: ["/{z}/{x}/{y}"] } },
              layers: [
                {
                  id: "interactive",
                  type: "fill",
                  source: "s",
                  "source-layer": "a",
                  paint: {
                    "fill-color": [
                      "case",
                      ["boolean", ["feature-state", "selected"], false],
                      "red",
                      ["coalesce", ["global-state", "color"], "blue"],
                    ],
                    "fill-opacity": [
                      "case",
                      ["boolean", ["feature-state", "hidden"], false],
                      0,
                      1,
                    ],
                  },
                },
                {
                  id: "fixed",
                  type: "fill",
                  source: "s",
                  "source-layer": "b",
                  paint: { "fill-color": "yellow" },
                },
              ],
            },
          }),
        );
        errors = [];
        layer.errorEvent.addEventListener(({ error }) =>
          errors.push(error.message),
        );
      });
      afterEach(function () {
        scene.destroyForSpecs();
      });
      async function ready() {
        await pollToPromise(
          () => {
            scene.renderForSpecs();
            return (
              errors.length ||
              (layer.ready && layer.tilesLoaded && world.tilesLoaded)
            );
          },
          { timeout: 10000 },
        );
        expect(errors).toEqual([]);
      }
      function pixel() {
        scene.renderForSpecs();
        return Array.from(
          scene.context.readPixels({ x: 32, y: 64, width: 1, height: 1 }),
        );
      }
      function fixed() {
        return (
          layer._drawOrder.find((b) => b._record?.definition.id === "fixed")
            ?._resources ??
          [...layer._sources.get("s").entries.values()]
            .find((e) => e.batches.has("fixed"))
            ?.batches.get("fixed")[0]._resources
        );
      }
      it("updates dependent batches without MVT requests, restores zero-alpha features and isolates identities", async function () {
        await ready();
        const count = requests.calls.count(),
          unchanged = fixed();
        expect(unchanged).toBeDefined();
        expect(pixel()).toEqual([0, 0, 255, 255]);
        layer.setFeatureState({ ...target, id: 1 }, { selected: true });
        await ready();
        expect(pixel()).toEqual([255, 0, 0, 255]);
        expect(fixed()).toBe(unchanged);
        expect(scene.pick(new Cartesian2(32, 64), 1, 1)?.id.featureId).toBe(
          "1",
        );
        const tasks = layer.statistics.workerTasks;
        layer.setFeatureState(target, { selected: true, unused: 1 });
        await ready();
        expect(layer.statistics.workerTasks).toBe(tasks);
        layer.setFeatureState({ ...target, id: "absent" }, { selected: true });
        await ready();
        expect(layer.statistics.workerTasks).toBe(tasks);
        layer.setFeatureState(
          { ...target, sourceLayer: "b" },
          { selected: true },
        );
        await ready();
        expect(layer.statistics.workerTasks).toBe(tasks);
        layer.setFeatureState(target, { hidden: true });
        await ready();
        expect(pixel()).toEqual([0, 0, 0, 255]);
        expect(scene.pick(new Cartesian2(32, 64), 1, 1)?.primitive).not.toBe(
          layer,
        );
        layer.removeFeatureState(target, "hidden");
        await ready();
        expect(pixel()).toEqual([255, 0, 0, 255]);
        layer.removeFeatureState(target);
        layer.setGlobalStateProperty("color", "lime");
        await ready();
        expect(pixel()).toEqual([0, 255, 0, 255]);
        expect(fixed()).toBe(unchanged);
        layer.setGlobalStateProperty("color", null);
        await ready();
        expect(pixel()).toEqual([0, 0, 255, 255]);
        expect(requests.calls.count()).toBe(count);
      });
      it("ignores obsolete Worker preparation and returns independent JSON snapshots", async function () {
        await ready();
        const fixedResource = fixed();
        const snapshot = { selected: true, data: { values: [1, 2] } };
        layer.setFeatureState(target, snapshot);
        snapshot.data.values[0] = 9;
        expect(layer.getFeatureState(target).data.values[0]).toBe(1);
        const returned = layer.getFeatureState(target);
        returned.data.values[0] = 8;
        expect(layer.getFeatureState(target).data.values[0]).toBe(1);
        const schedule = layer._workers.schedule.bind(layer._workers);
        let release;
        spyOn(layer._workers, "schedule").and.callFake(
          (parameters, transfers) => {
            const result = schedule(parameters, transfers);
            return result?.then(
              (value) =>
                new Promise((resolve) => {
                  release = () => resolve(value);
                }),
            );
          },
        );
        scene.renderForSpecs();
        await pollToPromise(() => release !== undefined);
        layer.removeFeatureState(target);
        layer.setGlobalStateProperty("color", "lime");
        layer._workers.schedule.and.callFake(schedule);
        release();
        await ready();
        expect(pixel()).toEqual([0, 255, 0, 255]);
        expect(fixed()).toBe(fixedResource);
        const global = layer.getGlobalState();
        global.color = "red";
        expect(layer.getGlobalState().color).toBe("lime");
        expect(() =>
          layer.setFeatureState({ ...target, source: "unknown" }, {}),
        ).toThrowDeveloperError();
        expect(() =>
          layer.setFeatureState({ ...target, id: 2 ** 60 }, {}),
        ).toThrowDeveloperError();
        expect(() =>
          layer.setGlobalStateProperty("x", undefined),
        ).toThrowDeveloperError();
      });
    });
  }
});
