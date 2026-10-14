import {
  Cartesian2,
  Cartesian3,
  Color,
  Globe,
  Matrix4,
  HeadingPitchRange,
  PerspectiveFrustum,
  Resource,
  Event,
  CustomHeightmapTerrainProvider,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarTilingScheme,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneGISVectorTileLayer,
  SceneGISVectorTileSource,
  SceneGISPlanarHeightmapTerrainData,
} from "../../../index.js";
import Coordinates from "../../../Source/SceneGIS/Core/_private/_SceneGISVectorGlobeCoordinates.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISVectorPatterns", function () {
  for (const globeMode of [false, true]) {
    describe(globeMode ? "Globe" : "Planar", function () {
      let scene, world, scheme, bounds, source, fetchImage, layer;
      beforeEach(function () {
        scene = createScene({ canvas: createCanvas(128, 128) });
        scene.msaaSamples = 1;
        scene.postProcessStages.fxaa.enabled = false;
        scene.fog.enabled = false;
        let level = 0;
        if (globeMode) {
          scene.globe = world = new Globe();
          world.showGroundAtmosphere = false;
          scheme = new SceneGISPlanarTilingScheme({
            coordinateSystem: new SceneGISPlanarCoordinateSystem({
              crs: "EPSG:3857",
              extent: new SceneGISPlanarExtent({
                minimumX: -Coordinates.halfWidth,
                minimumY: -Coordinates.halfWidth,
                maximumX: Coordinates.halfWidth,
                maximumY: Coordinates.halfWidth,
              }),
            }),
          });
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
        // Keep the style fixture independent of the default physical environment.
        scene.environmentEffects.enabled = false;
        scene.gamma = 1;
        world.baseColor = Color.BLUE;
        scene.camera.frustum = new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 1,
          far: 10000,
        });
        const cx = bounds.minimumX + bounds.width / 2;
        const cy = bounds.minimumY + bounds.height / 2;
        if (globeMode) {
          scene.camera.lookAt(
            Coordinates.position(cx, cy, 0),
            new HeadingPitchRange(0, -Math.PI / 2, 300),
          );
          scene.camera.lookAtTransform(Matrix4.IDENTITY);
        } else {
          scene.camera.setView({
            destination: new Cartesian3(cx, cy, 300),
            orientation: {
              direction: new Cartesian3(0, 0, -1),
              up: new Cartesian3(0, 1, 0),
            },
          });
        }
        source = new SceneGISVectorTileSource({
          url: "/{z}/{x}/{y}",
          tilingScheme: scheme,
          minimumLevel: level,
          maximumLevel: level,
        });
        const image = document.createElement("canvas");
        image.width = 64;
        image.height = 32;
        const ctx = image.getContext("2d");
        ctx.fillStyle = "red";
        ctx.fillRect(0, 0, 16, 32);
        ctx.fillStyle = "lime";
        ctx.fillRect(32, 0, 32, 32);
        spyOn(Resource.prototype, "fetchJson").and.resolveTo({
          stripes: { x: 0, y: 0, width: 32, height: 32, pixelRatio: 1 },
        });
        fetchImage = spyOn(Resource.prototype, "fetchImage").and.resolveTo(
          image,
        );
      });
      afterEach(function () {
        scene.destroyForSpecs();
      });

      function add(type, symbols = false) {
        spyOn(source, "requestTile").and.resolveTo({
          layers: [
            {
              name: "data",
              extent: 4096,
              version: 2,
              features: [
                {
                  id: "area",
                  type: type === "line" ? 2 : 3,
                  properties: {},
                  geometry: {
                    parts: [
                      new Float64Array(
                        type === "line"
                          ? [0, 2048, 4096, 2048]
                          : [0, 0, 4096, 0, 4096, 4096, 0, 4096],
                      ),
                    ],
                    polygonStarts: new Uint32Array([0]),
                  },
                },
              ],
            },
          ],
        });
        const definition = {
          id: "pattern",
          type,
          ...(type === "background"
            ? {}
            : { source: "s", "source-layer": "data" }),
          paint: {
            [`${type}-pattern`]: "stripes",
            [`${type}-color`]: "blue",
            ...(type === "line" ? { "line-width": 32 } : {}),
            ...(type === "fill-extrusion"
              ? { "fill-extrusion-height": 40 }
              : {}),
          },
        };
        const layers = [definition];
        if (symbols) {
          layers.push({
            id: "icons",
            type: "symbol",
            source: "s",
            "source-layer": "data",
            layout: { "icon-image": "stripes" },
            filter: ["==", ["geometry-type"], "Point"],
          });
        }
        layer = scene.primitives.add(
          new SceneGISVectorTileLayer({
            scene,
            tilingScheme: scheme,
            sources: { s: source },
            style: {
              version: 8,
              sprite: "/sprite",
              sources: { s: { type: "vector", tiles: ["/{z}/{x}/{y}"] } },
              layers,
            },
          }),
        );
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
              errors.length > 0 ||
              (layer.ready && layer.tilesLoaded && world.tilesLoaded)
            );
          },
          { timeout: 20000 },
        );
        remove();
        expect(errors).toEqual([]);
      }
      function scan(pick = true, lit = false) {
        scene.renderForSpecs();
        const pixels = scene.context.readPixels({
          x: 16,
          y: 64,
          width: 96,
          height: 1,
        });
        let red = 0,
          blue = 0,
          redX,
          blueX;
        for (let i = 0; i < 96; i++) {
          expect(pixels[i * 4 + 1]).toBeLessThan(5);
          if (!lit) {
            expect(pixels[i * 4] + pixels[i * 4 + 2]).toBeGreaterThan(250);
          }
          if (pixels[i * 4] > 60 && pixels[i * 4 + 2] < 10) {
            red++;
            if (i > 2 && pixels[(i - 2) * 4] > 60) {
              redX = i + 15;
            }
          }
          if (pixels[i * 4 + 2] > 200 && pixels[i * 4] < 10) {
            blue++;
            if (
              i > 2 &&
              pixels[(i - 2) * 4 + 2] > 200 &&
              pixels[(i - 2) * 4] < 10
            ) {
              blueX = i + 15;
            }
          }
        }
        expect(red).toBeGreaterThan(10);
        expect(blue).toBeGreaterThan(10);
        if (pick) {
          expect(
            scene.pick(new Cartesian2(redX, 63), 1, 1)?.id?.featureId,
          ).toBe("area");
          expect(
            scene.pick(new Cartesian2(blueX, 63), 1, 1)?.id?.featureId,
          ).toBeUndefined();
        }
      }
      ["background", "fill", "line", "fill-extrusion"].forEach((type) => {
        it(`renders ${type} repeating sprite pixels, excludes neighbor colors and preserves shared resources`, async function () {
          add(type, type === "fill");
          await ready();
          scan(type !== "background", type === "fill-extrusion");
          const atlas = layer._patterns.texture;
          if (type === "fill") {
            expect(atlas).toBe(layer._symbols.assets.sprite.texture);
          }
          const commands = layer._drawOrder.map(
            (b) => b.commands?.[0] ?? b._command,
          );
          for (let i = 0; i < 5; i++) {
            scene.renderForSpecs();
          }
          expect(
            layer._drawOrder.map((b) => b.commands?.[0] ?? b._command),
          ).toEqual(commands);
          expect(fetchImage).toHaveBeenCalledTimes(1);
          layer.opacity = 0;
          scene.renderForSpecs();
          expect(scene.pick(new Cartesian2(64, 64), 1, 1)?.primitive).not.toBe(
            layer,
          );
          scene.primitives.remove(layer);
          expect(atlas.isDestroyed()).toBeTrue();
        });
      });
      it("keeps pattern coordinates on the actual terrain without reloading the sprite", async function () {
        if (globeMode) {
          world.terrainProvider = new CustomHeightmapTerrainProvider({
            width: 8,
            height: 8,
            callback: () => new Float32Array(64).fill(25),
          });
        } else {
          world.terrainProvider = {
            tilingScheme: scheme,
            minimumHeight: 25,
            maximumHeight: 25,
            maximumLevel: 0,
            errorEvent: new Event(),
            getLevelMaximumGeometricError: () => 1,
            getTileDataAvailable: () => true,
            loadTileDataAvailability: () => undefined,
            requestTileGeometry: () =>
              Promise.resolve(
                new SceneGISPlanarHeightmapTerrainData({
                  buffer: new Float32Array(4).fill(25),
                  width: 2,
                  height: 2,
                }),
              ),
          };
        }
        add("fill");
        await ready();
        scan();
        expect(fetchImage).toHaveBeenCalledTimes(1);
      });
    });
  }
});
