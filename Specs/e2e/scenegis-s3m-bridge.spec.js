import { test, expect } from "./test.js";

// Let ANGLE select the host backend; forcing desktop GL disables WebGL on Windows.
test.use({ launchOptions: { args: [] } });

const samples = [
  [
    "mesh",
    "/Test/S3M/data/CBD/Tile_-14624_42667_0000/Tile_-14624_42667_0000.s3mb",
  ],
  [
    "instances",
    "/Test/S3M/data/comModel/Tile_-166159_525382_0000/Tile_-166159_525382_0000_0000_0000.s3mb",
  ],
];

for (const [name, url] of samples) {
  test(`S3M Worker bridge renders and picks ${name} through native Model`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);
    await page.goto("/Specs/e2e/cesium.html");
    await page.evaluate(
      async ({ url }) => {
        window.CESIUM_BASE_URL = "/Build/CesiumUnminified/";
        const C = await import("/Build/CesiumUnminified/index.js");
        const world = new C.SceneGISPlanarWorld({
          coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
            extent: new C.SceneGISPlanarExtent({
              minimumX: -2000,
              minimumY: -2000,
              maximumX: 2000,
              maximumY: 2000,
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
        const errors = [];
        viewer.scene.renderError.addEventListener((scene, error) =>
          errors.push(String(error)),
        );
        const worker = new C.TaskProcessor("SceneGISS3mWorker");
        const buffer = await (await fetch(url)).arrayBuffer();
        const result = await worker.scheduleTask({ buffer }, [buffer]);
        const models = [];
        for (const p of result.pages) {
          if (!p.glb) {
            continue;
          }
          const model = await C.Model.fromGltfAsync({
            gltf: p.glb,
            basePath: `${url}?scenegisS3mPage=${models.length}`,
            upAxis: C.Axis.Z,
            forwardAxis: C.Axis.X,
            featureIdLabel: "s3m",
            instanceFeatureIdLabel: "s3m",
            environmentMapOptions: { enabled: false },
          });
          viewer.scene.primitives.add(model);
          models.push(model);
        }
        window.s3mBridge = {
          C,
          viewer,
          worker,
          models,
          errors,
          transferred: buffer.byteLength === 0,
        };
      },
      { url },
    );
    await expect
      .poll(
        () =>
          page.evaluate(() => window.s3mBridge.models.every((m) => m.ready)),
        { timeout: 45000 },
      )
      .toBe(true);
    await page.evaluate(() => {
      const { C, viewer, models } = window.s3mBridge;
      const sphere = C.BoundingSphere.fromBoundingSpheres(
        models.map((m) => m.boundingSphere),
      );
      window.s3mBridge.sphere = sphere;
      viewer.camera.viewBoundingSphere(
        sphere,
        new C.HeadingPitchRange(0.4, -0.7, sphere.radius * 3),
      );
      viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
    });
    // Wait for the new camera frame, rather than sampling the old framebuffer.
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const remove =
            window.s3mBridge.viewer.scene.postRender.addEventListener(() => {
              remove();
              resolve();
            });
        }),
    );
    const report = await page.evaluate(() => {
      const { C, viewer, models, errors, transferred } = window.s3mBridge;
      const picked = [];
      for (let y = 120; y < 460 && picked.length < 4; y += 20) {
        for (let x = 200; x < 760 && picked.length < 4; x += 20) {
          const hit = viewer.scene.pick(new C.Cartesian2(x, y));
          if (hit && typeof hit.getProperty === "function") {
            picked.push({
              id: hit.getProperty("s3mId"),
              kind: hit.getProperty("idKind"),
            });
          }
        }
      }
      return {
        errors,
        transferred,
        picked,
        commands: models.map((m) => ({
          bytes: m.statistics.geometryByteLength,
          sphere: m.boundingSphere,
        })),
        camera: viewer.camera.positionWC,
        sphere: window.s3mBridge.sphere,
      };
    });
    await page.screenshot({ path: testInfo.outputPath(`s3m-${name}.png`) });
    await testInfo.attach("bridge-report", {
      body: JSON.stringify(report),
      contentType: "application/json",
    });
    expect(report.errors).toEqual([]);
    expect(report.transferred).toBe(true);
    expect(report.picked.length).toBeGreaterThan(0);
    expect(
      report.picked.some((p) => p.kind === "object" && p.id.length > 0),
    ).toBe(true);
    expect(
      await page.evaluate(() => {
        const t = window.s3mBridge;
        t.worker.destroy();
        t.viewer.destroy();
        return t.models.every((m) => m.isDestroyed()) && t.worker.isDestroyed();
      }),
    ).toBe(true);
  });
}
