import { test, expect } from "./test.js";

test("SceneGIS planar CZML animates, picks, frames, tracks and releases native entities", async ({
  cesiumPage,
  page,
}, testInfo) => {
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      await route.continue();
    } else {
      external.push(url.href);
      await route.abort();
    }
  });
  await cesiumPage.goto();
  await page.evaluate(async () => {
    const C = Cesium;
    const world = new C.SceneGISPlanarWorld({
      coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
        extent: new C.SceneGISPlanarExtent({
          minimumX: 12997000,
          minimumY: 3997000,
          maximumX: 13003000,
          maximumY: 4003000,
        }),
        crs: "LOCAL:METERS",
      }),
      maximumLevel: 0,
      baseColor: C.Color.fromCssColorString("#243b50"),
    });
    const viewer = new C.Viewer("cesiumContainer", {
      world,
      animation: false,
      timeline: false,
      fullscreenButton: false,
    });
    viewer.scene.environmentEffects.enabled = false;
    viewer.scene.highDynamicRange = false;
    const source = await C.CzmlDataSource.load(
      "/packages/engine/Specs/SceneGIS/DataSources/Data/planar-czml.czml",
      { planar: { world } },
    );
    await viewer.dataSources.add(source);
    viewer.clockTrackedDataSource = source;
    viewer.clock.shouldAnimate = false;
    const epoch = C.JulianDate.clone(source.clock.startTime);
    viewer.clock.currentTime = C.JulianDate.addSeconds(
      epoch,
      30,
      new C.JulianDate(),
    );
    viewer.camera.setView({
      destination: new C.Cartesian3(13000000, 4000000, 3500),
      orientation: {
        direction: new C.Cartesian3(0, 0, -1),
        up: C.Cartesian3.UNIT_Y,
      },
    });
    const errors = [];
    viewer.scene.renderError.addEventListener((scene, error) =>
      errors.push(String(error)),
    );
    window.czmlTest = { viewer, source, world, epoch, errors };
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.czmlTest;
        const entity = t.source.entities.getById("vehicle");
        return t.viewer.dataSourceDisplay.getBoundingSphere(
          entity,
          false,
          new Cesium.BoundingSphere(),
        );
      }),
    )
    .toBe(0);

  const first = await page.evaluate(() => {
    const { viewer, source } = window.czmlTest;
    const entity = source.entities.getById("vehicle");
    const p = entity.position.getValue(viewer.clock.currentTime);
    const screen = Cesium.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      p,
    );
    const earlier = entity.position.getValue(
      Cesium.JulianDate.addSeconds(
        window.czmlTest.epoch,
        15,
        new Cesium.JulianDate(),
      ),
    );
    const pathScreen = Cesium.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      earlier,
    );
    return {
      position: [p.x, p.y, p.z],
      picked: viewer.scene.pick(screen)?.id === entity,
      pathPicked: viewer.scene.pick(pathScreen)?.id === entity,
      visualizers: source._visualizers.length,
      pathCount: source._visualizers[8]._items.length,
      available: source.entities
        .getById("timed-box")
        .isAvailable(viewer.clock.currentTime),
    };
  });
  expect(first.position).toEqual([13000000, 3999700, 160]);
  expect(first.picked).toBe(true);
  expect(first.pathPicked).toBe(true);
  expect(first.visualizers).toBe(9);
  expect(first.pathCount).toBe(1);
  expect(first.available).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("planar-czml.png") });

  await page.evaluate(() => {
    const t = window.czmlTest;
    t.viewer.trackedEntity = t.source.entities.getById("vehicle");
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.czmlTest;
        const p = t.viewer.trackedEntity.position.getValue(
          t.viewer.clock.currentTime,
        );
        const target = Cesium.Cartesian3.add(
          p,
          new Cesium.Cartesian3(0, -900, 650),
          new Cesium.Cartesian3(),
        );
        return Cesium.Cartesian3.distance(t.viewer.camera.positionWC, target);
      }),
    )
    .toBeLessThan(0.1);
  await page.evaluate(() => {
    const t = window.czmlTest;
    t.followStart = Cesium.Cartesian3.clone(t.viewer.camera.positionWC);
    t.viewer.clock.currentTime = Cesium.JulianDate.addSeconds(
      t.epoch,
      45,
      new Cesium.JulianDate(),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.czmlTest;
        const delta = Cesium.Cartesian3.subtract(
          t.viewer.camera.positionWC,
          t.followStart,
          new Cesium.Cartesian3(),
        );
        return Cesium.Cartesian3.distance(
          delta,
          new Cesium.Cartesian3(300, 250, 40),
        );
      }),
    )
    .toBeLessThan(0.1);

  const geometry = await page.evaluate(async () => {
    const { viewer, source } = window.czmlTest;
    viewer.trackedEntity = undefined;
    const zoomed = await viewer.zoomTo(source);
    const flown = await viewer.flyTo(source.entities.getById("vehicle"), {
      duration: 0,
    });
    const same = source.entities.getById("vehicle");
    await source.process({
      id: "vehicle",
      point: { color: { rgba: [255, 100, 120, 255] } },
      path: {
        material: { solidColor: { color: { rgba: [255, 100, 120, 255] } } },
      },
    });
    return {
      zoomed,
      flown,
      identity: same === source.entities.getById("vehicle"),
    };
  });
  expect(geometry).toEqual({ zoomed: true, flown: true, identity: true });

  await page.evaluate(async () => {
    const t = window.czmlTest;
    t.previousEntity = t.source.entities.getById("vehicle");
    await t.source.load(
      "/packages/engine/Specs/SceneGIS/DataSources/Data/planar-czml.czml",
    );
    t.viewer.clock.currentTime = Cesium.JulianDate.addSeconds(
      t.epoch,
      30,
      new Cesium.JulianDate(),
    );
    t.viewer.camera.setView({
      destination: new Cesium.Cartesian3(13000000, 4000000, 3500),
      orientation: {
        direction: new Cesium.Cartesian3(0, 0, -1),
        up: Cesium.Cartesian3.UNIT_Y,
      },
    });
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.czmlTest;
        const current = t.source.entities.getById("vehicle");
        const pathItem = t.source._visualizers[8]._items.get("vehicle");
        const p = current.position.getValue(
          Cesium.JulianDate.addSeconds(t.epoch, 15, new Cesium.JulianDate()),
        );
        const screen = Cesium.SceneTransforms.worldToWindowCoordinates(
          t.viewer.scene,
          p,
        );
        return (
          current !== t.previousEntity &&
          pathItem.entity === current &&
          pathItem.owner?.color.green === 195 / 255 &&
          t.viewer.scene.pick(screen)?.id === current
        );
      }),
    )
    .toBe(true);
  const replaced = await page.evaluate(() => {
    const t = window.czmlTest;
    const C = Cesium;
    return [
      ["vehicle", new C.Cartesian3(13000000, 3999700, 160)],
      ["timed-box", new C.Cartesian3(12999600, 4000200, 130)],
      ["zone", new C.Cartesian3(13000500, 3999500, 1)],
    ].map(
      ([id, p]) =>
        t.viewer.scene.pick(
          C.SceneTransforms.worldToWindowCoordinates(t.viewer.scene, p),
        )?.id === t.source.entities.getById(id),
    );
  });
  expect(replaced).toEqual([true, true, true]);

  await page.evaluate(() => {
    const t = window.czmlTest;
    t.source.show = false;
    t.viewer.clock.currentTime = Cesium.JulianDate.addSeconds(
      t.epoch,
      70,
      new Cesium.JulianDate(),
    );
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.czmlTest;
        return t.viewer.dataSourceDisplay.getBoundingSphere(
          t.source.entities.getById("vehicle"),
          false,
          new Cesium.BoundingSphere(),
        );
      }),
    )
    .toBe(2);
  expect(
    await page.evaluate(() => {
      const t = window.czmlTest;
      return t.source.entities
        .getById("timed-box")
        .isAvailable(t.viewer.clock.currentTime);
    }),
  ).toBe(false);
  await page.evaluate(() => {
    window.czmlTest.source.show = true;
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.czmlTest;
        return t.viewer.dataSourceDisplay.getBoundingSphere(
          t.source.entities.getById("vehicle"),
          false,
          new Cesium.BoundingSphere(),
        );
      }),
    )
    .toBe(0);

  const teardown = await page.evaluate(() => {
    const t = window.czmlTest;
    const visualizers = t.source._visualizers.slice();
    const primitives = t.source._primitives;
    t.viewer.dataSources.remove(t.source);
    const removed =
      visualizers.every((v) => v.isDestroyed()) && primitives.isDestroyed();
    const errors = t.errors.slice();
    t.viewer.destroy();
    return { removed, destroyed: t.world.isDestroyed(), errors };
  });
  expect(teardown).toEqual({ removed: true, destroyed: true, errors: [] });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
