import { open, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
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

test("Bistro preserves supplied geometry and restores source material channels", async () => {
  const local = join(dataRoot, "local/bistro");
  const pinned = await json(join(dataRoot, "bistro-manifest.json"));
  const report = await json(join(local, "prepared.json"));
  const gltf = await json(join(local, "Bistro.gltf"));
  expect(report.sourceGlb.sha256).toBe(pinned.sourceGlbSha256);
  expect(report.sourceFbx.sha256).toBe(pinned.sourceFbxSha256);
  expect(report.maximumTextureSize).toBe(pinned.maximumTextureSize);
  expect(report.triangles).toBe(pinned.triangles);
  const input = await open(join(dataRoot, "../../Data/Models/Bistro.glb"));
  try {
    const header = Buffer.alloc(20);
    await input.read(header, 0, 20, 0);
    const document = Buffer.alloc(header.readUInt32LE(12));
    await input.read(document, 0, document.length, 20);
    const source = JSON.parse(document);
    expect(gltf.nodes).toEqual(source.nodes);
    expect(gltf.meshes).toEqual(source.meshes);
    expect(gltf.scenes).toEqual(source.scenes);
    const geometry = await readFile(join(local, "Bistro.bin"));
    for (let i = 0; i < gltf.accessors.length; i++) {
      const original = source.accessors[i];
      const delivered = gltf.accessors[i];
      expect({ ...delivered, bufferView: original.bufferView }).toEqual(
        original,
      );
    }
    const imageViews = new Set(source.images.map((image) => image.bufferView));
    let deliveryIndex = 0;
    for (let i = 0; i < source.bufferViews.length; i++) {
      if (imageViews.has(i)) {
        continue;
      }
      const before = source.bufferViews[i];
      const after = gltf.bufferViews[deliveryIndex++];
      const bytes = Buffer.alloc(before.byteLength);
      await input.read(
        bytes,
        0,
        bytes.length,
        28 + document.length + (before.byteOffset ?? 0),
      );
      expect(
        geometry
          .subarray(after.byteOffset, after.byteOffset + after.byteLength)
          .equals(bytes),
      ).toBe(true);
    }
  } finally {
    await input.close();
  }
  expect(gltf.materials).toHaveLength(pinned.materials);
  expect(gltf.extensionsUsed).toBeUndefined();
  for (const material of gltf.materials) {
    const pbr = material.pbrMetallicRoughness;
    if (material.name === "Paris_LiquorBottle_01_Labels") {
      expect(pbr.metallicFactor).toBe(0);
    } else {
      expect(material.occlusionTexture).toBeUndefined();
      expect(pbr.roughnessFactor).toBe(1);
      const image =
        gltf.images[gltf.textures[pbr.metallicRoughnessTexture.index].source];
      expect(image.uri).toMatch(/_Specular\.png$/);
    }
    expect(material.normalTexture).toBeDefined();
  }
  expect(gltf.materials.filter((m) => m.alphaMode === "OPAQUE")).toHaveLength(
    120,
  );
  expect(gltf.materials.filter((m) => m.alphaMode === "MASK")).toHaveLength(7);
  // Small source maps are not resampled: compare decoded numeric ranges to the
  // DDS measurements to catch gamma conversion and missing DirectX green inversion.
  const requireTools = createRequire(
    new URL("../../Build/pbr-reference/tools/package.json", import.meta.url),
  );
  const sharp = requireTools("sharp");
  for (const texture of report.textures) {
    const file = join(local, texture.uri);
    const metadata = await sharp(file).metadata();
    expect([metadata.width, metadata.height]).toEqual(texture.size);
    expect(Math.max(...texture.size)).toBeLessThanOrEqual(1024);
    if (texture.kind === "BaseColor" || Math.max(...texture.sourceSize) > 64) {
      continue;
    }
    const stats = await sharp(file).stats();
    for (let channel = 0; channel < 3; channel++) {
      const flip = texture.kind === "Normal" && channel === 1;
      const minimum = flip
        ? 1 - texture.channelMax[channel]
        : texture.channelMin[channel];
      const maximum = flip
        ? 1 - texture.channelMin[channel]
        : texture.channelMax[channel];
      expect(
        Math.abs(stats.channels[channel].min / 255 - minimum),
      ).toBeLessThan(0.005);
      expect(
        Math.abs(stats.channels[channel].max / 255 - maximum),
      ).toBeLessThan(0.005);
    }
  }
  expect(await readFile(join(local, "LICENSE.txt"), "utf8")).toContain(
    "Attribution 4.0 International",
  );
});

for (const world of ["planar", "globe"]) {
  test(`Bistro ${world}: direct controls, UTC location, clock, navigation and cleanup`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/PBR综合验收.html?world=${world}`);
    await page.waitForFunction(() => window.example?.state.ready);
    await expect(page.locator("#error")).toBeEmpty();
    await expect(page.locator("#status")).toContainText("Bistro 就绪");
    await expect(page.locator("#variant")).toContainText("1K");
    await expect(page.locator("#texture-link")).toBeHidden();
    const before = await page.evaluate(() => window.example.state.snapshot());
    expect(before.layout).toBe("bistro-street");
    expect(before.asset).toBe("scenegis-bistro-v5.2-20260921");
    expect(before.textures).toBe("bistro-delivery-1k");
    expect(before.view).toBe("餐馆街景");
    expect(before.time).toBe("2026-03-20T14:00:00Z");
    expect(before.atmosphere.longitude).toBe(0);
    expect(before.atmosphere.latitude).toBe(51.4779);
    expect(before.atmosphere.day).toBe(79);
    expect(before.comparison).toBeUndefined();
    await expect(page.getByLabel("对比状态", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("光照参数对照", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.locator("#controls")).not.toContainText(/基线 A|实验 B/);
    const location = await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const e = window.example;
      if (e.environment) {
        return [
          C.Math.toDegrees(e.environment.originLongitude),
          C.Math.toDegrees(e.environment.originLatitude),
        ];
      }
      const origin = C.Matrix4.getTranslation(
        e.models[0].modelMatrix,
        new C.Cartesian3(),
      );
      const cartographic = C.Cartographic.fromCartesian(origin);
      return [
        C.Math.toDegrees(cartographic.longitude),
        C.Math.toDegrees(cartographic.latitude),
      ];
    });
    expect(location[0]).toBeCloseTo(0, 7);
    expect(location[1]).toBeCloseTo(51.4779, 7);
    expect(before.lighting.exposure).toBe(2.5);
    expect(before.lighting.imageBasedLightingFactor).toEqual([0.5, 1]);
    expect(before.lighting.toneMapper).toBe("PBR_NEUTRAL");
    expect(before.lighting.shadows).toEqual({
      enabled: true,
      darkness: 0,
      size: 2048,
      maximumDistance: 300,
      softShadows: true,
    });
    await page
      .getByRole("button", { name: "物理大气与光照", exact: false })
      .click();
    await page.getByLabel("天空漫反射权重", { exact: true }).fill("0.65");
    await page.getByLabel("天空漫反射权重", { exact: true }).press("Tab");
    expect(
      await page.evaluate(() => window.example.ibl.imageBasedLightingFactor.x),
    ).toBe(0.65);
    await page
      .getByRole("button", { name: "HDR 与曝光", exact: false })
      .click();
    await page.getByLabel("曝光倍率", { exact: true }).fill("1");
    await page.getByLabel("曝光倍率", { exact: true }).press("Tab");
    await page.getByLabel("自动曝光", { exact: true }).check();
    await page.waitForFunction(() => window.example.autoExposure.ready);
    await page.getByLabel("锁定当前曝光", { exact: true }).check();
    const automatic = await page.evaluate(() =>
      window.example.state.snapshot(),
    );
    expectCamera(automatic.camera, before.camera);
    expect(automatic.time).toBe(before.time);
    expect(automatic.lighting.autoExposure.enabled).toBe(true);
    expect(automatic.lighting.autoExposure.locked).toBe(true);
    await page.getByLabel("自动曝光", { exact: true }).uncheck();
    await page.getByLabel("锁定当前曝光", { exact: true }).uncheck();
    expect(automatic.lighting.exposure).toBe(1);
    await page.getByLabel("泛光", { exact: true }).check();
    expect(await page.evaluate(() => window.example.effects.showBloom)).toBe(
      true,
    );
    await page.getByLabel("泛光", { exact: true }).uncheck();
    expect(await page.evaluate(() => window.example.models.length)).toBe(1);
    expect(
      await page.evaluate(
        () => window.example.models[0].statistics.trianglesLength,
      ),
    ).toBe(2829226);
    expect(await page.evaluate(() => window.example.water)).toBeUndefined();
    await page
      .getByRole("button", { name: "环境光遮蔽", exact: false })
      .click();
    await page.getByLabel("启用环境光遮蔽", { exact: true }).uncheck();
    expect(await page.evaluate(() => window.example.ao.enabled)).toBe(false);
    await page.getByLabel("启用环境光遮蔽", { exact: true }).check();
    await page.getByRole("button", { name: "几何阴影", exact: false }).click();
    await page.getByLabel("阴影内直射保留", { exact: true }).fill("0.1");
    await page.getByLabel("阴影内直射保留", { exact: true }).press("Tab");
    expect(
      await page.evaluate(() => window.example.viewer.scene.shadowMap.darkness),
    ).toBe(0.1);
    await page.getByLabel("时间（UTC 小时）", { exact: true }).fill("14.8");
    await page.getByLabel("时间（UTC 小时）", { exact: true }).press("Tab");
    expect(
      (await page.evaluate(() => window.example.state.snapshot())).time,
    ).toBe("2026-03-20T14:48:00Z");
    // Advance the actual Clock; pausing must retain the visible time, not restore
    // the last edited hour. This also verifies the Clock -> GUI synchronization.
    await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const clock = window.example.viewer.clock;
      clock.currentTime = C.JulianDate.fromIso8601("2026-03-20T15:03:12Z");
      clock.onTick.raiseEvent(clock);
    });
    await page.getByLabel("播放时间（太阳）", { exact: true }).check();
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.example.state.snapshot())).time,
      )
      .not.toBe("2026-03-20T15:03:12Z");
    await page.getByLabel("播放时间（太阳）", { exact: true }).uncheck();
    const paused = await page.evaluate(() => window.example.state.snapshot());
    expect(paused.time).toMatch(/^2026-03-20T15:03:/);
    expect(paused.atmosphere.hour).toBeGreaterThan(15.05);
    expect(paused.atmosphere.hour).toBeLessThan(15.1);
    expect(paused.animate).toBe(false);
    // Use the native tick with animation disabled to prove pause is stable.
    await page.evaluate(() => window.example.viewer.clock.tick());
    expect(
      (await page.evaluate(() => window.example.state.snapshot())).time,
    ).toBe(paused.time);
    await page.getByLabel("年内日序（2026）", { exact: true }).fill("80");
    await page.getByLabel("年内日序（2026）", { exact: true }).press("Tab");
    expect(
      (await page.evaluate(() => window.example.state.snapshot())).time,
    ).toMatch(/^2026-03-21T15:03:/);
    await page
      .getByRole("button", { name: "恢复默认时间与大气", exact: true })
      .click();
    expect(
      (await page.evaluate(() => window.example.state.snapshot())).time,
    ).toBe(before.time);
    await expect(page.locator("#street-time")).toContainText(
      "2026-03-20 14:00:00 UTC / GMT",
    );
    await page.screenshot({ path: testInfo.outputPath("bistro-street.png") });
    await page.getByLabel("固定视角", { exact: true }).selectOption("街区全景");
    await page.screenshot({ path: testInfo.outputPath("bistro-overview.png") });
    const overview = await page.evaluate(() => window.example.state.snapshot());
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "导出验收配置", exact: true })
      .click();
    const saved = JSON.parse(
      await readFile(await (await download).path(), "utf8"),
    );
    expect(saved.sourceGlb.sha256).toHaveLength(64);
    expect(saved.materialNotes).toHaveLength(4);
    expectCamera(saved.camera, overview.camera);
    // Keep native controller input verification independent of the fixed comparison.
    await page.mouse.move(650, 650);
    await page.mouse.wheel(0, -100);
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.example.state.snapshot())).camera
            .position,
      )
      .not.toEqual(overview.camera.position);
    await expect(page.locator("#error")).toBeEmpty();
    expect(
      await page.evaluate(() => {
        const e = window.example;
        e.destroy();
        e.destroy();
        return (
          e.viewer.isDestroyed() &&
          e.models[0].isDestroyed() &&
          e.ibl.isDestroyed() &&
          !e.effects.ready
        );
      }),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
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
    await page.goto(
      `/Test/Rendering/PBR综合验收.html?world=${world}&asset=sponza`,
    );
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
    await page.getByLabel("曝光倍率", { exact: true }).fill("1.5");
    await page.getByLabel("曝光倍率", { exact: true }).press("Tab");
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
    await expect(page.locator("#sponza-notes .gap")).toContainText(
      "玻璃待支持",
    );
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
