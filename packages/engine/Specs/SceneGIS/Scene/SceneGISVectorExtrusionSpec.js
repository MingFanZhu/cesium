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
  SceneTransforms,
  SceneGISPlanarHeightmapTerrainData,
  Event,
  CustomHeightmapTerrainProvider,
  DirectionalLight,
} from "../../../index.js";
import Coordinates from "../../../Source/SceneGIS/Core/_private/_SceneGISVectorGlobeCoordinates.js";
import Pass from "../../../Source/Renderer/Pass.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISVectorExtrusion", function () {
  for (const globeMode of [false, true]) {
    describe(globeMode ? "Globe" : "Planar", function () {
      let scene, source, scheme, bounds, world, target, layer;
      const height = 80;
      beforeEach(function () {
        scene = createScene({ canvas: createCanvas(256, 256) });
        scene.msaaSamples = 1;
        scene.postProcessStages.fxaa.enabled = false;
        scene.fog.enabled = false;
        scene.light = new DirectionalLight({
          direction: new Cartesian3(-1, -1, -1),
        });
        if (globeMode) {
          scene.globe = world = new Globe();
          world.showGroundAtmosphere = false;
          world.maximumScreenSpaceError = 8;
          scheme = Coordinates.scheme();
          const level = 14;
          const x = Math.floor(((13.4 + 180) / 360) * 2 ** level);
          const y = Math.floor(
            ((1 - Math.asinh(Math.tan((52.5 * Math.PI) / 180)) / Math.PI) / 2) *
              2 ** level,
          );
          bounds = scheme.tileXYToExtent(x, y, level);
          source = new SceneGISVectorTileSource({
            url: "/{z}/{x}/{y}",
            tilingScheme: scheme,
            minimumLevel: level,
            maximumLevel: level,
          });
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
          source = new SceneGISVectorTileSource({
            url: "/{z}/{x}/{y}",
            tilingScheme: scheme,
            maximumLevel: 0,
          });
        }
        world.baseColor = Color.BLUE;
        target = {
          x: bounds.minimumX + bounds.width / 2,
          y: bounds.minimumY + bounds.height / 2,
        };
        scene.camera.frustum = new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 1,
          far: 10000,
        });
        frame(40);
      });
      afterEach(function () {
        scene.destroyForSpecs();
      });
      function position(z, dx = 0, dy = 0) {
        return globeMode
          ? Coordinates.position(target.x + dx, target.y + dy, z)
          : new Cartesian3(target.x + dx, target.y + dy, z);
      }
      function frame(z) {
        if (globeMode) {
          scene.camera.lookAt(
            position(z),
            new HeadingPitchRange(0, -Math.PI / 4, 350),
          );
          scene.camera.lookAtTransform(Matrix4.IDENTITY);
        } else {
          scene.camera.setView({
            destination: position(z + 250, 0, -250),
            orientation: {
              direction: new Cartesian3(0, Math.SQRT1_2, -Math.SQRT1_2),
              up: new Cartesian3(0, Math.SQRT1_2, Math.SQRT1_2),
            },
          });
        }
      }
      function add(base = 0) {
        const d = (40 / bounds.width) * 4096;
        const f = {
          id: "tower",
          type: 3,
          properties: { height, base },
          geometry: {
            parts: [
              new Float64Array([
                2048 - d,
                2048 - d,
                2048 + d,
                2048 - d,
                2048 + d,
                2048 + d,
                2048 - d,
                2048 + d,
              ]),
            ],
            polygonStarts: new Uint32Array([0]),
          },
        };
        spyOn(source, "requestTile").and.resolveTo({
          layers: [{ name: "data", version: 2, extent: 4096, features: [f] }],
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
                  id: "buildings",
                  type: "fill-extrusion",
                  source: "s",
                  "source-layer": "data",
                  paint: {
                    "fill-extrusion-height": ["get", "height"],
                    "fill-extrusion-base": ["get", "base"],
                    "fill-extrusion-color": "red",
                  },
                },
              ],
            },
          }),
        );
        return layer;
      }
      async function ready() {
        const errors = [];
        const remove = layer.errorEvent.addEventListener((e) =>
          errors.push(e.error.message),
        );
        await pollToPromise(
          () => {
            scene.renderForSpecs();
            return (
              (layer.ready && layer.tilesLoaded && world.tilesLoaded) ||
              errors.length > 0
            );
          },
          { timeout: 20000 },
        );
        remove();
        expect(errors).toEqual([]);
        scene.renderForSpecs();
      }
      function sample(z, dx = 0, dy = 0) {
        scene.renderForSpecs();
        const p = SceneTransforms.worldToWindowCoordinates(
          scene,
          position(z, dx, dy),
        );
        const color = Array.from(
          scene.context.readPixels({
            x: Math.floor(p.x),
            y: 255 - Math.floor(p.y),
            width: 1,
            height: 1,
          }),
        );
        const picked = scene.pick(new Cartesian2(p.x, p.y), 1, 1);
        return { color, picked, point: p };
      }
      it("draws and picks an elevated roof, preserves warm resources and changes opacity without rebuilding", async function () {
        add();
        await ready();
        const pixel = sample(height);
        expect(pixel.color[0]).toBeGreaterThan(20);
        expect(pixel.color[2]).toBe(0);
        expect(pixel.picked?.id?.featureId).toBe("tower");
        scene.renderForSpecs();
        const roof = scene.pickPosition(pixel.point);
        expect(Cartesian3.distance(roof, position(height))).toBeLessThan(3);
        const batch = layer._drawOrder.find(
          (b) => b._kind === "fill-extrusion",
        );
        const resources = batch._resources,
          va = resources._vertexArrays[0],
          program = resources._shaderProgram;
        expect(batch.commands[0].pass).toBe(Pass.OPAQUE);
        for (let i = 0; i < 5; i++) {
          scene.renderForSpecs();
        }
        expect(batch._resources).toBe(resources);
        layer.opacity = 0.5;
        const transparent = sample(height);
        expect(transparent.color[2]).toBeGreaterThan(20);
        expect(transparent.picked?.id?.featureId).toBe("tower");
        expect(batch.commands[0].pass).toBe(Pass.TRANSLUCENT);
        expect(resources._vertexArrays[0]).toBe(va);
        expect(resources._shaderProgram).toBe(program);
        layer.opacity = 0;
        expect(sample(height).picked?.id?.featureId).toBeUndefined();
        layer.opacity = 1;
        expect(sample(height).picked?.id?.featureId).toBe("tower");
        scene.primitives.remove(layer);
        expect(va.isDestroyed()).toBeTrue();
      });
      it("raises the roof on resident terrain without rebuilding the geometry", async function () {
        add(10);
        await ready();
        const batch = layer._drawOrder.find(
          (b) => b._kind === "fill-extrusion",
        );
        const va = batch._resources._vertexArrays[0];
        if (globeMode) {
          world.terrainProvider = new CustomHeightmapTerrainProvider({
            width: 8,
            height: 8,
            callback: () => new Float32Array(64).fill(120),
          });
        } else {
          const provider = {
            tilingScheme: scheme,
            minimumHeight: 120,
            maximumHeight: 120,
            maximumLevel: 0,
            errorEvent: new Event(),
            getLevelMaximumGeometricError: () => 1,
            getTileDataAvailable: () => true,
            loadTileDataAvailability: () => undefined,
          };
          provider.requestTileGeometry = () =>
            Promise.resolve(
              new SceneGISPlanarHeightmapTerrainData({
                buffer: new Float32Array(4).fill(120),
                width: 2,
                height: 2,
              }),
            );
          world.terrainProvider = provider;
        }
        frame(160);
        await ready();
        await pollToPromise(
          () => {
            scene.renderForSpecs();
            return (
              Math.abs(
                (layer._terrain?.height(target.x, target.y) ?? 0) - 120,
              ) < 2
            );
          },
          { timeout: 20000 },
        );
        const actualHeight = layer._terrain.height(target.x, target.y);
        const pixel = sample(actualHeight + height);
        expect(pixel.picked?.id?.featureId).toBe("tower");
        // Planar switches its existing flat/ground mode once; later terrain updates keep VA stable.
        if (globeMode) {
          expect(batch._resources._vertexArrays[0]).toBe(va);
        }
        expect(pixel.color[0]).toBeGreaterThan(20);
      });
    });
  }
});
