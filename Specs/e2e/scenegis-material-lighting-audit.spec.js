import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import { test, expect } from "@playwright/test";

const build = process.env.SCENEGIS_AUDIT_BUILD ?? "CesiumUnminified";

async function save(testInfo, name, data) {
  const path = testInfo.outputPath(name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

async function createFixture(page, world) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/Test/material-audit-fixture.html", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><link rel="stylesheet" href="/Build/${build}/Widgets/widgets.css"><style>html,body,#map{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="map"></div><script>window.CESIUM_BASE_URL="/Build/${build}/";</script></body></html>`,
    }),
  );
  await page.goto("/Test/material-audit-fixture.html");
  await page.evaluate(
    async ({ world, build }) => {
      const C = await import(`/Build/${build}/index.js`);
      const planar = world === "planar";
      const viewer = new C.Viewer("map", {
        ...(planar
          ? {
              planarWorld: {
                crs: "LOCAL",
                extent: {
                  minimumX: -128,
                  minimumY: -128,
                  maximumX: 128,
                  maximumY: 128,
                },
                maximumLevel: 0,
              },
            }
          : { baseLayer: false }),
        baseLayerPicker: false,
        geocoder: false,
        animation: false,
        timeline: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
        skyBox: false,
        skyAtmosphere: false,
      });
      const scene = viewer.scene;
      scene.environmentEffects.enabled = false;
      scene.fog.enabled = false;
      scene.highDynamicRange = false;
      scene.msaaSamples = 1;
      scene.postProcessStages.fxaa.enabled = false;
      scene.postProcessStages.exposure = 1;
      viewer.clock.shouldAnimate = false;
      viewer.clock.currentTime = C.JulianDate.fromIso8601(
        "2026-03-20T12:00:00Z",
      );
      const surface = planar ? viewer.planarWorld : scene.globe;
      if (!planar) {
        surface.enableLighting = false;
        surface.showGroundAtmosphere = false;
      }
      const frame = planar
        ? C.Matrix4.IDENTITY
        : C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(0, 0));
      const point = (x, y, z) =>
        C.Matrix4.multiplyByPoint(
          frame,
          new C.Cartesian3(x, y, z),
          new C.Cartesian3(),
        );
      const vector = (x, y, z) =>
        C.Matrix4.multiplyByPointAsVector(
          frame,
          new C.Cartesian3(x, y, z),
          new C.Cartesian3(),
        );
      const camera = (height) =>
        scene.camera.setView({
          destination: point(0, 0, height),
          orientation: { direction: vector(0, 0, -1), up: vector(0, 1, 0) },
        });
      camera(100);
      scene.camera.frustum.near = 0.1;
      scene.camera.frustum.far = 100000;
      const layers = planar ? surface.imageryLayers : scene.imageryLayers;
      async function addImage(rgb, alpha = 1) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 2;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = `rgb(${rgb.join(",")})`;
        ctx.fillRect(0, 0, 2, 2);
        const provider = planar
          ? {
              tilingScheme: surface.tilingScheme,
              minimumLevel: 0,
              maximumLevel: 0,
              tileWidth: 2,
              tileHeight: 2,
              hasAlphaChannel: true,
              errorEvent: new C.Event(),
              requestImage: () => Promise.resolve(canvas),
            }
          : await C.SingleTileImageryProvider.fromUrl(canvas.toDataURL(), {
              rectangle: C.Rectangle.fromDegrees(-0.01, -0.01, 0.01, 0.01),
            });
        const layer = layers.addImageryProvider(provider);
        layer.alpha = alpha;
        return layer;
      }
      function capture(waitForTiles = false) {
        return new Promise((resolve, reject) => {
          const removeError = scene.renderError.addEventListener(
            (_scene, error) => {
              remove();
              removeError();
              reject(error);
            },
          );
          const remove = scene.postRender.addEventListener(() => {
            if (waitForTiles && !surface.tilesLoaded) {
              return;
            }
            remove();
            removeError();
            const c = scene.context;
            const pixel = Array.from(
              c.readPixels({
                x: Math.floor(c.drawingBufferWidth / 2),
                y: Math.floor(c.drawingBufferHeight / 2),
                width: 1,
                height: 1,
              }),
            );
            resolve({ pixel, png: scene.canvas.toDataURL() });
          });
          scene.requestRender();
        });
      }
      await addImage([64, 128, 192]);
      window.audit = {
        C,
        viewer,
        scene,
        surface,
        layers,
        addImage,
        capture,
        camera,
        point,
        vector,
        frame,
      };
    },
    { world, build },
  );
  return errors;
}

test("imagery Globe reference: combined filters, batch gamma and HDR/LDR", async ({
  page,
}, testInfo) => {
  const results = {};
  for (const world of ["globe", "planar"]) {
    const errors = await createFixture(page, world);
    await page.evaluate(() => window.audit.capture(true));
    await page.evaluate(async () => {
      const a = window.audit;
      a.top = await a.addImage([192, 128, 64], 0.35);
    });
    await page.evaluate(() => window.audit.capture(true));
    results[world] = await page.evaluate(async () => {
      const a = window.audit;
      const samples = {};
      for (const hdr of [false, true]) {
        a.scene.highDynamicRange = hdr;
        for (const gamma of [1, 2]) {
          Object.assign(a.top, {
            gamma,
            brightness: 0.6,
            contrast: 0.8,
            hue: 0.7,
            saturation: 0.4,
          });
          samples[`${hdr}-combined-${gamma}`] = await a.capture();
        }
        // Masking the top texel leaves its batch-level gamma effect on the base.
        a.top.colorToAlpha = a.C.Color.fromBytes(192, 128, 64);
        a.top.colorToAlphaThreshold = 0.01;
        samples[`${hdr}-masked`] = await a.capture();
        a.top.alpha = 0;
        samples[`${hdr}-zero-alpha`] = await a.capture();
        a.top.alpha = 0.35;
        a.top.show = false;
        samples[`${hdr}-hidden`] = await a.capture();
        a.top.show = true;
        a.top.colorToAlpha = undefined;
        await a.capture(true);
      }
      return samples;
    });
    for (const [name, sample] of Object.entries(results[world])) {
      await save(
        testInfo,
        `${world}-${name}.png`,
        Buffer.from(sample.png.split(",")[1], "base64"),
      );
      delete sample.png;
    }
    if (world === "planar") {
      const performanceResult = await page.evaluate(() => {
        const a = window.audit;
        a.viewer.useDefaultRenderLoop = false;
        const surface = a.surface._surface;
        const command = surface._renderCommands[0];
        const shader = command.shaderProgram;
        const before = { ...surface._imagery._debug };
        const shaderCount = surface._shaderPrograms.size;
        const durations = [];
        // Measure completed warm frames; all variants above have already drawn.
        for (let i = 0; i < 60; i++) {
          a.top.gamma = i % 2 === 0 ? 1 : 2;
          const start = performance.now();
          a.viewer.render();
          a.scene.context._gl.finish();
          durations.push(performance.now() - start);
        }
        durations.sort((x, y) => x - y);
        return {
          frames: durations.length,
          medianMs: durations[30],
          p95Ms: durations[57],
          before,
          after: { ...surface._imagery._debug },
          sameCommand: command === surface._renderCommands[0],
          sameShader: shader === command.shaderProgram,
          sameShaderCount: shaderCount === surface._shaderPrograms.size,
          commands: surface._renderCommands.length,
        };
      });
      expect(performanceResult.after).toEqual(performanceResult.before);
      expect(performanceResult.sameCommand).toBe(true);
      expect(performanceResult.sameShader).toBe(true);
      expect(performanceResult.sameShaderCount).toBe(true);
      await save(
        testInfo,
        "warm-frames.json",
        JSON.stringify(performanceResult, null, 2),
      );
    }
    await page.evaluate(() => window.audit.viewer.destroy());
    expect(errors).toEqual([]);
  }
  for (const name of Object.keys(results.globe)) {
    for (let i = 0; i < 4; i++) {
      expect(
        Math.abs(results.globe[name].pixel[i] - results.planar[name].pixel[i]),
        name,
      ).toBeLessThanOrEqual(2);
    }
  }
  await save(testInfo, "paired-pixels.json", JSON.stringify(results, null, 2));
});

for (const world of ["globe", "planar"]) {
  test(`material audit ${world}: imagery and native PBR controls`, async ({
    page,
  }, testInfo) => {
    const errors = await createFixture(page, world);
    const raw = await page.evaluate(() => window.audit.capture(true));
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(raw.pixel[i] - [64, 128, 192][i])).toBeLessThanOrEqual(2);
    }
    await save(
      testInfo,
      "imagery-original.png",
      Buffer.from(raw.png.split(",")[1], "base64"),
    );
    const filters = {};
    for (const [label, name, value, expected] of [
      ["brightness", "brightness", 0.5, [47, 93, 140]],
      ["contrast", "contrast", 0.5, [141, 160, 189]],
      ["gamma", "gamma", 2, [186, 218, 239]],
      ["gamma-near-identity", "gamma", 1.001, [136, 186, 224]],
      ["saturation", "saturation", 0, [124, 124, 124]],
    ]) {
      filters[label] = await page.evaluate(
        async ({ name, value }) => {
          const a = window.audit;
          const layer = a.layers.get(0);
          layer[name] = value;
          const shot = await a.capture();
          layer[name] = 1;
          return shot.pixel;
        },
        { name, value },
      );
      for (let i = 0; i < 3; i++) {
        expect(Math.abs(filters[label][i] - expected[i])).toBeLessThanOrEqual(
          2,
        );
      }
    }
    await page.evaluate(async () => {
      const a = window.audit;
      a.layers.removeAll();
      await a.addImage([255, 0, 0]);
      await a.addImage([0, 0, 255], 0.5);
    });
    const blended = await page.evaluate(() => window.audit.capture(true));
    await save(
      testInfo,
      "imagery-alpha.png",
      Buffer.from(blended.png.split(",")[1], "base64"),
    );
    const halfLinear = Math.round(Math.pow(0.5, 1 / 2.2) * 255);
    expect(blended.pixel).toEqual([halfLinear, 0, halfLinear, 255]);
    const material = await page.evaluate(async () => {
      const a = window.audit;
      const { C, scene } = a;
      a.surface.show = false;
      a.camera(5);
      scene.backgroundColor = C.Color.BLACK;
      scene.light = new C.DirectionalLight({
        direction: C.Cartesian3.normalize(
          a.vector(0.25, 0, -1),
          new C.Cartesian3(),
        ),
        color: C.Color.WHITE,
        intensity: 1,
      });
      const url = new URL(
        "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
        location.href,
      );
      const gltf = await (await fetch(url)).json();
      for (const buffer of gltf.buffers) {
        buffer.uri = new URL(buffer.uri, url).href;
      }
      gltf.materials[0].pbrMetallicRoughness = {
        baseColorFactor: [0.18, 0.18, 0.18, 1],
        roughnessFactor: 1,
        metallicFactor: 0,
      };
      const model = scene.primitives.add(
        await C.Model.fromGltfAsync({
          url: `data:application/json,${encodeURIComponent(JSON.stringify(gltf))}`,
          modelMatrix: a.frame,
          imageBasedLighting: new C.ImageBasedLighting({
            imageBasedLightingFactor: C.Cartesian2.ZERO,
          }),
        }),
      );
      model.environmentMapManager.enabled = false;
      a.model = model;
      a.ibl = model.imageBasedLighting;
      return gltf.materials[0].pbrMetallicRoughness;
    });
    await page.waitForFunction(() => window.audit.model.ready);
    const pbr = {};
    for (const [name, diffuse, roughness, specular] of [
      ["gray-matte", 0.18, 1, 0.04],
      ["white-matte", 1, 1, 0.04],
      ["gray-smooth", 0.18, 0.2, 0.04],
      ["metal-smooth", 0, 0.2, 0.8],
    ]) {
      await page.evaluate(
        ({ diffuse, roughness, specular }) => {
          const a = window.audit;
          a.model.customShader = undefined;
          a.custom?.destroy();
          a.custom = new a.C.CustomShader({
            fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse=vec3(${diffuse.toFixed(4)}); material.roughness=${roughness.toFixed(4)}; material.specular=vec3(${specular.toFixed(4)}); }`,
          });
          a.model.customShader = a.custom;
        },
        { diffuse, roughness, specular },
      );
      const shot = await page.evaluate(() => window.audit.capture());
      pbr[name] = shot.pixel;
      await save(
        testInfo,
        `${name}.png`,
        Buffer.from(shot.png.split(",")[1], "base64"),
      );
    }
    expect(pbr["white-matte"][0]).toBeGreaterThan(pbr["gray-matte"][0]);
    expect(pbr["gray-smooth"]).not.toEqual(pbr["gray-matte"]);
    const destroyed = await page.evaluate(() => {
      const a = window.audit;
      a.model.customShader = undefined;
      a.custom.destroy();
      a.viewer.destroy();
      a.ibl.destroy();
      return a.viewer.isDestroyed();
    });
    expect(destroyed).toBe(true);
    expect(errors).toEqual([]);
    await save(
      testInfo,
      "measurements.json",
      JSON.stringify(
        {
          world,
          raw: raw.pixel,
          filters,
          blended: blended.pixel,
          material,
          pbr,
        },
        null,
        2,
      ),
    );
  });

  test(`material audit ${world}: matched Bistro lighting and material channels`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/PBR综合验收.html?world=${world}`);
    await page.waitForFunction(() => window.example?.state.ready);
    await page.evaluate(() => {
      const e = window.example;
      e.autoExposure.enabled = false;
      e.colorGrading.enabled = false;
      Object.assign(e.rendering, {
        ao: false,
        ssr: false,
        ssil: false,
        specularAA: false,
        antialiasing: "无 AA",
      });
      Object.assign(e.atmosphere, {
        hour: 12,
        exposure: 1,
        showHeightFog: false,
        showAerialPerspective: false,
        surfaceRadianceScale: 1.2,
        backgroundRadianceScale: 2.5,
      });
      e.state.setTime();
      e.state.applyAtmosphere();
      e.lighting.diffuse = 1;
      e.lighting.specular = 1;
      e.state.applyLighting();
      e.state.resetView();
      document.body.classList.add("panels-hidden");
      window.auditFrame = () =>
        new Promise((resolve, reject) => {
          const removeError = e.viewer.scene.renderError.addEventListener(
            (_scene, error) => {
              remove();
              removeError();
              reject(error);
            },
          );
          const remove = e.viewer.scene.postRender.addEventListener(() => {
            remove();
            removeError();
            resolve(e.viewer.scene.canvas.toDataURL());
          });
          e.viewer.scene.requestRender();
        });
    });
    const shots = {};
    const snapshots = {};
    for (const mode of ["physical", "fixed", "roughness", "metalness"]) {
      await page.evaluate(async (mode) => {
        const C = await import("/Build/CesiumUnminified/index.js");
        const e = window.example;
        e.atmosphere.mode = mode === "physical" ? "物理大气" : "固定 IBL";
        e.state.applyAtmosphere();
        e.viewer.scene.highDynamicRange = !["roughness", "metalness"].includes(
          mode,
        );
        if (mode === "roughness" || mode === "metalness") {
          const channel = mode === "roughness" ? "g" : "b";
          e.models.forEach((m) => {
            m.customShader = undefined;
          });
          window.auditShader?.destroy();
          window.auditShader = new C.CustomShader({
            lightingModel: C.LightingModel.UNLIT,
            fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
              float value = 1.0;
              #ifdef HAS_METALLIC_ROUGHNESS_TEXTURE
              vec2 uv = TEXCOORD_METALLIC_ROUGHNESS;
              #ifdef HAS_METALLIC_ROUGHNESS_TEXTURE_TRANSFORM
              uv = czm_computeTextureTransform(uv, u_metallicRoughnessTextureTransform);
              #endif
              value = texture(u_metallicRoughnessTexture, uv).${channel};
              #endif
              #ifdef ${mode === "roughness" ? "HAS_ROUGHNESS_FACTOR" : "HAS_METALLIC_FACTOR"}
              value *= ${mode === "roughness" ? "u_roughnessFactor" : "u_metallicFactor"};
              #endif
              material.diffuse = vec3(value); material.emissive = vec3(0.0);
            }`,
          });
          e.models.forEach((m) => {
            m.customShader = window.auditShader;
          });
        }
      }, mode);
      if (mode === "fixed") {
        await page.waitForFunction(
          () => window.example.ibl.useSpecularEnvironmentMaps,
        );
      }
      const png = await page.evaluate(() => window.auditFrame());
      shots[mode] = await page.evaluate(async (png) => {
        const image = new Image();
        image.src = png;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        return Array.from(
          ctx.getImageData(
            Math.floor(image.width * 0.06),
            Math.floor(image.height * 0.16),
            1,
            1,
          ).data,
        );
      }, png);
      snapshots[mode] = await page.evaluate(() =>
        window.example.state.snapshot(),
      );
      await save(
        testInfo,
        `${mode}.png`,
        Buffer.from(png.split(",")[1], "base64"),
      );
    }
    const expectedRoughness = Math.round(Math.pow(189 / 255, 1 / 2.2) * 255);
    expect(
      Math.abs(shots.roughness[0] - expectedRoughness),
    ).toBeLessThanOrEqual(2);
    expect(shots.metalness[0]).toBe(0);
    await page.evaluate(() => {
      window.example.models.forEach((m) => {
        m.customShader = undefined;
      });
      window.auditShader.destroy();
      window.example.destroy();
    });
    expect(errors).toEqual([]);
    await save(
      testInfo,
      "measurements.json",
      JSON.stringify({ world, shots, snapshots }, null, 2),
    );
  });
}
