import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

const fixtures = new URL("../../Test/vector-tiles/", import.meta.url);

async function vectorRoutes(page) {
  const [tile, font, spriteJson, spritePng] = await Promise.all(
    [
      "public-fixture.pbf",
      "symbol-assets/0-255.pbf",
      "line-symbol-assets/sprite.json",
      "line-symbol-assets/sprite.png",
    ].map((name) => readFile(new URL(name, fixtures))),
  );
  let release;
  const metadata = new Promise((resolve) => {
    release = resolve;
  });
  const observed = { metadata: 0, tiles: 0, unexpected: [], release };
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.protocol === "data:") {
      return route.continue();
    }
    if (url.hostname === "tiles.openfreemap.org") {
      if (url.pathname === "/planet") {
        observed.metadata++;
        await metadata;
        return route.fulfill({
          json: {
            tiles: ["https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf"],
            minzoom: 0,
            maxzoom: 14,
            attribution: "SceneGIS deterministic vector fixture",
          },
        });
      }
      if (url.pathname.startsWith("/fonts/")) {
        return route.fulfill({
          body: font,
          contentType: "application/x-protobuf",
        });
      }
      if (url.pathname.startsWith("/sprites/")) {
        const json = url.pathname.endsWith(".json");
        return route.fulfill({
          body: json ? spriteJson : spritePng,
          contentType: json ? "application/json" : "image/png",
        });
      }
      if (url.pathname.startsWith("/test/")) {
        observed.tiles++;
        return route.fulfill({
          body: tile,
          contentType: "application/x-protobuf",
        });
      }
    }
    observed.unexpected.push(url.origin);
    return route.abort();
  });
  return observed;
}

for (const world of ["globe", "planar"]) {
  test(`Integrated vectors ${world}: drawing, controls and lifecycle`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const observed = await vectorRoutes(page);
    await page.goto(`/Test/AdvancedEnvironment/综合环境.html?world=${world}`);
    await page.waitForFunction(() => window.example?.effects.ready);
    expect(observed.metadata).toBe(0);
    expect(observed.tiles).toBe(0);
    await page.evaluate(async (world) => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const v = window.example.viewer;
      v.clock.shouldAnimate = false;
      v.clock.currentTime = C.JulianDate.fromIso8601("2026-10-19T04:00:00Z");
      const projection = new C.WebMercatorProjection();
      const matrix = new C.WebMercatorTilingScheme();
      const tile = matrix.positionToTileXY(
        C.Cartographic.fromDegrees(118.7969, 32.0603),
        14,
      );
      const bounds = matrix.tileXYToNativeRectangle(tile.x, tile.y, 14);
      // Center the authored fixture's POI at a visible street-scale view.
      const projected = new C.Cartesian3(
        bounds.west + ((bounds.east - bounds.west) * 2400) / 4096,
        bounds.north - ((bounds.north - bounds.south) * 2400) / 4096,
        250,
      );
      const center = projection.unproject(projected);
      const destination =
        world === "globe"
          ? C.Cartesian3.fromRadians(
              center.longitude,
              center.latitude,
              center.height,
            )
          : projected;
      v.camera.setView({
        destination,
        orientation:
          world === "globe"
            ? { heading: 0, pitch: -Math.PI / 2, roll: 0 }
            : {
                direction: new C.Cartesian3(0, 0, -1),
                up: new C.Cartesian3(0, 1, 0),
              },
      });
    }, world);
    await page.getByRole("button", { name: /矢量验收$/ }).click();
    const enabled = page.getByLabel("显示矢量图层", { exact: true });
    await enabled.check();
    await expect.poll(() => observed.metadata).toBe(1);
    // Completing metadata after hiding must not publish a visible layer.
    await enabled.uncheck();
    observed.release();
    await page.waitForFunction(() => !!window.example.vectors.layer);
    expect(await page.evaluate(() => window.example.vectors.layer.show)).toBe(
      false,
    );
    await enabled.check();
    await page.waitForFunction(() => {
      const layer = window.example.vectors.layer;
      return layer.tilesLoaded && layer.statistics.renderedTiles > 0;
    });
    const rendered = await page.evaluate(() => {
      const layer = window.example.vectors.layer;
      window.originalVectorLayer = layer;
      return {
        stats: layer.statistics,
        background: layer.getLayoutProperty("background", "visibility"),
      };
    });
    expect(rendered.stats.failedTiles).toBe(0);
    expect(rendered.stats.renderedTiles).toBeGreaterThan(0);
    expect(rendered.stats.drawCommands).toBeGreaterThan(0);
    expect(rendered.stats.placedSymbols).toBeGreaterThan(0);
    expect(rendered.background).toBe("none");
    expect(
      await page.evaluate(() => {
        const layer = window.example.vectors.layer;
        return {
          waterType: layer.getStyle().layers.find((item) => item.id === "water")
            .type,
          physicalWater: layer._drawOrder.some((batch) => batch._sceneGISWater),
        };
      }),
    ).toEqual({ waterType: "fill", physicalWater: false });
    if (world === "globe") {
      // Exercise the native picker branch that disables depth for Ellipsoid.
      expect(
        await page.evaluate(() => {
          const { viewer } = window.example;
          const picker = viewer.baseLayerPicker.viewModel;
          picker.selectedTerrain = undefined;
          picker.selectedTerrain = picker.terrainProviderViewModels.find(
            (item) => item.name === "WGS84 Ellipsoid",
          );
          return viewer.scene.globe.depthTestAgainstTerrain;
        }),
      ).toBe(true);
    }
    const opacity = page.getByLabel("矢量不透明度", { exact: true });
    await opacity.fill("0.45");
    await opacity.press("Tab");
    await page.getByLabel("显示地图底色", { exact: true }).check();
    await enabled.uncheck();
    await enabled.check();
    await page
      .getByRole("button", { name: "恢复环境默认值", exact: true })
      .click();
    await page.waitForFunction(() => window.example.vectors.layer.tilesLoaded);
    expect(
      await page.evaluate(() => {
        const layer = window.example.vectors.layer;
        return {
          same: layer === window.originalVectorLayer,
          opacity: layer.opacity,
          background: layer.getLayoutProperty("background", "visibility"),
        };
      }),
    ).toEqual({ same: true, opacity: 0.45, background: "visible" });
    await expect(page.locator("#vectorError")).toBeEmpty();
    await expect(page.locator("#error")).toBeEmpty();
    await page.screenshot({ path: info.outputPath(`${world}-vectors.png`) });
    const disposed = await page.evaluate(() => {
      const { viewer, vectors } = window.example;
      const layer = vectors.layer;
      const errorEvent = layer.errorEvent;
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      );
      const retained = !viewer.isDestroyed() && !layer.isDestroyed();
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: false }),
      );
      window.example.destroy();
      return {
        retained,
        viewer: viewer.isDestroyed(),
        layer: layer.isDestroyed(),
        listeners: errorEvent.numberOfListeners,
      };
    });
    expect(disposed).toEqual({
      retained: true,
      viewer: true,
      layer: true,
      listeners: 0,
    });
    expect(observed.unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("Integrated vectors: destruction during metadata loading prevents late layer creation", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const observed = await vectorRoutes(page);
  await page.goto("/Test/AdvancedEnvironment/综合环境.html?world=globe");
  await page.waitForFunction(() => !!window.example);
  await page.getByRole("button", { name: /矢量验收$/ }).click();
  await page.getByLabel("显示矢量图层", { exact: true }).check();
  await expect.poll(() => observed.metadata).toBe(1);
  const aborted = page.waitForEvent("requestfailed", {
    predicate: (request) => new URL(request.url()).pathname === "/planet",
  });
  await page.evaluate(() => window.example.destroy());
  await aborted;
  observed.release();
  expect(
    await page.evaluate(() => ({
      destroyed: window.example.viewer.isDestroyed(),
      layer: window.example.vectors.layer === undefined,
      error: document.querySelector("#vectorError").textContent,
    })),
  ).toEqual({ destroyed: true, layer: true, error: "" });
  expect(errors).toEqual([]);
});
