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
