import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test.describe.configure({ retries: 0 });
test.use({
  viewport: { width: 1280, height: 800 },
  launchOptions: { args: [] },
});
const fixtureRoot = new URL("../../Test/vector-tiles/", import.meta.url);

async function routes(page) {
  const [tile, bright, liberty] = await Promise.all([
    readFile(new URL("public-fixture.pbf", fixtureRoot)),
    readFile(new URL("reference/openfreemap-bright.json", fixtureRoot)),
    readFile(new URL("reference/openfreemap-liberty.json", fixtureRoot)),
  ]);
  const styles = { "/styles/bright": bright, "/styles/liberty": liberty };
  const observed = {
    tileRequests: 0,
    unexpected: [],
    failMetadata: false,
  };
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.protocol === "data:") {
      return route.continue();
    }
    if (url.hostname === "tiles.openfreemap.org") {
      if (Object.hasOwn(styles, url.pathname)) {
        return route.fulfill({
          body: styles[url.pathname],
          contentType: "application/json",
        });
      }
      if (url.pathname === "/planet") {
        if (observed.failMetadata) {
          return route.fulfill({
            status: 503,
            json: { message: "Test service unavailable" },
          });
        }
        return route.fulfill({
          json: {
            tiles: ["https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf"],
            minzoom: 0,
            maxzoom: 14,
            attribution: "SceneGIS deterministic schema fixture",
          },
        });
      }
      if (url.pathname.endsWith(".pbf")) {
        observed.tileRequests++;
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
async function ready(page) {
  await page.waitForFunction(
    () => window.publicVectorPreview?.layer?.tilesLoaded,
  );
  await expect(page.locator("#error")).toBeEmpty();
}

test("renders the public-map page with deterministic data, picking, tilt and resource recreation", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const observed = await routes(page);
  await page.goto("/Test/vector-tiles/public.html");
  await ready(page);
  await expect(page.locator("#support-summary")).toHaveText(
    "93 / 119 个样式层已接入",
  );
  expect(
    await page.evaluate(
      () => window.publicVectorPreview.layer.statistics.failedTiles,
    ),
  ).toBe(0);
  const canvas = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(canvas.x + canvas.width * 0.43, canvas.height * 0.4);
  await expect(page.locator("#picked")).toContainText("SceneGIS test");
  await page.getByRole("button", { name: "测量 60 帧" }).click();
  await page.waitForFunction(
    () => window.publicVectorPreview.measurement !== undefined,
  );
  const measurement = await page.evaluate(
    () => window.publicVectorPreview.measurement,
  );
  expect(measurement.receivedBytes).toBeGreaterThan(0);
  expect(measurement.features).toBeGreaterThan(0);
  expect(measurement.statistics.drawCommands).toBeGreaterThan(0);
  await page.getByRole("button", { name: "倾斜", exact: true }).click();
  await ready(page);
  await page.screenshot({
    path: testInfo.outputPath("public-fixture-tilted.png"),
  });
  await page.evaluate(() => {
    window.oldPublicLayer = window.publicVectorPreview.layer;
  });
  await page.getByRole("button", { name: "重建图层" }).click();
  await ready(page);
  expect(await page.evaluate(() => window.oldPublicLayer.isDestroyed())).toBe(
    true,
  );
  expect(observed.tileRequests).toBeGreaterThan(0);
  expect(observed.unexpected).toEqual([]);
  expect(errors).toEqual([]);
});

test("switches between Bright and Liberty and preserves the map when the public service fails", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const observed = await routes(page);
  await page.goto("/Test/vector-tiles/public.html");
  await ready(page);
  await expect(page.locator("#map-title")).toContainText("Bright");
  await page.evaluate(() => {
    window.oldPublicLayer = window.publicVectorPreview.layer;
  });
  await page.selectOption("#provider", "liberty");
  await page.getByRole("button", { name: "加载地图" }).click();
  await expect(page.locator("#map-title")).toContainText("Liberty");
  await ready(page);
  expect(await page.evaluate(() => window.oldPublicLayer.isDestroyed())).toBe(
    true,
  );
  await expect(page.locator("#support-summary")).toHaveText(
    "82 / 111 个样式层已接入",
  );
  expect(
    await page.evaluate(() => window.publicVectorPreview.layer.style.layerIds),
  ).toContain("water");
  await page.getByRole("button", { name: "街道细节" }).click();
  await page.waitForFunction(
    () =>
      window.publicVectorPreview.layer.statistics.zoom > 15.9 &&
      window.publicVectorPreview.layer.tilesLoaded,
  );
  await expect(page.locator("#error")).toBeEmpty();
  await page.evaluate(() => {
    window.oldPublicLayer = window.publicVectorPreview.layer;
  });
  observed.failMetadata = true;
  await page.selectOption("#provider", "bright");
  await page.getByRole("button", { name: "加载地图" }).click();
  await expect(page.locator("#error")).toContainText("HTTP 503");
  await expect(page.locator("#map-title")).toContainText("Liberty");
  expect(
    await page.evaluate(
      () =>
        window.oldPublicLayer === window.publicVectorPreview.layer &&
        !window.oldPublicLayer.isDestroyed(),
    ),
  ).toBe(true);
  expect(observed.unexpected).toEqual([]);
  expect(errors).toEqual([]);
});
