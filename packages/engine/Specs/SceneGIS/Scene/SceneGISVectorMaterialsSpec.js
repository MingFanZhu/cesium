import {
  Cartesian2,
  Cartesian3,
  Color,
  DirectionalLight,
  FramebufferManager,
  Globe,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  PixelDatatype,
  Resource,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
  SceneGISPlanarWorld,
  SceneGISScreenSpaceReflections,
  SceneGISScreenSpaceIndirectLighting,
  SceneGISVectorTileLayer,
  SceneGISVectorTileSource,
} from "../../../index.js";
import Coordinates from "../../../Source/SceneGIS/Core/_private/_SceneGISVectorGlobeCoordinates.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISVectorMaterials", function () {
  for (const globeMode of [false, true]) {
    describe(globeMode ? "Globe" : "Planar", function () {
      let scene, world, scheme, bounds, source, layer, fetchImage, image;
      beforeEach(function () {
        scene = undefined;
        scene = createScene({
          canvas: createCanvas(128, 128),
          scene3DOnly: true,
        });
        scene.msaaSamples = 1;
        scene.postProcessStages.fxaa.enabled = false;
        scene.fog.enabled = false;
        scene.shadowMap.size = 512;
        let level = 0;
        if (globeMode) {
          scene.globe = world = new Globe();
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
        scene.environmentEffects.enabled = false;
        world.baseColor = Color.BLUE;
        scene.camera.frustum = new PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio: 1,
          near: 1,
          far: 10000,
        });
        const cx = bounds.minimumX + bounds.width / 2,
          cy = bounds.minimumY + bounds.height / 2;
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
        const direction = globeMode
          ? Cartesian3.negate(
              Cartesian3.normalize(
                Coordinates.position(cx, cy, 0),
                new Cartesian3(),
              ),
              new Cartesian3(),
            )
          : new Cartesian3(0, 0, -1);
        scene.light = new DirectionalLight({ direction });
        source = new SceneGISVectorTileSource({
          url: "/{z}/{x}/{y}",
          tilingScheme: scheme,
          minimumLevel: level,
          maximumLevel: level,
        });
        image = document.createElement("canvas");
        image.width = image.height = 2;
        const context = image.getContext("2d");
        context.fillStyle = "white";
        context.fillRect(0, 0, 2, 2);
        fetchImage = spyOn(Resource.prototype, "fetchImage").and.resolveTo(
          image,
        );
        spyOn(source, "requestTile").and.resolveTo({
          layers: [
            {
              name: "building",
              extent: 4096,
              version: 2,
              features: [
                {
                  id: 42,
                  type: 3,
                  properties: {},
                  geometry: {
                    parts: [
                      new Float64Array([
                        1900, 1900, 2196, 1900, 2196, 2196, 1900, 2196,
                      ]),
                    ],
                    polygonStarts: new Uint32Array([0]),
                  },
                },
              ],
            },
          ],
        });
      });
      afterEach(function () {
        scene?.destroyForSpecs();
      });
      function add(material = true, extra = {}, roof = {}, overlays = []) {
        layer = scene.primitives.add(
          new SceneGISVectorTileLayer({
            scene,
            tilingScheme: scheme,
            sources: { s: source },
            ...extra,
            style: {
              version: 8,
              sources: { s: { type: "vector", tiles: ["/{z}/{x}/{y}"] } },
              materialOrigin: [bounds.minimumX, bounds.minimumY],
              materials: {
                roof: {
                  repeat: [3, 3],
                  baseColorTexture: "/shared.png",
                  baseColor: [0.5, 0.1, 0.02],
                  metallic: 0.6,
                  roughness: 0.35,
                  emissive: [0.02, 0.01, 0],
                  ...roof,
                },
                wall: {
                  repeat: [3, 3],
                  baseColorTexture: "/shared.png",
                  baseColor: [0.02, 0.4, 0.03],
                },
              },
              layers: [
                {
                  id: "buildings",
                  type: "fill-extrusion",
                  source: "s",
                  "source-layer": "building",
                  paint: {
                    "fill-extrusion-height": 40,
                    "fill-extrusion-color": "blue",
                    ...(material
                      ? {
                          "fill-extrusion-roof-material": "roof",
                          "fill-extrusion-wall-material": "wall",
                        }
                      : {}),
                  },
                },
                ...overlays,
              ],
            },
          }),
        );
      }
      async function ready() {
        const errors = [];
        const remove = layer.errorEvent.addEventListener((event) =>
          errors.push(event.error.message),
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
      function sample(texture) {
        const target = new FramebufferManager({
          pixelDatatype: PixelDatatype.FLOAT,
        });
        target.update(scene.context, 1, 1);
        const command = scene.context.createViewportQuadCommand(
          "uniform sampler2D u_texture; void main(){out_FragColor=texelFetch(u_texture,ivec2(64),0);}",
          {
            framebuffer: target.framebuffer,
            uniformMap: { u_texture: () => texture },
          },
        );
        try {
          command.execute(scene.context);
          return Array.from(
            scene.context.readPixels({
              framebuffer: target.framebuffer,
              width: 1,
              height: 1,
            }),
          );
        } finally {
          command.shaderProgram.destroy();
          target.destroy();
        }
      }
      function pixel() {
        scene.renderForSpecs();
        return Array.from(
          scene.context.readPixels({ x: 64, y: 64, width: 1, height: 1 }),
        );
      }
      it("captures PBR fields without replacing style tags, shares textures and retains pick/lifecycle", async function () {
        add();
        await ready();
        const raw = scene._sceneGISDeferred._raw;
        expect(sample(raw.getColorTexture(0))).toEqualEpsilon(
          [0.5, 0.1, 0.02, 0.6],
          0.002,
        );
        expect(sample(raw.getColorTexture(1))[3]).toBeCloseTo(1.35, 2);
        const tag = sample(raw.getColorTexture(2));
        expect(tag[0] + tag[1] + tag[2]).toBeGreaterThan(0);
        expect(tag[3]).toBe(-6);
        expect(sample(raw.getColorTexture(3)).slice(0, 3)).toEqualEpsilon(
          [0.02, 0.01, 0],
          0.001,
        );
        expect(scene.pick(new Cartesian2(64, 64), 1, 1)?.id.featureId).toBe(42);
        const resources = layer._materials.resources,
          textures = resources.textures.slice();
        const commands = layer._drawOrder[0].commands.slice(),
          tasks = layer.statistics.workerTasks;
        pixel();
        pixel();
        expect(layer._materials.resources).toBe(resources);
        expect(layer._drawOrder[0].commands).toEqual(commands);
        expect(layer.statistics.workerTasks).toBe(tasks);
        expect(fetchImage).toHaveBeenCalledTimes(1);
        expect(layer.statistics.materialTextureBytes).toBeGreaterThan(0);
        scene.primitives.remove(layer);
        expect(textures.every((texture) => texture.isDestroyed())).toBe(true);
      });
      it("changes direct light with sun direction and keeps emissive when direct light disappears", async function () {
        add();
        await ready();
        const light = pixel();
        Cartesian3.negate(scene.light.direction, scene.light.direction);
        const dark = pixel();
        expect(light[0]).toBeGreaterThan(dark[0]);
        expect(dark[0]).toBeGreaterThan(0);
        expect(scene.context._gl.getError()).toBe(0);
      });
      it("decodes sRGB color, numeric roughness/metallic and tangent-space normals on the GPU", async function () {
        function solid(color) {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 2;
          const context = canvas.getContext("2d");
          context.fillStyle = color;
          context.fillRect(0, 0, 2, 2);
          return canvas;
        }
        const color = solid("rgb(128,64,32)");
        const normal = solid("rgb(255,128,255)");
        const rm = solid("rgb(255,128,64)");
        fetchImage.and.callFake(function () {
          return Promise.resolve(
            this.url.includes("normal")
              ? normal
              : this.url.includes("rm.png")
                ? rm
                : this.url.includes("color")
                  ? color
                  : image,
          );
        });
        add(
          true,
          {},
          {
            baseColor: [1, 1, 1],
            baseColorTexture: "/color.png",
            normalTexture: "/normal.png",
            normalScale: 0.5,
            metallicRoughnessTexture: "/rm.png",
            roughness: 0.8,
            metallic: 1,
          },
        );
        await ready();
        const raw = scene._sceneGISDeferred._raw;
        expect(sample(raw.getColorTexture(0))).toEqualEpsilon(
          [0.21586, 0.05127, 0.01444, 64 / 255],
          0.002,
        );
        const n = sample(raw.getColorTexture(1));
        expect(Math.abs(n[0])).toBeGreaterThan(0.4);
        expect(n[2]).toBeCloseTo(0.8944, 2);
        expect(n[3]).toBeCloseTo(1 + (0.8 * 128) / 255, 2);
      });
      it("lazily enables materials and restores legacy color through existing style invalidation", async function () {
        add(false);
        await ready();
        expect(layer._materials).toBeUndefined();
        const legacy = pixel(),
          requests = source.requestTile.calls.count();
        layer.setPaintProperty(
          "buildings",
          "fill-extrusion-roof-material",
          "roof",
        );
        await ready();
        expect(pixel()[0]).toBeGreaterThan(legacy[0]);
        const resources = layer._materials.resources;
        layer.setPaintProperty(
          "buildings",
          "fill-extrusion-roof-material",
          null,
        );
        await ready();
        expect(pixel()).toEqual(legacy);
        expect(layer._materials.resources).toBe(resources);
        expect(source.requestTile.calls.count()).toBe(requests);
      });
      it("preserves mixed legacy/PBR depth, style tags and picking when the nearer style changes", async function () {
        add(true, {}, {}, [
          {
            id: "overlay",
            type: "fill-extrusion",
            source: "s",
            "source-layer": "building",
            paint: {
              "fill-extrusion-height": 41,
              "fill-extrusion-color": "lime",
            },
          },
        ]);
        await ready();
        const raw = scene._sceneGISDeferred._raw;
        expect(sample(raw.getColorTexture(0)).slice(0, 3)).toEqualEpsilon(
          [0, 1, 0],
          0.002,
        );
        const legacyTag = sample(raw.getColorTexture(2));
        expect(scene.pick(new Cartesian2(64, 64), 1, 1)?.id.styleLayer).toBe(
          "overlay",
        );
        layer.setPaintProperty(
          "overlay",
          "fill-extrusion-roof-material",
          "roof",
        );
        await ready();
        expect(sample(raw.getColorTexture(0)).slice(0, 3)).toEqualEpsilon(
          [0.5, 0.1, 0.02],
          0.002,
        );
        expect(sample(raw.getColorTexture(2))).toEqual(legacyTag);
        expect(scene.pick(new Cartesian2(64, 64), 1, 1)?.id.styleLayer).toBe(
          "overlay",
        );
      });
      it("uses physical sky, shared reflection/indirect targets and the transparent path", async function () {
        add();
        await ready();
        scene.highDynamicRange = true;
        scene.environmentEffects.enabled = true;
        const ssr = new SceneGISScreenSpaceReflections({
          scene,
          enabled: true,
        });
        const ssil = new SceneGISScreenSpaceIndirectLighting({
          scene,
          enabled: true,
        });
        scene.postProcessStages.ambientOcclusion.enabled = true;
        await pollToPromise(
          () => {
            scene.renderForSpecs();
            const record = globeMode
              ? scene.frameState._sceneGISGlobeLighting
              : scene.frameState._sceneGISPlanarLighting;
            return record?.skyReflections?.texture !== undefined;
          },
          { timeout: 30000 },
        );
        scene.shadowMap.enabled = true;
        pixel();
        const lighting = globeMode
          ? scene.frameState._sceneGISGlobeLighting
          : scene.frameState._sceneGISPlanarLighting;
        expect(lighting.skyReflections.texture).toBeDefined();
        const sky = lighting.skyReflections.texture;
        expect(ssr._state.captureDraws).toBe(0);
        expect(scene.context._gl.getError()).toBe(0);
        layer.opacity = 0.5;
        if (globeMode) {
          world.translucency.enabled = true;
          world.translucency.frontFaceAlpha = 0.5;
        } else {
          world.opacity = 0.5;
        }
        pixel();
        expect(scene.pick(new Cartesian2(64, 64), 1, 1)?.id.featureId).toBe(42);
        expect(scene.context._gl.getError()).toBe(0);
        scene.primitives.remove(layer);
        expect(sky.isDestroyed()).toBe(false);
        ssr.destroy();
        ssil.destroy();
      });
      it("reports an atlas budget failure once and finishes without publishing an invalid batch", async function () {
        add(true, { maximumMaterialTextureBytes: 1 });
        const errors = [];
        layer.errorEvent.addEventListener((event) => errors.push(event));
        await pollToPromise(
          () => {
            scene.renderForSpecs();
            return layer.tilesLoaded && layer.ready;
          },
          { timeout: 20000 },
        );
        scene.renderForSpecs();
        expect(errors.length).toBe(1);
        expect(errors[0].resource).toBe("building-materials");
        expect(layer._materials.ready).toBe(false);
        expect(layer._drawOrder.length).toBe(0);
      });
      it("releases a late image after destroy without starting a Worker or allocating textures", async function () {
        let finish;
        fetchImage.and.returnValue(
          new Promise((resolve) => {
            finish = resolve;
          }),
        );
        add();
        scene.renderForSpecs();
        const owner = layer._materials;
        scene.primitives.remove(layer);
        image.close = jasmine.createSpy("close");
        finish(image);
        await Promise.resolve();
        await Promise.resolve();
        expect(image.close).toHaveBeenCalledTimes(1);
        expect(owner.resources).toBeUndefined();
        expect(owner.packed).toBeUndefined();
      });
      it("discards a late material Worker result after layer destruction", async function () {
        add();
        const enqueue = layer._workers.enqueue.bind(layer._workers);
        let finish;
        spyOn(layer._workers, "enqueue").and.callFake((task, transfer) =>
          task.kind === "materials"
            ? new Promise((resolve) => {
                finish = resolve;
              })
            : enqueue(task, transfer),
        );
        await pollToPromise(
          () => {
            scene.renderForSpecs();
            return finish !== undefined;
          },
          { timeout: 20000 },
        );
        const owner = layer._materials;
        scene.primitives.remove(layer);
        finish({ atlases: [] });
        await Promise.resolve();
        expect(owner.packed).toBeUndefined();
        expect(owner.resources).toBeUndefined();
      });
    });
  }
});
