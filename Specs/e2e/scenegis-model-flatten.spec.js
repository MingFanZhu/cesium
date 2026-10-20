import { test, expect } from "@playwright/test";

async function frame(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const scene = window.flattenExample.viewer.scene;
        const off = scene.postRender.addEventListener(() => {
          off();
          resolve();
        });
        scene.requestRender();
      }),
  );
}

async function heights(page, positions) {
  return page.evaluate((positions) => {
    const { C, viewer, frame, tileset } = window.flattenExample;
    const inverse = C.Matrix4.inverseTransformation(frame, new C.Matrix4());
    return positions.map(([x, y, z]) => {
      const p = C.Matrix4.multiplyByPoint(
        frame,
        new C.Cartesian3(x, y, z),
        new C.Cartesian3(),
      );
      const screen = C.SceneTransforms.worldToWindowCoordinates(
        viewer.scene,
        p,
      );
      const hit = viewer.scene.pick(screen);
      const depth = viewer.scene.pickPosition(screen);
      return {
        picked: !!hit,
        z: depth
          ? C.Matrix4.multiplyByPoint(inverse, depth, new C.Cartesian3()).z
          : null,
        selected: tileset._selectedTiles.length,
      };
    });
  }, positions);
}

for (const world of ["planar", "globe"]) {
  test(`${world}: flatten mesh respects concavity, holes, transformed tiles and bounds`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(
      /^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/,
      (route) => route.abort(),
    );
    if (process.env.FLATTEN_RELEASE === "1") {
      await page.route("**/Build/CesiumUnminified/**", (route) =>
        route.continue({
          url: route.request().url().replace("/CesiumUnminified/", "/Cesium/"),
        }),
      );
    }
    await page.goto(`/Test/模型压平.html?world=${world}&sample=grid`);
    await page.waitForFunction(
      () =>
        window.flattenExample?.ready &&
        window.flattenExample.tileset.tilesLoaded,
    );
    await page.selectOption("#shape", "concave");
    await page.uncheck("#outline");
    await page.evaluate(() => {
      const t = window.flattenExample;
      t.home(true);
      t.flatten.enabled = false;
    });
    await frame(page);
    await page.waitForFunction(
      () => window.flattenExample.tileset._selectedTiles.length === 2,
    );
    const samples = [
      [-40, 40, 28],
      [-35, -15, 25.75],
      [40, 30, 35.5],
      [85, 80, 42.5],
    ];
    const original = await heights(page, samples);
    original.forEach((r, i) => {
      expect(r.picked).toBe(true);
      expect(r.z).toBeCloseTo(samples[i][2], 0);
    });
    await page.evaluate(() => {
      window.flattenExample.flatten.enabled = true;
    });
    await frame(page);
    const changed = await heights(page, [[-40, 40, 5], ...samples.slice(1)]);
    expect(changed[0].z).toBeCloseTo(5, 1);
    for (let i = 1; i < samples.length; i++) {
      expect(changed[i].z).toBeCloseTo(samples[i][2], 0);
    }
    await page.screenshot({
      path: testInfo.outputPath(`${world}-flatten-grid.png`),
    });
    const warm = await page.evaluate(() => {
      const t = window.flattenExample;
      const shader = t.flatten;
      const texture = shader._textureManager.getTexture("u_sgFlattenEdges");
      t.warmTexture = texture;
      t.loaded = t.tileset._statistics.numberOfLoadedTilesTotal;
      const source = t.tileset.root._boundingVolume.boundingSphere;
      const timings = [];
      for (let i = 0; i < 200; i++) {
        const start = performance.now();
        for (let j = 0; j < 100; j++) {
          t.C.SceneGISModelFlatten._tileBounds(
            shader,
            t.tileset.root._boundingVolume,
          );
        }
        timings.push(performance.now() - start);
      }
      timings.sort((a, b) => a - b);
      return {
        textureBytes: texture.sizeInBytes,
        median100Queries: timings[100],
        p95: timings[190],
        sourceRadius: source.radius,
      };
    });
    expect(warm.textureBytes).toBe(8192);
    await page.evaluate(() => {
      window.flattenExample.flatten.height = 170;
    });
    await frame(page);
    const raised = await heights(page, [[-40, 40, 170]]);
    expect(raised[0].z).toBeCloseTo(170, 1);
    const resources = await page.evaluate(() => {
      const t = window.flattenExample;
      return {
        sameTexture:
          t.flatten._textureManager.getTexture("u_sgFlattenEdges") ===
          t.warmTexture,
        loaded: t.tileset._statistics.numberOfLoadedTilesTotal === t.loaded,
        sourceRadius: t.tileset.root._boundingVolume.boundingSphere.radius,
        expandedRadius: t.tileset.boundingSphere.radius,
      };
    });
    expect(resources.sameTexture).toBe(true);
    expect(resources.loaded).toBe(true);
    expect(resources.sourceRadius).toBe(warm.sourceRadius);
    expect(resources.expandedRadius).toBeGreaterThan(warm.sourceRadius);
    // Only the raised geometry intersects this narrow horizontal view.
    await page.evaluate(() => {
      const { C, viewer, frame } = window.flattenExample;
      viewer.camera.setView({
        destination: C.Matrix4.multiplyByPoint(
          frame,
          new C.Cartesian3(-40, -230, 190),
          new C.Cartesian3(),
        ),
        orientation: {
          direction: C.Matrix4.multiplyByPointAsVector(
            frame,
            new C.Cartesian3(0, 1, -0.08),
            new C.Cartesian3(),
          ),
          up: C.Matrix4.multiplyByPointAsVector(
            frame,
            C.Cartesian3.UNIT_Z,
            new C.Cartesian3(),
          ),
        },
      });
      viewer.camera.frustum.fov = 0.18;
    });
    await frame(page);
    const narrow = await heights(page, [[-40, 40, 170]]);
    expect(narrow[0].picked).toBe(true);
    expect(narrow[0].z).toBeCloseTo(170, 0);
    await page.evaluate(() => {
      const t = window.flattenExample;
      t.viewer.camera.frustum.fov = Math.PI / 3;
      t.home(true);
      t.flatten.enabled = false;
    });
    await frame(page);
    const restored = await heights(page, samples);
    restored.forEach((r, i) => expect(r.z).toBeCloseTo(samples[i][2], 0));
    // Native LOD remains selectable; re-enable on a coarse mesh.
    await page.check("#coarse");
    await page.waitForFunction(
      () => window.flattenExample.tileset._selectedTiles.length === 1,
    );
    await page.evaluate(() => {
      const t = window.flattenExample;
      t.flatten.height = 5;
      t.flatten.enabled = true;
    });
    await frame(page);
    expect((await heights(page, [[-40, 40, 5]]))[0].z).toBeCloseTo(5, 1);
    const disposed = await page.evaluate(() => {
      const t = window.flattenExample;
      const texture = t.warmTexture;
      const renderErrors = [...t.errors];
      t.dispose();
      return {
        renderErrors,
        textureDestroyed: texture.isDestroyed(),
        shaderDestroyed: t.flatten.isDestroyed(),
      };
    });
    expect(disposed).toEqual({
      renderErrors: [],
      textureDestroyed: true,
      shaderDestroyed: true,
    });
    expect(errors).toEqual([]);
    await testInfo.attach("warm-cost", {
      body: JSON.stringify(warm),
      contentType: "application/json",
    });
  });

  test(`${world}: local photogrammetry flatten example renders`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route(
      /^https?:\/\/(?!localhost[:/]|127\.0\.0\.1[:/])/,
      (route) => route.abort(),
    );
    if (process.env.FLATTEN_RELEASE === "1") {
      await page.route("**/Build/CesiumUnminified/**", (route) =>
        route.continue({
          url: route.request().url().replace("/CesiumUnminified/", "/Cesium/"),
        }),
      );
    }
    await page.goto(`/Test/模型压平.html?world=${world}`);
    await page.waitForFunction(
      () =>
        window.flattenExample?.ready &&
        window.flattenExample.tileset.tilesLoaded,
    );
    await page.selectOption("#shape", "rectangle");
    await page.locator("#size").fill("140");
    await page.locator("#size").dispatchEvent("change");
    await frame(page);
    await page.screenshot({
      path: testInfo.outputPath(`${world}-photogrammetry.png`),
    });
    expect(await page.evaluate(() => window.flattenExample.errors)).toEqual([]);
    expect(
      await page.evaluate(
        () => window.flattenExample.tileset._selectedTiles.length,
      ),
    ).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}
