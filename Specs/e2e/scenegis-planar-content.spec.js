import { test, expect } from "./test.js";

test("qualifies automatic planar content, dynamic update, selection, and destroy", async ({
  cesiumPage,
  page,
}) => {
  const externalAttempts = [];
  const pageErrors = [];
  const consoleErrors = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    ) {
      externalAttempts.push(request.url());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" &&
      !text.startsWith("Blocked script execution in 'about:blank'")
    ) {
      consoleErrors.push(text);
    }
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });
  await page.addInitScript({
    content: `window.CESIUM_BASE_URL = "${process.env.release ? "../../Build/Cesium/" : "../../Build/CesiumUnminified/"}";`,
  });
  await cesiumPage.goto();
  await page.evaluate(async () => {
    await Cesium.ApproximateTerrainHeights.initialize();
  });

  const initial = await page.evaluate(async () => {
    const world = new Cesium.SceneGISPlanarWorld({
      coordinateSystem: new Cesium.SceneGISPlanarCoordinateSystem({
        extent: new Cesium.SceneGISPlanarExtent({
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        }),
        crs: "LOCAL:METERS",
      }),
      maximumLevel: 0,
      baseColor: Cesium.Color.BLACK,
    });
    const viewer = new Cesium.Viewer("cesiumContainer", {
      world,
      useDefaultRenderLoop: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
    });
    viewer.scene.highDynamicRange = false;
    viewer.scene.camera.setView({
      destination: new Cesium.Cartesian3(0.0, 0.0, 256.0),
      orientation: {
        direction: new Cesium.Cartesian3(0.0, 0.0, -1.0),
        up: Cesium.Cartesian3.UNIT_Y,
      },
    });
    const image = document.createElement("canvas");
    image.width = 8;
    image.height = 8;
    image.getContext("2d").fillRect(0, 0, 8, 8);
    const source = new Cesium.CustomDataSource("c5-local-content");
    const point = source.entities.add({
      id: "e2e-point",
      position: new Cesium.Cartesian3(0.0, 0.0, 10.0),
      point: { pixelSize: 28.0, color: Cesium.Color.RED },
    });
    source.entities.add({
      id: "e2e-billboard",
      position: new Cesium.Cartesian3(-50.0, 0.0, 10.0),
      billboard: { image, width: 16.0, height: 16.0 },
    });
    source.entities.add({
      id: "e2e-label",
      position: new Cesium.Cartesian3(50.0, 0.0, 10.0),
      label: { text: "C5 local", fillColor: Cesium.Color.YELLOW },
    });
    source.entities.add({
      id: "e2e-model",
      position: new Cesium.Cartesian3(0.0, 50.0, 10.0),
      model: {
        uri: "../../Apps/SampleData/models/CesiumMan/Cesium_Man.glb",
        scale: 5.0,
        minimumPixelSize: 20.0,
      },
    });
    source.entities.add({
      id: "e2e-line",
      polyline: {
        positions: [
          new Cesium.Cartesian3(-60.0, -50.0, 5.0),
          new Cesium.Cartesian3(60.0, -50.0, 5.0),
        ],
        width: 4,
        material: Cesium.Color.CYAN,
        arcType: Cesium.ArcType.NONE,
      },
    });
    source.entities.add({
      id: "e2e-polygon",
      position: new Cesium.Cartesian3(0.0, 0.0, 6.0),
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy([
          new Cesium.Cartesian3(-30.0, 55.0, 0.0),
          new Cesium.Cartesian3(30.0, 55.0, 0.0),
          new Cesium.Cartesian3(30.0, 100.0, 0.0),
          new Cesium.Cartesian3(-30.0, 100.0, 0.0),
        ]),
        height: 6.0,
        material: Cesium.Color.LIME,
      },
    });
    await viewer.dataSources.add(source);
    for (let frame = 0; frame < 20; ++frame) {
      viewer.dataSourceDisplay.update(viewer.clock.currentTime);
      viewer.render();
      await Promise.resolve();
    }
    const visualizers = source._visualizers;
    let modelReady = false;
    for (let attempt = 0; attempt < 100 && !modelReady; ++attempt) {
      viewer.dataSourceDisplay.update(viewer.clock.currentTime);
      viewer.render();
      modelReady = visualizers[2]._items.get("e2e-model")?.model !== undefined;
      if (!modelReady) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    const centerWindow = Cesium.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      new Cesium.Cartesian3(0.0, 0.0, 10.0),
    );
    const picked = viewer.scene.pick(centerWindow)?.id;
    window.scenegisC5 = {
      viewer,
      world,
      source,
      point,
      visualizers,
      centerWindow,
    };
    return {
      visualizerCount: visualizers.length,
      anchorCount: visualizers[1]._items.length,
      modelCount: visualizers[2]._items.length,
      lineCount: visualizers[3]._items.length,
      polygonCount: visualizers[4]._items.length,
      modelReady,
      picked: picked?.id,
      centerWindow: [centerWindow.x, centerWindow.y],
    };
  });

  expect(initial).toMatchObject({
    visualizerCount: 5,
    anchorCount: 3,
    modelCount: 1,
    lineCount: 1,
    polygonCount: 1,
    modelReady: true,
    picked: "e2e-point",
  });
  await page.mouse.click(initial.centerWindow[0], initial.centerWindow[1]);
  expect(
    await page.evaluate(() => window.scenegisC5.viewer.selectedEntity?.id),
  ).toBe("e2e-point");

  const dynamic = await page.evaluate(() => {
    const { viewer, point, visualizers } = window.scenegisC5;
    point.position = new Cesium.Cartesian3(20.0, 0.0, 15.0);
    viewer.dataSourceDisplay.update(viewer.clock.currentTime);
    viewer.render();
    const slot = visualizers[1]._items.get(point.id).point;
    return [slot.position.x, slot.position.y, slot.position.z];
  });
  expect(dynamic).toEqual([20, 0, 15]);

  const removed = await page.evaluate(() => {
    const { viewer, source, point, visualizers } = window.scenegisC5;
    source.entities.remove(point);
    viewer.dataSourceDisplay.update(viewer.clock.currentTime);
    viewer.render();
    return visualizers[1]._items.get(point.id);
  });
  expect(removed).toBeUndefined();

  const destroyed = await page.evaluate(() => {
    const { viewer, world } = window.scenegisC5;
    const controllerHost = viewer.scene.controllerHost;
    viewer.destroy();
    return {
      viewer: viewer.isDestroyed(),
      world: world.isDestroyed(),
      controllerCount: controllerHost.controllerCount,
      children: document.getElementById("cesiumContainer").children.length,
    };
  });
  expect(destroyed).toEqual({
    viewer: true,
    world: true,
    controllerCount: 0,
    children: 0,
  });
  expect(externalAttempts).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
