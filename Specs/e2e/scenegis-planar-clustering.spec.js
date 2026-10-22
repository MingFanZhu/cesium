import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test("planar native clusters: Viewer, dynamic properties, picks, loaders and lifecycle", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (testInfo.project.name === "release") {
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
  await page.goto("/Test/平面聚类.html");
  await page.waitForFunction(
    () =>
      window.example?.source.clustering._clusterLabelCollection?.length > 0 &&
      window.example.source.clustering.ready,
  );
  await expect(page.locator("#error")).toHaveText("");
  await page.screenshot({
    path: testInfo.outputPath("clustered-perspective.png"),
  });
  const result = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const e = window.example,
      v = e.viewer,
      cluster = e.source.clustering;
    v.useDefaultRenderLoop = false;
    v.planarCameraController.enabled = false;
    const frame = () => {
      v.resize();
      v.render();
    };
    const settle = async (c = cluster) => {
      await Promise.resolve();
      for (let i = 0; i < 120; ++i) {
        frame();
        if (c.ready && v.dataSourceDisplay.ready) {
          return;
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      throw new Error("Cluster atlas did not become ready");
    };
    const count = () => cluster._clusterLabelCollection?.length ?? 0;
    await settle();
    const initial = count();
    const label = cluster._clusterLabelCollection.get(0);
    const picked = v.scene.pick(
      C.SceneTransforms.worldToWindowCoordinates(v.scene, label.position),
    )?.id;
    const pickMatches =
      Array.isArray(picked) &&
      picked.length === label.id.length &&
      picked.every((id) => e.source.entities.contains(id));
    const startEvents = e.state.events,
      startReads = e.state.reads;
    const frozenTime = v.clock.currentTime.clone();
    const timing = (action) => {
      const times = [];
      for (let i = 0; i < 30; ++i) {
        action(i);
        const t = performance.now();
        frame();
        times.push(performance.now() - t);
      }
      times.sort((a, b) => a - b);
      return { median: times[15], p95: times[28] };
    };
    const warm = timing(() => {});
    const warmEvents = e.state.events - startEvents;
    const readWhileFrozen =
      e.state.reads > startReads &&
      C.JulianDate.equals(frozenTime, v.clock.currentTime);
    e.state.offset = 700;
    frame();
    const movedCluster = Array.from({ length: count() }, (_, i) =>
      cluster._clusterLabelCollection.get(i),
    ).find((l) => l.id.some((member) => member.id === "group-0-0"));
    const followsPosition =
      movedCluster && movedCluster.position.x > 13000000 - 400;
    e.state.offset = 0;
    frame();
    e.source.show = false;
    frame();
    const hidden = count();
    e.source.show = true;
    frame();
    cluster.clusterPoints = false;
    frame();
    const excluded = e.groups[0].every(
      (entity) => cluster.getPoint(entity).clusterShow,
    );
    cluster.clusterLabels = cluster.clusterBillboards = false;
    frame();
    const allOff = count();
    cluster.clusterPoints =
      cluster.clusterLabels =
      cluster.clusterBillboards =
        true;
    frame();
    const restored = count();
    cluster.enabled = false;
    frame();
    const disabled = count();
    const disabledWarm = timing(() => {});
    const entity = e.groups[3][0];
    const single = v.scene.pick(
      C.SceneTransforms.worldToWindowCoordinates(
        v.scene,
        entity.position.getValue(v.clock.currentTime),
      ),
    )?.id;
    cluster.enabled = true;
    frame();
    const changed = timing((i) => {
      e.state.offset = i * 4;
    });
    e.state.offset = 0;
    await settle();
    const listeners = v.camera.changed.numberOfListeners;
    let released = true;
    for (let i = 0; i < 6; ++i) {
      const owned = [
        cluster._pointCollection,
        cluster._labelCollection,
        cluster._billboardCollection,
        cluster._clusterLabelCollection,
        cluster._clusterPointCollection,
      ].filter(Boolean);
      await e.readd();
      released &&= owned.every((o) => o.isDestroyed());
      // The gate activates children in this update; they run on the next update.
      frame();
      await settle();
    }
    const listenerBalance = listeners === v.camera.changed.numberOfListeners;
    const postReadd = count();
    const nativeSources = [];
    const geo = await C.GeoJsonDataSource.load(
      {
        type: "FeatureCollection",
        features: [0, 1].map((i) => ({
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [i * 5, 0, 100] },
        })),
      },
      {
        planar: {
          world: e.world,
          projectCoordinates: (xyz) => e.position(...xyz),
        },
      },
    );
    nativeSources.push(geo);
    const czml = await C.CzmlDataSource.load(
      [
        { id: "document", version: "1.0" },
        ...[0, 1].map((i) => ({
          id: `cz-${i}`,
          position: { cartesian: [13000000 + i * 5, 4000000, 100] },
          point: { pixelSize: 12 },
        })),
      ],
      { planar: { world: e.world } },
    );
    nativeSources.push(czml);
    const loaderCounts = [];
    for (const source of nativeSources) {
      source.clustering.enabled = true;
      await v.dataSources.add(source);
      // Activate the deferred gate before waiting for primitive atlas readiness.
      frame();
      frame();
      await settle(source.clustering);
      loaderCounts.push(
        source.clustering._clusterLabelCollection?.get(0).id.length ?? 0,
      );
      v.dataSources.remove(source);
    }
    const gl = v.scene.context._gl,
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      initial,
      pickMatches,
      warm,
      warmEvents,
      readWhileFrozen,
      followsPosition,
      hidden,
      excluded,
      allOff,
      restored,
      disabled,
      disabledWarm,
      singlePick: single === entity,
      changed,
      released,
      listenerBalance,
      postReadd,
      loaderCounts,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown",
    };
  });
  expect(result.initial).toBeGreaterThan(0);
  expect(result.pickMatches).toBe(true);
  expect(result.warmEvents).toBe(0);
  expect(result.readWhileFrozen).toBe(true);
  expect(result.followsPosition).toBe(true);
  expect(result.hidden).toBe(0);
  expect(result.excluded).toBe(true);
  expect(result.allOff).toBe(0);
  expect(result.restored).toBe(result.initial);
  expect(result.disabled).toBe(0);
  expect(result.singlePick).toBe(true);
  expect(result.released).toBe(true);
  expect(result.listenerBalance).toBe(true);
  expect(result.postReadd).toBe(result.initial);
  expect(result.loaderCounts).toEqual([2, 2]);
  await writeFile(
    testInfo.outputPath("measurements.json"),
    JSON.stringify(result, null, 2),
  );
  await page.locator("#ortho").check();
  await page.evaluate(() => {
    window.example.viewer.render();
  });
  await page.screenshot({
    path: testInfo.outputPath("clustered-orthographic.png"),
  });
  await page.locator("#enabled").uncheck();
  await page.evaluate(() => {
    window.example.viewer.render();
  });
  await page.screenshot({ path: testInfo.outputPath("unclustered.png") });
  await page.evaluate(() => window.example.destroy());
  expect(errors).toEqual([]);
});
