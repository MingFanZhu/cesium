import { test, expect } from "./test.js";

test("SceneGIS planar GeoJSON renders native entities with ground, holes and lifecycle", async ({
  cesiumPage,
  page,
}) => {
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      await route.continue();
    } else {
      external.push(route.request().url());
      await route.abort();
    }
  });
  await cesiumPage.goto();
  await page.evaluate(async () => {
    const C = Cesium;
    const projection = new C.WebMercatorProjection();
    const project = (lon, lat, z = 0) =>
      projection.project(C.Cartographic.fromDegrees(lon, lat, z));
    const center = project(118.787, 32.061);
    const world = new C.SceneGISPlanarWorld({
      coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
        extent: new C.SceneGISPlanarExtent({
          minimumX: center.x - 3500,
          minimumY: center.y - 3500,
          maximumX: center.x + 3500,
          maximumY: center.y + 3500,
        }),
        crs: "EPSG:3857",
      }),
      maximumLevel: 0,
      baseColor: C.Color.fromCssColorString("#344b63"),
    });
    const terrain = new C.SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([0, 0, 0, 0, 260, 0, 0, 0, 0]),
      width: 3,
      height: 3,
    });
    world.terrainProvider = {
      tilingScheme: world.tilingScheme,
      minimumHeight: 0,
      maximumHeight: 260,
      maximumLevel: 0,
      errorEvent: new C.Event(),
      getLevelMaximumGeometricError: () => 100,
      requestTileGeometry: () => Promise.resolve(terrain),
      getTileDataAvailable: () => true,
      loadTileDataAvailability: () => undefined,
    };
    const viewer = new C.Viewer("cesiumContainer", {
      world,
      useDefaultRenderLoop: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
    });
    viewer.scene.environmentEffects.enabled = false;
    viewer.scene.highDynamicRange = false;
    const setView = () =>
      viewer.camera.setView({
        destination: new C.Cartesian3(center.x, center.y, 5500),
        orientation: {
          direction: new C.Cartesian3(0, 0, -1),
          up: C.Cartesian3.UNIT_Y,
        },
      });
    setView();
    let projectionCalls = 0;
    const source = await C.GeoJsonDataSource.load(
      "/packages/engine/Specs/SceneGIS/DataSources/Data/planar-geojson.geojson",
      {
        planar: {
          world,
          projectCoordinates(c) {
            projectionCalls++;
            return project(c[0], c[1], c[2] ?? 0);
          },
        },
        clampToGround: true,
      },
    );
    source.entities.getById("raised-line").polyline.clampToGround = false;
    await viewer.dataSources.add(source);
    window.geoJsonTest = {
      viewer,
      world,
      source,
      project,
      setView,
      loadProjectionCalls: projectionCalls,
      getProjectionCalls: () => projectionCalls,
      render() {
        viewer.dataSourceDisplay.update(viewer.clock.currentTime);
        viewer.render();
      },
    };
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.geoJsonTest;
        t.render();
        return (
          t.world.tilesLoaded &&
          t.viewer.dataSourceDisplay.ready &&
          t.world.getTerrainHeight(t.project(118.787, 32.061)) > 200
        );
      }),
    )
    .toBe(true);

  const rendered = await page.evaluate(() => {
    const C = Cesium;
    const t = window.geoJsonTest;
    const { viewer, world, source, project } = t;
    const targets = [
      ["raised-area", 118.777, 32.061, 450],
      ["ground-area", 118.792, 32.061],
      ["ground-line", 118.787, 32.054],
      ["raised-line", 118.7775, 32.069, 400],
      ["ground-point", 118.799, 32.069],
      ["raised-point", 118.775, 32.055, 600],
    ];
    const picks = targets.map(([id, lon, lat, z]) => {
      const position = project(lon, lat, z);
      if (z === undefined) {
        position.z = world.getTerrainHeight(position);
      }
      const pixel = C.SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        position,
      );
      if (id.endsWith("point")) {
        pixel.y -= 20;
      }
      return {
        id,
        original: viewer.scene.pick(pixel)?.id === source.entities.getById(id),
      };
    });
    const hole = project(118.797, 32.061);
    hole.z = world.getTerrainHeight(hole);
    const holePixel = C.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      hole,
    );
    const holeClear =
      viewer.scene.pick(holePixel)?.id !==
      source.entities.getById("ground-area");
    const fill = project(118.792, 32.061);
    fill.z = world.getTerrainHeight(fill);
    const fillPixel = C.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      fill,
    );
    const pixelColor = () =>
      Array.from(
        viewer.scene.context.readPixels({
          x: Math.round(fillPixel.x),
          y: viewer.scene.drawingBufferHeight - Math.round(fillPixel.y),
          width: 1,
          height: 1,
        }),
      );
    t.render();
    const visibleColor = pixelColor();
    source.show = false;
    t.render();
    const hiddenColor = pixelColor();
    const hiddenPick =
      viewer.scene.pick(fillPixel)?.id ===
      source.entities.getById("ground-area");
    source.show = true;
    t.render();
    return {
      picks,
      holeClear,
      hiddenPick,
      visibleColor,
      hiddenColor,
      projectionStatic: t.getProjectionCalls() === t.loadProjectionCalls,
      visualizers: source._visualizers.length,
    };
  });
  expect(rendered.picks).toEqual(
    [
      "raised-area",
      "ground-area",
      "ground-line",
      "raised-line",
      "ground-point",
      "raised-point",
    ].map((id) => ({ id, original: true })),
  );
  expect(rendered.holeClear).toBe(true);
  expect(rendered.hiddenPick).toBe(false);
  expect(rendered.visibleColor).not.toEqual(rendered.hiddenColor);
  expect(rendered.projectionStatic).toBe(true);
  expect(rendered.visualizers).toBe(9);

  await page.evaluate(() => {
    const t = window.geoJsonTest;
    t.zoom = undefined;
    t.viewer.zoomTo(t.source).then((value) => {
      t.zoom = value;
    });
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const t = window.geoJsonTest;
        t.render();
        return t.zoom;
      }),
    )
    .toBe(true);
  const teardown = await page.evaluate(() => {
    const t = window.geoJsonTest;
    const visualizers = t.source._visualizers.slice();
    const collection = t.source._primitives;
    t.viewer.dataSources.remove(t.source);
    t.render();
    const removed =
      visualizers.every((v) => v.isDestroyed()) && collection.isDestroyed();
    const worldLive = !t.world.isDestroyed();
    t.viewer.destroy();
    return {
      removed,
      worldLive,
      destroyed: t.viewer.isDestroyed() && t.world.isDestroyed(),
    };
  });
  expect(teardown).toEqual({ removed: true, worldLive: true, destroyed: true });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
