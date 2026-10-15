import { test, expect } from "./test.js";

test.describe.configure({ retries: 0 });
test.use({ launchOptions: { args: [] } });

for (const build of ["dev", "release"]) {
  test(`settles sparse planar imagery and coarse views in ${build}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors = [];
    const missing = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("response", (response) => {
      if (
        response.status() === 404 &&
        response.url().includes("missing-tile.png")
      ) {
        missing.push(response.url());
      }
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        build === "release" &&
        url.pathname === "/Build/CesiumUnminified/index.js"
      ) {
        url.pathname = "/Build/Cesium/index.js";
        return route.continue({ url: url.toString() });
      }
      return url.hostname === "localhost" || url.protocol === "data:"
        ? route.continue()
        : route.abort();
    });
    await page.goto("/Test/Planar/局部影像.html");
    await page.waitForFunction(
      () =>
        window.example?.requests.length > 0 && window.example.world.tilesLoaded,
    );
    expect(missing.length).toBeGreaterThan(0);
    await expect(page.locator("#error")).toHaveText("");
    const near = await page.evaluate(() => {
      const { world, requests } = window.example;
      return {
        requests: requests.slice(),
        commands: world._surface._renderCommands.length,
        tiles: world._surface._quadtree._renderTiles.length,
      };
    });
    expect(near.requests.every((address) => address.startsWith("2/"))).toBe(
      true,
    );
    expect(new Set(near.requests).size).toBe(near.requests.length);
    expect(near.commands).toBe(near.tiles);
    await page.screenshot({
      path: `Build/Specs/e2e/planar-sparse-${build}.png`,
    });
    await page.locator("#far").click();
    await page.waitForFunction(() => {
      const { world } = window.example;
      return (
        world.tilesLoaded &&
        world._surface._quadtree._renderTiles.every((tile) => tile.level < 2)
      );
    });
    const far = await page.evaluate(() => {
      const { world, requests } = window.example;
      return {
        count: requests.length,
        excluded: world._surface._quadtree._renderTiles.every((tile) =>
          [...tile.imageryBindings.values()].every(
            (binding) => !binding.desired,
          ),
        ),
      };
    });
    expect(far).toEqual({ count: near.requests.length, excluded: true });
    await page.locator("#missing").click();
    await page.locator("#near").click();
    await page.waitForFunction(
      () =>
        window.example.requests.length > 0 && window.example.world.tilesLoaded,
    );
    const settled = await page.evaluate(async () => {
      const { world, viewer, requests } = window.example;
      const count = requests.length;
      const before = { ...world._surface._imagery._debug };
      for (let i = 0; i < 3; ++i) {
        viewer.scene.requestRender();
        viewer.render();
      }
      const unavailable = [...world._surface._imagery._runtimes.values()].every(
        (runtime) =>
          [...runtime.entries.values()].every(
            (entry) =>
              entry.state === world._surface._imagery.State.UNAVAILABLE,
          ),
      );
      return {
        count,
        after: requests.length,
        before,
        debug: { ...world._surface._imagery._debug },
        unavailable,
        loaded: world.tilesLoaded,
      };
    });
    expect(settled.unavailable).toBe(true);
    expect(settled.loaded).toBe(true);
    expect(settled.after).toBe(settled.count);
    expect(settled.debug).toEqual(settled.before);
    await page.locator("#toggle").click();
    await page.locator("#toggle").click();
    await page.waitForFunction(() => window.example.world.tilesLoaded);
    await expect(page.locator("#error")).toHaveText("");
    expect(errors).toEqual([]);
    const lifetime = await page.evaluate(() => {
      const { world, destroy } = window.example;
      const debug = world._surface._imagery._debug;
      destroy();
      return { ...debug };
    });
    expect(lifetime.destroyedTextures).toBe(lifetime.createdTextures);
  });
}
