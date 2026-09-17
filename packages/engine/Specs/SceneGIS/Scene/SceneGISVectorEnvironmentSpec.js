import {
  Cartesian2,
  Cartesian3,
  Color,
  CustomHeightmapTerrainProvider,
  Event,
  Globe,
  HeadingPitchRange,
  Matrix4,
  PixelFormat,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarWorld,
  SceneGISVectorTileLayer,
  SceneGISVectorTileSource,
  Texture,
  BoxGeometry,
  GeometryInstance,
  Primitive,
  PerInstanceColorAppearance,
  ColorGeometryInstanceAttribute,
  DirectionalLight,
  ShadowMode,
  Transforms,
} from "../../../index.js";
import Coordinates from "../../../Source/SceneGIS/Core/_private/_SceneGISVectorGlobeCoordinates.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISVectorEnvironment", function () {
  for (const profile of [
    "flat",
    "ground",
    "globe",
    "globe-terrain",
    "flat-extrusion",
    "globe-extrusion",
  ]) {
    it(`uses physical source/sky/cloud lighting on ${profile} and preserves pick, geometry and borrowed resources`, async function () {
      const scene = createScene({ canvas: createCanvas(128, 128) });
      const globe = profile.startsWith("globe");
      const terrain = profile.includes("terrain") || profile === "ground";
      const extrusion = profile.endsWith("extrusion");
      const kind = extrusion ? "fill-extrusion" : "fill";
      const textures = [];
      const key = globe ? "_sceneGISGlobeLighting" : "_sceneGISPlanarLighting";
      function texture(rgba) {
        const result = new Texture({
          context: scene.context,
          width: 2,
          height: 2,
          pixelFormat: PixelFormat.RGBA,
          source: {
            arrayBufferView: Uint8Array.from([
              ...rgba,
              ...rgba,
              ...rgba,
              ...rgba,
            ]),
          },
        });
        textures.push(result);
        return result;
      }
      function pixel() {
        scene.renderForSpecs();
        return Array.from(
          scene.context.readPixels({ x: 64, y: 64, width: 1, height: 1 }),
        );
      }
      try {
        scene.highDynamicRange = true;
        scene.fog.enabled = false;
        scene.msaaSamples = 1;
        scene.postProcessStages.fxaa.enabled = false;
        let scheme, world, target;
        if (globe) {
          scene.globe = world = new Globe();
          world.baseColor = Color.BLACK;
          world.showGroundAtmosphere = false;
          scheme = Coordinates.scheme();
          const bounds = scheme.tileXYToExtent(8192, 8192, 14);
          target = Coordinates.position(
            bounds.minimumX + bounds.width / 2,
            bounds.minimumY + bounds.height / 2,
            terrain ? 600 : 0,
          );
          if (terrain) {
            world.terrainProvider = new CustomHeightmapTerrainProvider({
              width: 3,
              height: 3,
              callback: () => new Float32Array(9).fill(600),
            });
          }
          scene.camera.lookAt(
            target,
            new HeadingPitchRange(0, -Math.PI / 3, 400),
          );
          scene.camera.lookAtTransform(Matrix4.IDENTITY);
        } else {
          scene.frameState.scene3DOnly = true;
          target = new Cartesian3(20000000, -3000000, terrain ? 20 : 0);
          world = new SceneGISPlanarWorld({
            coordinateSystem: new SceneGISPlanarCoordinateSystem({
              crs: "EPSG:3857",
              extent: new SceneGISPlanarExtent({
                minimumX: target.x - 128,
                maximumX: target.x + 128,
                minimumY: target.y - 128,
                maximumY: target.y + 128,
              }),
            }),
            maximumLevel: 0,
            baseColor: Color.BLACK,
          });
          scene._initializeWorld(world);
          scheme = world.tilingScheme;
          if (terrain) {
            world.terrainProvider = {
              tilingScheme: scheme,
              minimumHeight: 20,
              maximumHeight: 20,
              maximumLevel: 0,
              errorEvent: new Event(),
              getLevelMaximumGeometricError: () => 0,
              getTileDataAvailable: () => true,
              loadTileDataAvailability: () => undefined,
              requestTileGeometry: () =>
                Promise.resolve(
                  new SceneGISPlanarHeightmapTerrainData({
                    width: 3,
                    height: 3,
                    buffer: new Float32Array(9).fill(20),
                  }),
                ),
            };
          }
          scene.camera.setView({
            destination: Cartesian3.add(
              target,
              new Cartesian3(0, 0, 30),
              new Cartesian3(),
            ),
            orientation: {
              direction: new Cartesian3(0, 0, -1),
              up: Cartesian3.UNIT_Y,
            },
          });
        }
        scene.camera.frustum.near = 0.1;
        const level = globe ? 14 : 0;
        const source = new SceneGISVectorTileSource({
          url: "https://example.invalid/{z}/{x}/{y}",
          tilingScheme: scheme,
          minimumLevel: level,
          maximumLevel: level,
        });
        spyOn(source, "requestTile").and.resolveTo({
          layers: [
            {
              name: "data",
              version: 2,
              extent: 4096,
              features: [
                {
                  type: 3,
                  id: "area",
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
          ],
        });
        const layer = scene.primitives.add(
          new SceneGISVectorTileLayer({
            scene,
            tilingScheme: scheme,
            sources: { test: source },
            style: {
              version: 8,
              sources: {
                test: {
                  type: "vector",
                  tiles: ["https://example.invalid/{z}/{x}/{y}"],
                  minzoom: level,
                  maxzoom: level,
                },
              },
              layers: [
                {
                  id: "background",
                  type: "background",
                  paint: { "background-color": "#222222" },
                },
                {
                  id: "area",
                  type: kind,
                  source: "test",
                  "source-layer": "data",
                  paint: extrusion
                    ? {
                        "fill-extrusion-color": "#6688aa",
                        "fill-extrusion-opacity": 0.8,
                        "fill-extrusion-height": 10,
                      }
                    : { "fill-color": "#6688aa", "fill-opacity": 0.8 },
                },
              ],
            },
          }),
        );
        const errors = [];
        layer.errorEvent.addEventListener((event) =>
          errors.push(event.error.message),
        );
        await pollToPromise(
          () => {
            scene.renderForSpecs();
            return (
              errors.length > 0 ||
              (layer.tilesLoaded &&
                layer.ready &&
                (globe
                  ? world.tilesLoaded
                  : !terrain || world.getTerrainHeight(target) !== undefined))
            );
          },
          { timeout: 20000 },
        );
        expect(errors).toEqual([]);
        const baseline = pixel();
        const draw = layer._drawOrder.find((batch) => batch._kind === kind);
        const base = draw.commands[0].shaderProgram;
        const vertexArray = draw.commands[0].vertexArray;
        const record = {
          active: true,
          atlasTexture: texture([0, 255, 177, 0]),
          transmittanceTexture: texture(
            globe ? [128, 160, 192, 255] : [51, 51, 51, 255],
          ),
          irradianceTexture: texture(
            globe ? [8, 12, 16, 255] : [128, 128, 128, 255],
          ),
          matrices: Array.from({ length: 3 }, () =>
            Matrix4.fromScale(Cartesian3.ZERO),
          ),
          intervals: Array.from({ length: 3 }, () => new Cartesian2(0, 100000)),
          cascadeCount: 1,
          showCloudShadows: false,
          primaryLightDirection: globe ? Cartesian3.UNIT_X : Cartesian3.UNIT_Z,
          sunDirection: globe ? Cartesian3.UNIT_X : Cartesian3.UNIT_Z,
          cameraRelativePosition: new Cartesian3(
            0,
            0,
            scene.camera.positionWC.z,
          ),
          primaryLightScale: new Cartesian3(1, 1, 1),
          surfaceRadianceScale: 1,
          cloudTop: 4000,
        };
        scene.frameState[key] = record;
        const lit = pixel();
        expect(lit).not.toEqual(baseline);
        const program = draw.commands[0].shaderProgram;
        expect(program).not.toBe(base);
        expect(draw.commands[0].vertexArray).toBe(vertexArray);
        record.showCloudShadows = true;
        expect(pixel()[0]).toBeLessThan(lit[0]);
        record.primaryLightScale = Cartesian3.ZERO;
        const sky = pixel();
        record.showCloudShadows = false;
        expect(pixel()).toEqual(sky);
        expect(sky[0]).toBeGreaterThan(0);
        record.surfaceRadianceScale = 2;
        expect(pixel()[0]).toBeGreaterThan(sky[0]);
        expect(draw.commands[0].shaderProgram).toBe(program);
        expect(scene.pick(new Cartesian2(64, 64))?.id.featureId).toBe("area");
        if (profile === "globe") {
          const sun = Cartesian3.normalize(
            new Cartesian3(1, 1, 0),
            new Cartesian3(),
          );
          scene.light = new DirectionalLight({
            direction: Cartesian3.negate(sun, new Cartesian3()),
          });
          record.primaryLightDirection = sun;
          record.primaryLightScale = new Cartesian3(1, 1, 1);
          record.surfaceRadianceScale = 1;
          const box = scene.primitives.add(
            new Primitive({
              asynchronous: false,
              shadows: ShadowMode.CAST_ONLY,
              geometryInstances: new GeometryInstance({
                geometry: BoxGeometry.fromDimensions({
                  dimensions: new Cartesian3(40, 40, 40),
                  vertexFormat: PerInstanceColorAppearance.FLAT_VERTEX_FORMAT,
                }),
                modelMatrix: Matrix4.multiplyByTranslation(
                  Transforms.eastNorthUpToFixedFrame(target),
                  new Cartesian3(80, 0, 80),
                  new Matrix4(),
                ),
                attributes: {
                  color: ColorGeometryInstanceAttribute.fromColor(Color.WHITE),
                },
              }),
              appearance: new PerInstanceColorAppearance({
                flat: true,
                translucent: false,
              }),
            }),
          );
          await pollToPromise(() => {
            pixel();
            return box.ready;
          });
          const unshadowed = pixel();
          world.shadows = ShadowMode.ENABLED;
          scene.shadowMap.enabled = true;
          scene.shadowMap.softShadows = true;
          const shadowed = pixel();
          expect(shadowed[0])
            .withContext(`${shadowed} vs ${unshadowed}`)
            .toBeLessThan(unshadowed[0]);
          expect(draw.commands[0].castShadows).toBe(false);
          record.primaryLightScale = Cartesian3.ZERO;
          const shadowedSky = pixel();
          scene.shadowMap.enabled = false;
          expect(pixel()).toEqual(shadowedSky);
          scene.primitives.remove(box);
        }
        scene.frameState[key] = undefined;
        scene.highDynamicRange = false;
        pixel();
        scene.highDynamicRange = true;
        expect(pixel()).toEqual(baseline);
        expect(draw.commands[0].shaderProgram).toBe(base);
        scene.frameState[key] = { ...record };
        pixel();
        expect(draw.commands[0].shaderProgram).toBe(program);
        const resources = draw._environmentResources;
        scene.primitives.remove(layer);
        expect(resources._programs.size).toBe(0);
        expect(vertexArray.isDestroyed()).toBe(true);
        expect(textures.every((value) => !value.isDestroyed())).toBe(true);
      } finally {
        scene.frameState[key] = undefined;
        scene.destroyForSpecs();
        for (const value of textures) {
          if (!value.isDestroyed()) {
            value.destroy();
          }
        }
      }
    });
  }
});
