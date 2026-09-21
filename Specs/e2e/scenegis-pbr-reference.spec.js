import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

const dataRoot = fileURLToPath(
  new URL("../../Test/Rendering/pbr-data/", import.meta.url),
);
async function json(file) {
  const data = await readFile(file);
  return JSON.parse(
    file.endsWith(".glb")
      ? data.subarray(20, 20 + data.readUInt32LE(12))
      : data,
  );
}

test("pinned PBR fixtures retain geometry, materials, normals and explicit glass gaps", async () => {
  const manifest = await json(join(dataRoot, "manifest.json"));
  const prepared = await json(join(dataRoot, "local/prepared.json"));
  expect(prepared.id).toBe(manifest.id);
  expect(prepared.sharp.sharp).toBe(manifest.delivery.sharp);
  for (const asset of manifest.intel.archives) {
    const original = join(dataRoot, "local", asset.directory, asset.gltf);
    const delivery = join(dataRoot, "local/2k", asset.directory, asset.gltf);
    expect(await readFile(delivery, "utf8")).toBe(
      await readFile(original, "utf8"),
    );
    const gltf = await json(delivery);
    let triangles = 0;
    for (const mesh of gltf.meshes) {
      for (const primitive of mesh.primitives) {
        const normal = gltf.accessors[primitive.attributes.NORMAL];
        expect(normal.type).toBe("VEC3");
        expect(normal.count).toBe(
          gltf.accessors[primitive.attributes.POSITION].count,
        );
        expect(primitive.attributes.TEXCOORD_0).toBeDefined();
        expect(
          gltf.materials[primitive.material].pbrMetallicRoughness,
        ).toBeDefined();
        triangles += gltf.accessors[primitive.indices].count / 3;
      }
    }
    expect(triangles).toBe(asset.triangles);
    for (const resource of [...gltf.images, ...gltf.buffers]) {
      expect(resource.uri).not.toMatch(/^(https?:|data:|\/)|\.\./);
      const bytes = await stat(join(dirname(delivery), resource.uri));
      expect(bytes.size).toBeGreaterThan(0);
      if (resource.byteLength) {
        expect(bytes.size).toBe(resource.byteLength);
      }
    }
    for (const image of gltf.images) {
      const png = await readFile(join(dirname(delivery), image.uri));
      expect(png.readUInt32BE(16)).toBe(2048);
      expect(png.readUInt32BE(20)).toBe(2048);
    }
    expect(
      await readFile(join(dirname(delivery), "credits_license.txt"), "utf8"),
    ).toContain("Sponza 2022");
  }
  for (const file of manifest.khronos.files) {
    expect((await stat(join(dataRoot, "local/khronos", file.path))).size).toBe(
      file.bytes,
    );
  }
  for (const [name, file] of [
    ["FlightHelmet", "glTF/FlightHelmet.gltf"],
    [
      "GlassHurricaneCandleHolder",
      "glTF-Binary/GlassHurricaneCandleHolder.glb",
    ],
  ]) {
    const gltf = await json(join(dataRoot, "local/khronos/Models", name, file));
    expect(gltf.extensionsUsed).toEqual(manifest.unsupported[name]);
  }
});

function expectCamera(actual, expected) {
  for (const axis of ["position", "direction", "up"]) {
    actual[axis].forEach((value, i) =>
      expect(value).toBeCloseTo(expected[axis][i], 8),
    );
  }
  for (const property of ["near", "far", "fov"]) {
    expect(actual[property]).toBe(expected[property]);
  }
}
async function waitForConsumedInput(page) {
  await page.waitForFunction(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const viewer = window.example.viewer;
    const controller =
      viewer.planarCameraController ?? viewer.scene.screenSpaceCameraController;
    const input = controller._aggregator;
    return (
      !input.anyButtonDown &&
      [
        C.CameraEventType.LEFT_DRAG,
        C.CameraEventType.MIDDLE_DRAG,
        C.CameraEventType.WHEEL,
      ].every((type) => !input.isMoving(type))
    );
  });
}
for (const world of ["planar", "globe"]) {
  test(`${world}: composite PBR, fixed poses, reversible effects, export and destruction`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/PBR综合验收.html?world=${world}`);
    await page.waitForFunction(() => window.example?.state.ready);
    await expect(page.locator("#error")).toBeEmpty();
    const before = await page.evaluate(() => window.example.state.snapshot());
    // The initial overview must be compatible with the standard surface controller.
    const localPosition = await page.evaluate(async (mode) => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const p = window.example.viewer.camera.positionWC;
      const frame =
        mode === "planar"
          ? C.Matrix4.IDENTITY
          : C.Transforms.eastNorthUpToFixedFrame(
              C.Cartesian3.fromDegrees(-75.596, 40.038),
            );
      return C.Cartesian3.pack(
        C.Matrix4.multiplyByPoint(
          C.Matrix4.inverseTransformation(frame, new C.Matrix4()),
          p,
          new C.Cartesian3(),
        ),
        [],
      );
    }, world);
    [-28, -28, 26].forEach((value, i) =>
      expect(localPosition[i]).toBeCloseTo(value, 6),
    );
    expect(
      await page.evaluate(
        () =>
          window.example.viewer.scene.screenSpaceCameraController.enableInputs,
      ),
    ).toBe(world === "globe");
    // Isolate button mappings from release-time inertia in this interaction check.
    const inertia = await page.evaluate(() => {
      const viewer = window.example.viewer;
      const controller =
        viewer.planarCameraController ??
        viewer.scene.screenSpaceCameraController;
      const saved = {
        inertiaSpin: controller.inertiaSpin,
        inertiaTranslate: controller.inertiaTranslate,
        inertiaZoom: controller.inertiaZoom,
      };
      controller.inertiaSpin =
        controller.inertiaTranslate =
        controller.inertiaZoom =
          0;
      return saved;
    });
    await page.getByLabel("对比状态", { exact: true }).selectOption("基线 A");
    const baseline = await page.evaluate(() => window.example.state.snapshot());
    expectCamera(baseline.camera, before.camera);
    expect(baseline.lighting).toEqual(before.lighting);
    expect(baseline.atmosphere).toEqual(before.atmosphere);
    expect(baseline.time).toBe(before.time);
    expect(baseline.settings.ao).toBe(false);
    expect(baseline.settings.ssr).toBe(false);
    await page.getByLabel("对比状态", { exact: true }).selectOption("实验 B");
    expect(
      (await page.evaluate(() => window.example.state.snapshot())).settings,
    ).toEqual(before.settings);
    expect(before.atmosphere.mode).toBe("物理大气");
    expect(before.lighting.specularEnvironment).toBeUndefined();
    expect(before.lighting.diffuseSH).toBeUndefined();
    const sunBefore = await page.evaluate(() => ({
      ...window.example.viewer.scene.light.direction,
    }));
    await page.getByLabel("时间（UTC 小时）", { exact: true }).fill("23");
    await page.getByLabel("时间（UTC 小时）", { exact: true }).press("Tab");
    await expect
      .poll(() =>
        page.evaluate(() => ({
          ...window.example.viewer.scene.light.direction,
        })),
      )
      .not.toEqual(sunBefore);
    expect(
      (await page.evaluate(() => window.example.state.snapshot())).time,
    ).toBe("2026-06-21T23:00:00Z");
    await page.getByLabel("曝光", { exact: true }).fill("1.5");
    await page.getByLabel("曝光", { exact: true }).press("Tab");
    await page.getByLabel("物体光照亮度", { exact: true }).fill("2");
    await page.getByLabel("物体光照亮度", { exact: true }).press("Tab");
    await page.getByRole("button", { name: /高度雾/ }).click();
    await page.getByLabel("启用高度雾", { exact: true }).check();
    await page.getByLabel("雾密度（每米）", { exact: true }).fill("0.0005");
    await page.getByLabel("雾密度（每米）", { exact: true }).press("Tab");
    expect(
      await page.evaluate(() => ({
        exposure: window.example.viewer.scene.postProcessStages.exposure,
        surface: window.example.effects.surfaceRadianceScale,
        fog: window.example.effects.showHeightFog,
        density: window.example.effects.heightFogDensity,
      })),
    ).toEqual({ exposure: 1.5, surface: 2, fog: true, density: 0.0005 });
    await page.getByRole("button", { name: /高度雾/ }).click();
    await page.getByLabel("照明模式", { exact: true }).selectOption("固定 IBL");
    await page.waitForFunction(
      () =>
        !window.example.effects.enabled &&
        window.example.ibl.useSpecularEnvironmentMaps,
    );
    const fixed = await page.evaluate(() => window.example.state.snapshot());
    expect(fixed.lighting.specularEnvironment).toContain(
      "kiara_6_afternoon_2k_ibl.ktx2",
    );
    expect(fixed.lighting.diffuseSH).toHaveLength(9);
    expectCamera(fixed.camera, before.camera);
    await page.getByLabel("照明模式", { exact: true }).selectOption("物理大气");
    await page.waitForFunction(() => window.example.effects.ready);
    await page.getByLabel("播放时间（水面与太阳）", { exact: true }).check();
    await page
      .getByRole("button", { name: "恢复大气基准", exact: true })
      .click();
    const restored = await page.evaluate(() => window.example.state.snapshot());
    expect(restored.atmosphere).toEqual(before.atmosphere);
    expect(restored.lighting).toEqual(before.lighting);
    expect(restored.time).toBe(before.time);
    expect(restored.animate).toBe(false);
    expectCamera(restored.camera, before.camera);
    await expect(
      page.getByLabel("播放时间（水面与太阳）", { exact: true }),
    ).not.toBeChecked();
    await page
      .getByLabel("固定视角", { exact: true })
      .selectOption("屋顶与天空");
    await page.screenshot({ path: testInfo.outputPath("atmosphere.png") });
    await page.getByLabel("固定视角", { exact: true }).selectOption("材质矩阵");
    await page.screenshot({ path: testInfo.outputPath("materials.png") });
    await page
      .getByLabel("固定视角", { exact: true })
      .selectOption("头盔与玻璃");
    await expect(page.locator(".gap")).toContainText("玻璃待支持");
    await page.screenshot({ path: testInfo.outputPath("helmet-glass.png") });
    await page.getByLabel("固定视角", { exact: true }).selectOption("水池反射");
    const pool = await page.evaluate(() => window.example.state.snapshot());
    await page.mouse.move(650, 650);
    await page.mouse.wheel(0, -100);
    await waitForConsumedInput(page);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.example.state.snapshot())).camera
            .position,
      )
      .not.toEqual(pool.camera.position);
    await page
      .getByRole("button", { name: "恢复固定视角", exact: true })
      .click();
    expectCamera(
      (await page.evaluate(() => window.example.state.snapshot())).camera,
      pool.camera,
    );
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "导出验收配置", exact: true })
      .click();
    const config = JSON.parse(
      await readFile(await (await download).path(), "utf8"),
    );
    expect(config.asset).toBe("scenegis-pbr-reference-20260921");
    expect(config.textures).toBe("delivery-2k");
    expect(config.atmosphere).toEqual(before.atmosphere);
    expectCamera(config.camera, pool.camera);
    await page.screenshot({ path: testInfo.outputPath("pool.png") });
    await page.mouse.move(650, 450);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(675, 460, { steps: 6 });
    await page.mouse.up({ button: "left" });
    await waitForConsumedInput(page);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.example.state.snapshot())).camera
            .position,
      )
      .not.toEqual(pool.camera.position);
    const panned = await page.evaluate(() => window.example.state.snapshot());
    panned.camera.direction.forEach((value, i) =>
      expect(value).toBeCloseTo(pool.camera.direction[i], 4),
    );
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(710, 485, { steps: 6 });
    await page.mouse.up({ button: "middle" });
    await waitForConsumedInput(page);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.example.state.snapshot())).camera
            .direction,
      )
      .not.toEqual(panned.camera.direction);
    await page.evaluate((saved) => {
      const viewer = window.example.viewer;
      Object.assign(
        viewer.planarCameraController ??
          viewer.scene.screenSpaceCameraController,
        saved,
      );
    }, inertia);
    await expect(page.locator("#error")).toBeEmpty();
    expect(
      await page.evaluate(() => {
        const e = window.example;
        e.destroy();
        e.destroy();
        return (
          e.viewer.isDestroyed() &&
          e.models.every((m) => m.isDestroyed()) &&
          e.water.isDestroyed() &&
          e.ibl.isDestroyed() &&
          !e.effects.ready &&
          e.taa.isDestroyed() &&
          e.ssr.isDestroyed()
        );
      }),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("official main page excludes composites and preserves the selected World link", async ({
  page,
}) => {
  await page.goto("/Test/Rendering/PBR基准.html?world=planar");
  await page.waitForFunction(() => window.example?.state.ready);
  expect(await page.evaluate(() => window.example.models.length)).toBe(1);
  expect(await page.evaluate(() => window.example.water)).toBeUndefined();
  const otherPage = new URL(
    await page.locator("#other-page").getAttribute("href"),
  );
  expect(decodeURI(otherPage.pathname)).toBe(
    "/Test/Rendering/PBR综合验收.html",
  );
  expect(otherPage.searchParams.get("world")).toBe("planar");
  await expect(page.locator("#error")).toBeEmpty();
  await page.evaluate(() => window.example.destroy());
});

test("missing assets report preparation steps and disposal while loading is safe", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/pbr-data/local/prepared.json", (route) =>
    route.fulfill({ status: 404, body: "not prepared" }),
  );
  await page.goto("/Test/Rendering/PBR基准.html?world=planar");
  await expect(page.locator("#error")).toContainText(
    "prepare-pbr-reference.mjs",
  );
  await page.evaluate(() => window.example.destroy());
  await page.unrouteAll();
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("**/NewSponza_Main_glTF_003.gltf", async (route) => {
    await held;
    await route.continue();
  });
  const pending = page.waitForRequest("**/NewSponza_Main_glTF_003.gltf");
  await page.goto("/Test/Rendering/PBR基准.html?world=globe");
  await pending;
  await page.evaluate(() => window.example.destroy());
  const response = page.waitForResponse("**/NewSponza_Main_glTF_003.gltf");
  release();
  await response;
  await page.evaluate(() => window.example.loading);
  expect(await page.evaluate(() => window.example.viewer.isDestroyed())).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
