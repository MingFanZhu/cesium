import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

for (const mode of ["globe", "planar"]) {
  test(`default advanced environment is lightweight and controllable (${mode})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120000);
    const errors = [];
    const cloudRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().includes("/CloudCore/")) {
        cloudRequests.push(request.url());
      }
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/Test/Rendering/延迟默认环境验收.html?world=${mode}`);
    await page.waitForFunction(() => {
      const example = window.example;
      return (
        example?.effects.ready &&
        example.scene.world.tilesLoaded &&
        example.model.ready
      );
    });
    const initial = await page.evaluate(() => {
      const { scene, effects } = window.example;
      const renderer = effects._pipeline;
      const resources = renderer._resources;
      const starsBuffers = new Set(
        resources.starsVertexArray?._attributes
          .map((attribute) => attribute.vertexBuffer)
          .filter(Boolean),
      );
      return {
        ready: effects.ready,
        hdr: scene.highDynamicRange,
        lighting: !!(
          scene.frameState._sceneGISGlobeLighting ??
          scene.frameState._sceneGISPlanarLighting
        ),
        atmosphereBytes: [
          "transmittanceTexture",
          "scatteringTexture",
          "irradianceTexture",
        ].reduce((n, key) => n + resources[key].sizeInBytes, 0),
        aerialBytes:
          resources.aerialFramebuffer?.getColorTexture(0).sizeInBytes ?? 0,
        starsBytes: [...starsBuffers].reduce(
          (n, buffer) => n + buffer.sizeInBytes,
          0,
        ),
        skyReflectionBytes:
          (renderer._skyReflections?._source?.sizeInBytes ?? 0) +
          (renderer._skyReflections?.texture?.sizeInBytes ?? 0),
        hasClouds: renderer.hasCloudResources(),
        hasCloudShadows: !!renderer._globeShadowResources,
        hasBloom: !!renderer._bloomResources,
        materialDraws: scene._sceneGISDeferred.drawCount,
        deferredBytes: scene._sceneGISDeferred.byteLength,
        glError: scene.context._gl.getError(),
      };
    });
    expect(initial.ready).toBe(true);
    expect(initial.hdr).toBe(false);
    expect(initial.lighting).toBe(true);
    expect(initial.atmosphereBytes).toBe(8527872);
    expect(initial.hasClouds).toBe(false);
    expect(initial.hasCloudShadows).toBe(false);
    expect(initial.hasBloom).toBe(false);
    expect(initial.glError).toBe(0);
    expect(cloudRequests).toEqual([]);
    const medium = await page.evaluate(() => {
      const { viewer, scene, effects } = window.example;
      const sample = () =>
        Array.from(
          scene.context.readPixels({ x: 640, y: 400, width: 1, height: 1 }),
        );
      viewer.render();
      const enabled = sample();
      effects.showAerialPerspective = false;
      effects.showHeightFog = false;
      viewer.render();
      const disabled = sample();
      effects.showAerialPerspective = true;
      effects.showHeightFog = true;
      viewer.render();
      return { enabled, disabled, restored: sample() };
    });
    expect(medium.enabled).not.toEqual(medium.disabled);
    expect(medium.restored).not.toEqual(medium.disabled);
    await page.screenshot({ path: testInfo.outputPath("default-ldr.png") });
    await page.locator("#clouds").check();
    await page.waitForFunction(() =>
      window.example.effects._pipeline.hasCloudResources(),
    );
    const cloudSky = await page.evaluate(() => {
      const { scene, viewer } = window.example;
      viewer.render();
      return Array.from(
        scene.context.readPixels({ x: 640, y: 650, width: 1, height: 1 }),
      );
    });
    expect(cloudSky[2]).toBeGreaterThan(30);
    expect(cloudRequests).toHaveLength(5);
    await page.screenshot({ path: testInfo.outputPath("clouds-ldr.png") });
    await page.locator("#hdr").check();
    const cloudHdrSky = await page.evaluate(() => {
      const { scene, viewer } = window.example;
      viewer.render();
      return Array.from(
        scene.context.readPixels({ x: 640, y: 650, width: 1, height: 1 }),
      );
    });
    expect(cloudHdrSky[2]).toBeGreaterThan(30);
    await page.screenshot({ path: testInfo.outputPath("clouds-hdr.png") });
    await page.locator("#clouds").uncheck();
    await page.evaluate(() => window.example.viewer.render());
    await page.screenshot({ path: testInfo.outputPath("default-hdr.png") });
    await page.locator("#enabled").uncheck();
    const disabled = await page.evaluate(() => {
      const { viewer, scene } = window.example;
      viewer.render();
      return {
        nativeSky:
          !!scene._environmentState.skyBoxCommand ||
          !!scene._environmentState.skyAtmosphereCommand,
        nativeFog: scene.frameState.fog.renderable,
        pipeline: !!scene._sceneGISEnvironmentEffectsPipeline,
        materialDraws: scene._sceneGISDeferred.drawCount,
        glError: scene.context._gl.getError(),
      };
    });
    expect(disabled.nativeSky).toBe(false);
    expect(disabled.nativeFog).toBe(false);
    expect(disabled.pipeline).toBe(false);
    expect(disabled.materialDraws).toBe(initial.materialDraws);
    expect(disabled.glError).toBe(0);
    await page.locator("#enabled").check();
    await page.waitForFunction(
      () =>
        window.example.effects.ready &&
        !!window.example.scene._sceneGISEnvironmentEffectsPipeline,
    );
    expect(errors).toEqual([]);
    await writeFile(
      testInfo.outputPath("cost.json"),
      JSON.stringify({ initial, cloudSky, cloudHdrSky, disabled }, null, 2),
    );
  });

  test(`custom primary light controls clouds and shadows (${mode})`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(
      `/Test/Rendering/延迟默认环境验收.html?world=${mode}&revision=custom-primary-light`,
    );
    await page.waitForFunction(
      () =>
        window.example?.effects.ready &&
        window.example.model.ready &&
        window.example.scene.world.tilesLoaded,
    );
    await page.locator("#aerial").uncheck();
    await page.locator("#fog").uncheck();
    const original = await page.evaluate(() => {
      window.example.viewer.render();
      const renderer = window.example.effects._pipeline;
      return {
        sun: { ...renderer._sunDirection },
        primary: { ...renderer._primaryLightDirection },
      };
    });
    await page.locator("#primary").selectOption("custom");
    await page.locator("#clouds").check();
    await page.locator("#shadows").check();
    await page.evaluate(() => {
      window.example.effects.cloudCoverage = 0.7;
    });
    await page.waitForFunction(() =>
      window.example.effects._pipeline.hasCloudResources(),
    );
    async function sample(color) {
      await page.locator("#lightColor").fill(color);
      await page.locator("#lightColor").dispatchEvent("input");
      return page.evaluate(async () => {
        const C = await import("/Build/CesiumUnminified/index.js");
        const { scene, viewer, effects, customLight } = window.example;
        viewer.render();
        const renderer = effects._pipeline;
        const target = new C.FramebufferManager({
          pixelDatatype: C.PixelDatatype.FLOAT,
        });
        target.update(scene.context, 1, 1);
        const texture = renderer._resources.cloudFramebuffer.getColorTexture(0);
        const command = scene.context.createViewportQuadCommand(
          "uniform sampler2D u_cloud; void main(){ vec4 sum=vec4(0.0); for(int y=0;y<16;y++){for(int x=0;x<16;x++){sum+=texture(u_cloud,(vec2(x,y)+0.5)/16.0);}} out_FragColor=sum/256.0; }",
          {
            framebuffer: target.framebuffer,
            uniformMap: { u_cloud: () => texture },
          },
        );
        let cloud;
        try {
          command.execute(scene.context);
          cloud = Array.from(
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
        const shadowDirection = scene.shadowMap._lightCamera.directionWC;
        return {
          cloud,
          sun: { ...renderer._sunDirection },
          primary: { ...renderer._primaryLightDirection },
          custom: scene.light === customLight,
          shadowAlignment: C.Cartesian3.dot(
            shadowDirection,
            customLight.direction,
          ),
          cascades: renderer._shadowCascadeCount,
          materialDraws: scene._sceneGISDeferred.drawCount,
          materialBytes: scene._sceneGISDeferred.byteLength,
          glError: scene.context._gl.getError(),
        };
      });
    }
    const red = await sample("#ff8040");
    await page.screenshot({ path: testInfo.outputPath("custom-warm.png") });
    const blue = await sample("#4080ff");
    await page.screenshot({ path: testInfo.outputPath("custom-cool.png") });
    expect(red.cloud[0]).toBeGreaterThan(blue.cloud[0]);
    expect(blue.cloud[2]).toBeGreaterThan(red.cloud[2]);
    for (const result of [red, blue]) {
      expect(result.custom).toBe(true);
      expect(result.shadowAlignment).toBeGreaterThan(0.999999);
      expect(result.cascades).toBeGreaterThan(0);
      expect(result.sun).toEqual(original.sun);
      expect(result.glError).toBe(0);
    }
    expect(blue.materialDraws).toBe(red.materialDraws);
    expect(blue.materialBytes).toBe(red.materialBytes);
    await page.locator("#primary").selectOption("auto");
    const restored = await page.evaluate(() => {
      const { viewer, scene, effects, customLight } = window.example;
      viewer.render();
      return {
        custom: scene.light === customLight,
        primary: { ...effects._pipeline._primaryLightDirection },
      };
    });
    expect(restored.custom).toBe(false);
    expect(restored.primary).toEqual(original.primary);
    expect(errors).toEqual([]);
    await writeFile(
      testInfo.outputPath("primary-light.json"),
      JSON.stringify({ original, red, blue, restored }, null, 2),
    );
  });
}
