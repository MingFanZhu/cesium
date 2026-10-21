import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
test("planar polylines: Viewer properties, frozen clock, terrain, picks and lifecycle", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (testInfo.project.name === "release") {
    // Exercise the release bundle without changing the example's single-runtime import contract.
    await page.route("**/Build/CesiumUnminified/**", async (route) => {
      const response = await route.fetch({
        url: route
          .request()
          .url()
          .replace("/Build/CesiumUnminified/", "/Build/Cesium/"),
      });
      await route.fulfill({ response });
    });
  }
  await page.goto("/Test/平面折线材质.html");
  await page.waitForFunction(
    () =>
      window.example?.world.tilesLoaded &&
      window.example.primitives.every((p) => p.ready) &&
      window.example.state.reads > 0,
  );
  await expect(page.locator("#error")).toHaveText("");
  await page.locator("#freeze").check();
  await page.screenshot({
    path: testInfo.outputPath("native-arrow-dash-closed-flow.png"),
  });
  const result = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js"),
      e = window.example,
      v = e.viewer;
    v.useDefaultRenderLoop = false;
    const frame = () => {
      v.resize();
      v.render();
    };
    const lineVisualizer =
      v.dataSourceDisplay.defaultDataSource._visualizers.find(
        (item) => item instanceof C._SceneGISPlanarPolylineVisualizer,
      );
    const owners = () =>
      e.entities.map((entity) => lineVisualizer._items.get(entity.id).owner);
    const first = owners(),
      va = first.map((owner) => owner.primitive._current._va[0]);
    const programs = first.map((owner) => owner.primitive._current._sp);
    const time = v.clock.currentTime.clone(),
      reads = e.state.reads;
    document.querySelector("#color").value = "#ff6020";
    document.querySelector("#alpha").value = "0.4";
    frame();
    const frozen = {
      sameTime: C.JulianDate.equals(time, v.clock.currentTime),
      reads: e.state.reads - reads,
      colors: owners().map((owner) =>
        owner.appearance.material.uniforms.color.toBytes(),
      ),
      sameOwners: owners().every((owner, i) => owner === first[i]),
      sameVA: owners().every(
        (owner, i) => owner.primitive._current._va[0] === va[i],
      ),
    };
    document.querySelector("#color").value = "#35d8ed";
    document.querySelector("#alpha").value = "0.85";
    v.clock.currentTime = C.JulianDate.addSeconds(time, 1, new C.JulianDate());
    frame();
    const flowSeconds = owners()
      .filter((o) => o.appearance.material.type === "PlanarPolylineFlowExample")
      .map((o) => o.appearance.material.uniforms.seconds);
    const timings = [];
    for (let i = 0; i < 24; ++i) {
      const start = performance.now();
      frame();
      timings.push(performance.now() - start);
    }
    timings.sort((a, b) => a - b);
    const stable = owners().every(
      (o, i) => o.primitive._current._sp === programs[i],
    );
    const gpu = v.scene.context._gl,
      extension = gpu.getExtension("WEBGL_debug_renderer_info");
    const renderer = extension
      ? gpu.getParameter(extension.UNMASKED_RENDERER_WEBGL)
      : "unknown";
    const pickIds = [];
    for (const entity of e.entities.slice(0, 2)) {
      const p = entity.polyline.positions
        .getValue(v.clock.currentTime)[0]
        .clone();
      p.x += 15;
      if (entity.polyline.clampToGround.getValue(v.clock.currentTime)) {
        p.z = e.world.getTerrainHeight(p) ?? 0;
      }
      const xy = C.SceneTransforms.worldToWindowCoordinates(v.scene, p);
      pickIds.push(v.scene.pick(xy)?.id?.id);
    }
    const before = owners().map((o) => o.appearance.material);
    for (const entity of e.entities) {
      entity.polyline.material = new C.PolylineDashMaterialProperty({
        color: C.Color.YELLOW,
      });
    }
    frame();
    const disposedOnType = before.map((m) => m.isDestroyed());
    const disposedVA = va.every((value) => value.isDestroyed());
    const oldOwners = owners();
    document.querySelector("#offset").value = "30";
    document.querySelector("#offset").dispatchEvent(new Event("input"));
    frame();
    const moved = owners().every(
      (owner, i) =>
        owner !== oldOwners[i] &&
        oldOwners[i].destroyed &&
        owner.primitive.geometry.positions[0].y ===
          e.entities[i].polyline.positions.getValue(v.clock.currentTime)[0].y,
    );
    document.querySelector("#offset").value = "0";
    const replacement = owners().map((o) => o.appearance.material);
    for (let i = 0; i < 6; ++i) {
      e.rebuild();
      frame();
    }
    const disposedOnRemove = replacement.every((m) => m.isDestroyed());
    return {
      frozen,
      flowSeconds,
      stable,
      renderer,
      median: timings[12],
      max: timings[23],
      pickIds,
      disposedOnType,
      disposedVA,
      moved,
      disposedOnRemove,
      liveEntities: v.entities.values.length,
      liveOwners: lineVisualizer._items.length,
    };
  });
  expect(result.frozen.sameTime).toBe(true);
  expect(result.frozen.reads).toBeGreaterThanOrEqual(4);
  expect(
    result.frozen.sameOwners && result.frozen.sameVA && result.stable,
  ).toBe(true);
  for (const color of result.frozen.colors) {
    expect(color).toEqual([255, 96, 32, 102]);
  }
  expect(result.flowSeconds.length).toBe(2);
  expect(result.flowSeconds.every((s) => s >= 1)).toBe(true);
  expect(result.pickIds).toEqual(["普通 Entity", "贴地 Entity"]);
  expect(result.disposedOnType.every(Boolean) && result.disposedOnRemove).toBe(
    true,
  );
  expect(result.disposedVA && result.moved).toBe(true);
  expect(result.liveEntities).toBe(4);
  expect(result.liveOwners).toBe(4);
  await writeFile(
    testInfo.outputPath("measurements.json"),
    JSON.stringify(result, null, 2),
  );
  await testInfo.attach("measurements", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  await page.locator("#effect").selectOption("flow");
  await page.evaluate(() => window.example.viewer.render());
  await page.screenshot({ path: testInfo.outputPath("flow-seconds.png") });
  await page.locator("#pitch").fill("18");
  await page.locator("#pitch").dispatchEvent("input");
  await page.evaluate(() => window.example.viewer.render());
  await page.screenshot({ path: testInfo.outputPath("terrain-low-angle.png") });
  await expect(page.locator("#error")).toHaveText("");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() => {
      const e = window.example;
      e.destroy();
      e.destroy();
      return e.viewer.isDestroyed() && e.world.isDestroyed();
    }),
  ).toBe(true);
});
