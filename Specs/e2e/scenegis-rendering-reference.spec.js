import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("reference fixture contains normals required for dynamic lighting", async () => {
  const glb = await readFile(
    new URL("../../Test/Rendering/data/agi-hq.glb", import.meta.url),
  );
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)));
  for (const mesh of gltf.meshes) {
    for (const primitive of mesh.primitives) {
      const normal = gltf.accessors[primitive.attributes.NORMAL];
      expect(normal.type).toBe("VEC3");
      expect(normal.count).toBe(
        gltf.accessors[primitive.attributes.POSITION].count,
      );
      expect(primitive.attributes.TEXCOORD_0).toBeDefined();
    }
  }
});

function expectSameCamera(actual, expected) {
  for (const axis of ["position", "direction", "up"]) {
    actual[axis].forEach((value, i) => {
      expect(value).toBeCloseTo(expected[axis][i], 9);
    });
  }
  for (const property of ["fov", "near", "far"]) {
    expect(actual[property]).toBe(expected[property]);
  }
}

for (const world of ["planar", "globe"]) {
  test(`${world}: night lights, emission and HDR bloom remain independent`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/夜景光照.html?world=${world}`);
    await page.waitForFunction(() => window.example?.state.ready);
    async function sample() {
      return page.evaluate(async (mode) => {
        const C = await import("/Build/CesiumUnminified/index.js");
        const scene = window.example.viewer.scene;
        const frame =
          mode === "planar"
            ? C.Matrix4.IDENTITY
            : C.Transforms.eastNorthUpToFixedFrame(
                C.Cartesian3.fromDegrees(-75.596, 40.038),
              );
        return new Promise((resolve) => {
          const remove = scene.postRender.addEventListener(() => {
            remove();
            resolve(
              [
                [9, -9, 0],
                [0, 14.85, 7],
              ].map((position) => {
                const p = C.SceneTransforms.worldToWindowCoordinates(
                  scene,
                  C.Matrix4.multiplyByPoint(
                    frame,
                    C.Cartesian3.fromArray(position),
                    new C.Cartesian3(),
                  ),
                );
                return Array.from(
                  scene.context.readPixels({
                    x: Math.floor(p.x),
                    y: scene.drawingBufferHeight - 1 - Math.floor(p.y),
                    width: 1,
                    height: 1,
                  }),
                );
              }),
            );
          });
        });
      }, world);
    }
    await page.getByLabel("泛光", { exact: true }).uncheck();
    const lit = await sample();
    await page.getByLabel("局部照明", { exact: true }).uncheck();
    const dark = await sample();
    expect(lit[0][2]).toBeGreaterThan(dark[0][2] + 20);
    expect(dark[1][0]).toBeGreaterThan(80);
    await page.getByLabel("自发光", { exact: true }).uncheck();
    const noEmission = await sample();
    expect(dark[1][0]).toBeGreaterThan(noEmission[1][0] + 40);
    await page.getByLabel("局部照明", { exact: true }).check();
    await page.getByLabel("自发光", { exact: true }).check();
    await page.getByLabel("泛光", { exact: true }).check();
    await page.getByLabel("屏幕空间反射", { exact: true }).check();
    await page.waitForFunction(() => window.example.ssr._ready);
    await sample();
    await expect(page.locator("#error")).toBeEmpty();
    expect(
      await page.evaluate(() => {
        const example = window.example;
        const lights = example.lights;
        example.destroy();
        return (
          lights.isDestroyed() &&
          example.ssr.isDestroyed() &&
          example.models.every((m) => m.isDestroyed())
        );
      }),
    ).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`${world}: reference night lights illuminate the scan and keep A/B reversible`, async ({
    page,
  }) => {
    await page.goto(`/Test/Rendering/实景对比.html?world=${world}`);
    await page.waitForFunction(() => window.example?.state.ready);
    await page.getByLabel("固定时间", { exact: true }).selectOption("夜间基线");
    await page.getByLabel("固定视角", { exact: true }).selectOption("建筑近景");
    await page.getByLabel("对比状态", { exact: true }).selectOption("实验 B");
    await page.getByLabel("夜景局部灯光", { exact: true }).check();
    await page.waitForFunction(() => window.example.lights._state?.count === 7);
    await expect(page.locator("#error")).toBeEmpty();
    await page.getByLabel("对比状态", { exact: true }).selectOption("基线 A");
    await page.waitForFunction(() => window.example.lights._state.count === 0);
    expect(await page.evaluate(() => window.example.trial.localLights)).toBe(
      true,
    );
    await page.evaluate(() => window.example.destroy());
  });
}

for (const world of ["planar", "globe"]) {
  test(`${world}: geometric shadows preserve environment reflections and emission`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/阴影光照.html?world=${world}`);
    await page.waitForFunction(() => window.example?.state.ready);
    async function pixels() {
      return page.evaluate(async (mode) => {
        const C = await import("/Build/CesiumUnminified/index.js");
        const scene = window.example.viewer.scene;
        const frame =
          mode === "planar"
            ? C.Matrix4.IDENTITY
            : C.Transforms.eastNorthUpToFixedFrame(
                C.Cartesian3.fromDegrees(-75.596, 40.038),
              );
        return new Promise((resolve) => {
          const remove = scene.postRender.addEventListener(() => {
            remove();
            resolve(
              [-15, 0, 15].map((x) => {
                const p = C.SceneTransforms.worldToWindowCoordinates(
                  scene,
                  C.Matrix4.multiplyByPoint(
                    frame,
                    new C.Cartesian3(x, 0, 0),
                    new C.Cartesian3(),
                  ),
                );
                return Array.from(
                  scene.context.readPixels({
                    x: Math.floor(p.x),
                    y: scene.drawingBufferHeight - 1 - Math.floor(p.y),
                    width: 1,
                    height: 1,
                  }),
                );
              }),
            );
          });
        });
      }, world);
    }
    await page.getByLabel("照明分量", { exact: true }).selectOption("仅环境光");
    const shaded = await pixels();
    await page.getByLabel("几何阴影", { exact: true }).uncheck();
    expect(await pixels()).toEqual(shaded);
    for (const pixel of shaded) {
      expect(Math.max(...pixel.slice(0, 3))).toBeGreaterThan(20);
    }
    await page.getByLabel("照明分量", { exact: true }).selectOption("仅直接光");
    const lit = await pixels();
    await page.getByLabel("几何阴影", { exact: true }).check();
    const shadow = await pixels();
    expect(lit[0][0]).toBeGreaterThan(shadow[0][0] + 30);
    expect(shadow[2]).toEqual(lit[2]);
    await page.getByLabel("照明分量", { exact: true }).selectOption("完整光照");
    await page.getByLabel("HDR", { exact: true }).uncheck();
    await pixels();
    await expect(page.locator("#error")).toBeEmpty();
    expect(
      await page.evaluate(() => {
        const sample = window.example;
        const atlas = sample.viewer.shadowMap._shadowMapTexture;
        sample.destroy();
        return (
          atlas.isDestroyed() &&
          sample.ibl.isDestroyed() &&
          sample.models.every((model) => model.isDestroyed())
        );
      }),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const world of ["planar", "globe"]) {
  test(`${world}: shadow detail controls and atlas lifecycle`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.goto(`/Test/Rendering/阴影精细度.html?world=${world}`);
    await page.waitForFunction(() => window.example?.state.ready);
    expect(await page.evaluate(() => window.example.models.length)).toBe(14);
    const canvas = await page.locator("canvas").boundingBox();
    await page.mouse.move(
      canvas.x + canvas.width * 0.5,
      canvas.y + canvas.height * 0.65,
    );
    for (const delta of [120, -120]) {
      const before = await page.evaluate(() =>
        JSON.stringify(window.example.viewer.camera.positionWC),
      );
      await page.mouse.wheel(0, delta);
      await page.waitForFunction((previous) => {
        const viewer = window.example.viewer;
        return (
          !viewer.useDefaultRenderLoop ||
          JSON.stringify(viewer.camera.positionWC) !== previous
        );
      }, before);
      expect(
        await page.evaluate(() => window.example.viewer.useDefaultRenderLoop),
      ).toBe(true);
      await expect(page.locator("#error")).toBeEmpty();
    }
    await page.getByLabel("软阴影", { exact: true }).uncheck();
    await page.getByLabel("阴影分辨率", { exact: true }).selectOption("512");
    await page.getByLabel("视角", { exact: true }).selectOption("远近级联");
    await page.getByLabel("显示级联颜色", { exact: true }).check();
    await page.waitForFunction(() => {
      const shadow = window.example.viewer.shadowMap;
      return shadow._shadowMapTexture.width === 1024;
    });
    await page.getByLabel("软阴影", { exact: true }).check();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const remove =
            window.example.viewer.scene.postRender.addEventListener(() => {
              remove();
              resolve();
            });
        }),
    );
    await expect(page.locator("#error")).toBeEmpty();
    const released = await page.evaluate(() => {
      const sample = window.example;
      const atlas = sample.viewer.shadowMap._shadowMapTexture;
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      );
      const retained = !sample.viewer.isDestroyed();
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: false }),
      );
      sample.destroy();
      return {
        retained,
        viewer: sample.viewer.isDestroyed(),
        atlas: atlas.isDestroyed(),
        models: sample.models.every((model) => model.isDestroyed()),
      };
    });
    expect(released).toEqual({
      retained: true,
      viewer: true,
      atlas: true,
      models: true,
    });
    expect(errors).toEqual([]);
  });
}

for (const world of ["planar", "globe"]) {
  test(`${world}: public scan, repeatable comparison and lifecycle`, async ({
    page,
  }, info) => {
    const errors = [];
    const external = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        url.hostname === "localhost" ||
        url.protocol === "data:" ||
        url.protocol === "blob:"
      ) {
        return route.continue();
      }
      external.push(url.href);
      return route.abort();
    });
    await page.goto(`/Test/Rendering/实景对比.html?world=${world}`);
    await page.waitForFunction(() => window.example?.state.ready);
    const scene = await page.evaluate(() => {
      const { tileset, models, viewer } = window.example;
      return {
        content: tileset.root.contentReady,
        triangles: tileset.root.content.trianglesLength,
        models: models.length,
        animate: viewer.clock.shouldAnimate,
      };
    });
    expect(scene).toEqual({
      content: true,
      triangles: 139461,
      models: 2,
      animate: false,
    });
    const control = (name) => page.getByLabel(name, { exact: true });
    await control("固定视角").selectOption({ label: "建筑近景" });
    await control("固定时间").selectOption({ label: "低角度阳光" });
    const initial = await page.evaluate(() => window.example.state.snapshot());
    await control("对比状态").selectOption({ label: "实验 B" });
    await control("几何阴影").uncheck();
    await control("环境光遮蔽").uncheck();
    await control("屏幕空间反射").check();
    await control("原始贴图（不重打光）").check();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const remove =
            window.example.viewer.scene.postRender.addEventListener(() => {
              remove();
              resolve();
            });
        }),
    );
    const trial = await page.evaluate(() => {
      const { state, viewer, ao, ssr, tileset } = window.example;
      return {
        snapshot: state.snapshot(),
        shadows: viewer.shadows,
        ao: ao.enabled,
        ssr: ssr.enabled,
        original: tileset.customShader !== undefined,
      };
    });
    expect(trial).toMatchObject({
      shadows: false,
      ao: false,
      ssr: true,
      original: true,
    });
    expectSameCamera(trial.snapshot.camera, initial.camera);
    expect(trial.snapshot.time).toEqual(initial.time);

    await control("对比状态").selectOption({ label: "基线 A" });
    expect(
      await page.evaluate(() => {
        const { viewer, ao, ssr, tileset } = window.example;
        return [viewer.shadows, ao.enabled, ssr.enabled, tileset.customShader];
      }),
    ).toEqual([true, true, false, undefined]);
    await control("对比状态").selectOption({ label: "实验 B" });
    await expect(control("几何阴影")).not.toBeChecked();
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "导出当前配置", exact: true })
      .click();
    const download = await downloaded;
    const config = JSON.parse(await readFile(await download.path(), "utf8"));
    expectSameCamera(config.camera, trial.snapshot.camera);
    expect({ ...config, camera: undefined }).toEqual({
      ...trial.snapshot,
      camera: undefined,
    });
    expect(config.world).toBe(world);

    await page
      .getByRole("button", { name: "恢复基线参数", exact: true })
      .click();
    await expect(control("几何阴影")).toBeChecked();
    await control("显示 GLB 参照区").uncheck();
    expect(
      await page.evaluate(() => window.example.models.every((m) => !m.show)),
    ).toBe(true);
    await control("显示 GLB 参照区").check();
    await control("固定时间").selectOption({ label: "午后" });
    await control("对比状态").selectOption({ label: "基线 A" });
    await page.screenshot({ path: info.outputPath(`${world}-campus.png`) });
    await expect(page.locator("#error")).toBeEmpty();

    const lifecycle = await page.evaluate(() => {
      const sample = window.example;
      const host = sample.viewer.scene.controllerHost;
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      );
      const cached = !sample.viewer.isDestroyed();
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: false }),
      );
      sample.destroy();
      return {
        cached,
        destroyed: sample.viewer.isDestroyed(),
        tileset: sample.tileset.isDestroyed(),
        models: sample.models.every((model) => model.isDestroyed()),
        controllers: host.controllerCount,
        gui: document.querySelectorAll(".lil-gui").length,
      };
    });
    expect(lifecycle).toEqual({
      cached: true,
      destroyed: true,
      tileset: true,
      models: true,
      controllers: 0,
      gui: 0,
    });
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
}
