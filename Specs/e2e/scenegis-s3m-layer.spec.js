import { test, expect } from "./test.js";

test.use({ launchOptions: { args: [] } });
const runtime = process.env.S3M_RELEASE === "1" ? "Cesium" : "CesiumUnminified";
const samples = [
  ["mesh", "/Test/S3M/data/CBD/cbd.scp", 2],
  ["instances", "/Test/S3M/data/comModel/comModel.scp", Infinity],
];
if (process.env.S3M_OBLIQUE === "1") {
  // Prepare once with node scripts/scenegis/fetch-s3m-sample.mjs.
  samples.push(["oblique", "/Build/s3m-samples/oblique/sample.scp", 1]);
}

for (const planar of [false, true]) {
  for (const [name, url, depth] of samples) {
    test(`S3M layer ${name} ${planar ? "planar" : "globe"} loads LOD, frames, picks and releases`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(90000);
      const errors = [];
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.route(
        /^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/,
        (route) => route.abort(),
      );
      await page.goto("/Specs/e2e/cesium.html");
      await page.evaluate(
        async ({ planar, url, depth, runtime }) => {
          window.CESIUM_BASE_URL = `/Build/${runtime}/`;
          const C = await import(`/Build/${runtime}/index.js`);
          const world = planar
            ? new C.SceneGISPlanarWorld({
                coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
                  extent: new C.SceneGISPlanarExtent({
                    minimumX: 12995000,
                    minimumY: 3995000,
                    maximumX: 13005000,
                    maximumY: 4005000,
                  }),
                }),
                maximumLevel: 0,
                baseColor: C.Color.fromCssColorString("#314452"),
              })
            : undefined;
          const viewer = new C.Viewer("cesiumContainer", {
            ...(world
              ? { world }
              : { baseLayer: false, baseLayerPicker: false, geocoder: false }),
            animation: false,
            timeline: false,
            fullscreenButton: false,
          });
          viewer.scene.environmentEffects.enabled = false;
          viewer.clock.currentTime = C.JulianDate.fromIso8601(
            "2026-10-20T04:00:00Z",
          );
          viewer.clock.shouldAnimate = false;
          const renderErrors = [];
          viewer.scene.renderError.addEventListener((scene, error) =>
            renderErrors.push(String(error)),
          );
          const layer = await C.SceneGISS3MLayer.fromUrl(url, {
            ...(world
              ? {
                  world,
                  modelMatrix: C.Matrix4.fromTranslation(
                    new C.Cartesian3(13000000, 4000000, 0),
                  ),
                }
              : {}),
            maximumDepth: depth,
            maximumCachedTiles: 2,
            lodRangeScale: 100000,
          });
          layer.tileFailed.addEventListener((error, url) =>
            renderErrors.push(`${url}: ${error.message ?? error}`),
          );
          viewer.scene.primitives.add(layer);
          const sphere = layer.boundingSphere;
          viewer.camera.viewBoundingSphere(
            sphere,
            new C.HeadingPitchRange(0.4, -0.7, sphere.radius * 2.6),
          );
          viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
          window.s3mLayerTest = {
            C,
            viewer,
            world,
            layer,
            renderErrors,
            started: performance.now(),
          };
        },
        { planar, url, depth, runtime },
      );
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const { layer } = window.s3mLayerTest;
              return layer.tilesLoaded && layer.statistics.selectedPages > 0;
            }),
          { timeout: 45000 },
        )
        .toBe(true);
      const coarse = await page.evaluate(() => {
        const t = window.s3mLayerTest;
        t.coarseTime = performance.now() - t.started;
        const result = t.layer.statistics;
        t.layer.lodRangeScale = 0.01;
        return result;
      });
      expect(coarse.selectedDepth).toBe(0);
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const { layer } = window.s3mLayerTest;
              return layer.tilesLoaded && layer.statistics.selectedDepth > 0;
            }),
          { timeout: 45000 },
        )
        .toBe(true);
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const remove =
              window.s3mLayerTest.viewer.scene.postRender.addEventListener(
                () => {
                  remove();
                  resolve();
                },
              );
          }),
      );
      const report = await page.evaluate(() => {
        const t = window.s3mLayerTest;
        const { C, viewer, layer } = t;
        const hits = [];
        const requests = layer.statistics.requests;
        const frame = layer._frame;
        for (let y = 90; y < 500 && hits.length < 8; y += 12) {
          for (let x = 180; x < 800 && hits.length < 8; x += 12) {
            const hit = viewer.scene.pick(new C.Cartesian2(x, y));
            if (
              hit?.primitive?.id === layer &&
              typeof hit.getProperty === "function"
            ) {
              hits.push({
                id: hit.getProperty("s3mId"),
                kind: hit.getProperty("idKind"),
                geometry: hit.getProperty("geometry"),
              });
            }
          }
        }
        return {
          coarseMilliseconds: t.coarseTime,
          refinedMilliseconds: performance.now() - t.started,
          statistics: layer.statistics,
          hits,
          errors: t.renderErrors,
          pickStable:
            layer.statistics.requests === requests && layer._frame === frame,
        };
      });
      await page.screenshot({
        path: testInfo.outputPath(`${name}-${planar ? "planar" : "globe"}.png`),
      });
      await testInfo.attach("layer-report", {
        body: JSON.stringify(report, null, 2),
        contentType: "application/json",
      });
      expect(report.errors).toEqual([]);
      expect(errors).toEqual([]);
      expect(report.hits.length).toBeGreaterThan(0);
      expect(report.pickStable).toBe(true);
      if (name !== "oblique") {
        expect(
          report.hits.some((hit) => hit.kind === "object" && hit.id !== ""),
        ).toBe(true);
      }
      const transformed = await page.evaluate(async () => {
        const t = window.s3mLayerTest;
        const { C, viewer, layer } = t;
        const initial = C.Matrix4.clone(layer.modelMatrix);
        const originalCamera = {
          destination: C.Cartesian3.clone(viewer.camera.positionWC),
          orientation: {
            direction: C.Cartesian3.clone(viewer.camera.directionWC),
            up: C.Cartesian3.clone(viewer.camera.upWC),
          },
        };
        const models = [...layer._tiles.values()].flatMap((tile) =>
          tile.pages.map((page) => page.model).filter(Boolean),
        );
        const before = layer.statistics;
        const local = C.Matrix4.fromRotationTranslation(
          C.Matrix3.fromRotationZ(0.35),
          new C.Cartesian3(150, 80, 50),
        );
        C.Matrix4.multiplyByUniformScale(local, 1.2, local);
        layer.modelMatrix = C.Matrix4.multiply(initial, local, new C.Matrix4());
        const delta = C.Matrix4.multiply(
          layer.modelMatrix,
          C.Matrix4.inverse(initial, new C.Matrix4()),
          new C.Matrix4(),
        );
        const direction = C.Matrix4.multiplyByPointAsVector(
          delta,
          originalCamera.orientation.direction,
          new C.Cartesian3(),
        );
        const up = C.Matrix4.multiplyByPointAsVector(
          delta,
          originalCamera.orientation.up,
          new C.Cartesian3(),
        );
        viewer.camera.setView({
          destination: C.Matrix4.multiplyByPoint(
            delta,
            originalCamera.destination,
            new C.Cartesian3(),
          ),
          orientation: {
            direction: C.Cartesian3.normalize(direction, direction),
            up: C.Cartesian3.normalize(up, up),
          },
        });
        await new Promise((resolve) => {
          const remove = viewer.scene.postRender.addEventListener(() => {
            remove();
            resolve();
          });
        });
        const hits = [];
        for (let y = 90; y < 500 && hits.length < 8; y += 12) {
          for (let x = 180; x < 800 && hits.length < 8; x += 12) {
            const hit = viewer.scene.pick(new C.Cartesian2(x, y));
            if (
              hit?.primitive?.id === layer &&
              typeof hit.getProperty === "function"
            ) {
              hits.push({
                id: hit.getProperty("s3mId"),
                kind: hit.getProperty("idKind"),
              });
            }
          }
        }
        t.restoreTransform = { initial, originalCamera, models };
        return {
          hits,
          before,
          after: layer.statistics,
          applied: models.every((model) =>
            C.Matrix4.equals(model.modelMatrix, layer.modelMatrix),
          ),
          retained: models.every((model) => !model.isDestroyed()),
          errors: t.renderErrors,
        };
      });
      await page.screenshot({
        path: testInfo.outputPath(
          `${name}-${planar ? "planar" : "globe"}-transformed.png`,
        ),
      });
      await testInfo.attach("transform-report", {
        body: JSON.stringify(transformed, null, 2),
        contentType: "application/json",
      });
      expect(transformed.errors).toEqual([]);
      expect(transformed.applied && transformed.retained).toBe(true);
      expect(transformed.after).toEqual(transformed.before);
      expect(transformed.hits.length).toBeGreaterThan(0);
      expect(
        transformed.hits.some((hit) =>
          report.hits.some(
            (original) => original.id === hit.id && original.kind === hit.kind,
          ),
        ),
      ).toBe(true);
      const restored = await page.evaluate(async () => {
        const { C, viewer, layer, restoreTransform } = window.s3mLayerTest;
        const { initial, originalCamera, models } = restoreTransform;
        C.Matrix4.clone(initial, layer.modelMatrix);
        viewer.camera.setView(originalCamera);
        viewer.scene.requestRender();
        await new Promise((resolve) => {
          const remove = viewer.scene.postRender.addEventListener(() => {
            remove();
            resolve();
          });
        });
        return models.every((model) =>
          C.Matrix4.equals(model.modelMatrix, initial),
        );
      });
      expect(restored).toBe(true);
      await page.evaluate(() => {
        const t = window.s3mLayerTest;
        t.viewer.scene.environmentEffects.enabled = true;
        t.viewer.scene.environmentEffects.errorEvent.addEventListener((error) =>
          t.renderErrors.push(String(error)),
        );
      });
      await expect
        .poll(
          () =>
            page.evaluate(
              () => window.s3mLayerTest.viewer.scene.environmentEffects.ready,
            ),
          { timeout: 45000 },
        )
        .toBe(true);
      const warm = await page.evaluate(async () => {
        const t = window.s3mLayerTest;
        const before = t.layer.statistics;
        let frames = 0;
        await new Promise((resolve) => {
          const remove = t.viewer.scene.postRender.addEventListener(() => {
            if (++frames === 12) {
              remove();
              resolve();
            }
          });
        });
        return {
          before,
          after: t.layer.statistics,
          errors: t.renderErrors,
        };
      });
      await testInfo.attach("warm-report", {
        body: JSON.stringify(warm),
        contentType: "application/json",
      });
      expect(warm.errors).toEqual([]);
      expect(warm.after).toEqual(warm.before);
      await page.screenshot({
        path: testInfo.outputPath(
          `${name}-${planar ? "planar" : "globe"}-environment.png`,
        ),
      });
      const lifecycle = await page.evaluate(async () => {
        const t = window.s3mLayerTest;
        const models = [...t.layer._tiles.values()].flatMap((tile) =>
          tile.pages.map((page) => page.model).filter(Boolean),
        );
        const worker = t.layer._worker;
        t.layer.lodRangeScale = 100000;
        await new Promise((resolve) => {
          const remove = t.viewer.scene.postRender.addEventListener(() => {
            remove();
            resolve();
          });
        });
        const coarseAgain = t.layer.statistics;
        t.viewer.scene.primitives.remove(t.layer);
        const result = {
          coarseAgain,
          layer: t.layer.isDestroyed(),
          worker: worker.isDestroyed(),
          models: models.every((model) => model.isDestroyed()),
          worldAlive: !t.viewer.scene.world.isDestroyed(),
        };
        t.viewer.destroy();
        return result;
      });
      expect(lifecycle.coarseAgain.selectedDepth).toBe(0);
      expect(lifecycle.coarseAgain.cachedTiles).toBeLessThanOrEqual(2);
      expect(
        lifecycle.layer &&
          lifecycle.worker &&
          lifecycle.models &&
          lifecycle.worldAlive,
      ).toBe(true);
    });
  }
}
