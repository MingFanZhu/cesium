import { test, expect } from "@playwright/test";

test.describe.configure({ retries: 0 });
test.use({
  viewport: { width: 1280, height: 1000 },
  launchOptions: { args: [] },
});

test("renders curved names, directed arrows and viewport shields through heading, pitch, zoom and recreation", async ({
  page,
}, info) => {
  const errors = [],
    external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.protocol === "data:") {
      return route.continue();
    }
    external.push(url.href);
    return route.abort();
  });
  await page.goto("/Test/vector-tiles/line-symbols.html");
  await page.waitForFunction(
    () => window.lineSymbolPreview?.layer?.tilesLoaded,
  );
  await expect(page.locator("#error")).toBeEmpty();
  const top = await page.evaluate(() => {
    const { viewer, layer } = window.lineSymbolPreview;
    const placed = layer._symbols._previous.filter((c) => c.placed);
    const picks = [];
    for (const style of ["names", "arrows", "shields"]) {
      const candidate = placed.find((c) => c.identity.styleLayer === style);
      const quads =
        candidate.projected[style === "names" ? "text" : "icon"].quads;
      let hit;
      for (const q of quads) {
        const p = q.corners;
        for (let u = 0.2; u < 0.9 && !hit; u += 0.15) {
          for (let v = 0.2; v < 0.9 && !hit; v += 0.15) {
            const x =
              p[0][0] + (p[1][0] - p[0][0]) * u + (p[3][0] - p[0][0]) * v;
            const y =
              p[0][1] + (p[1][1] - p[0][1]) * u + (p[3][1] - p[0][1]) * v;
            const picked = viewer.scene.pick(
              { x: candidate.screen.x + x, y: candidate.screen.y + y },
              1,
              1,
            );
            if (picked?.primitive === layer && picked.id.styleLayer === style) {
              hit = picked.id.styleLayer;
            }
          }
        }
        if (hit) {
          break;
        }
      }
      picks.push(hit);
    }
    const curves = placed.filter((c) => c.identity.styleLayer === "names");
    const bent = curves.some((c) => {
      const angles = c.projected.text.quads.map((q) =>
        Math.atan2(
          q.corners[1][1] - q.corners[0][1],
          q.corners[1][0] - q.corners[0][0],
        ),
      );
      return Math.max(...angles) - Math.min(...angles) > 0.1;
    });
    const shield = placed.find((c) => c.identity.styleLayer === "shields");
    window.oldLineResources = {
      layer,
      vas: [...layer._symbols._groups.values()].map(
        (b) => b.resources.vertexArray,
      ),
      textures: [...layer._symbols.assets.pages.values()].map((p) => p.texture),
      sprite: layer._symbols.assets.sprite.texture,
    };
    return {
      picks,
      bent,
      rejected: placed.some((c) => c.identity.styleLayer === "rejections"),
      height:
        shield.projected.icon.boxes[0][3] - shield.projected.icon.boxes[0][1],
      zoom: layer.statistics.zoom,
    };
  });
  expect(top.picks).toEqual(["names", "arrows", "shields"]);
  expect(top.bent).toBe(true);
  expect(top.rejected).toBe(false);
  await page.screenshot({ path: info.outputPath("line-symbols-top.png") });
  await page.getByRole("button", { name: "旋转 180°" }).click();
  await page.waitForFunction(
    () => window.lineSymbolPreview.viewer.scene.camera.upWC.y < 0,
  );
  expect(
    await page.evaluate(() =>
      window.lineSymbolPreview.layer._symbols._previous
        .filter((c) => c.placed && c.identity.styleLayer === "names")
        .every((c) => {
          const quads = c.projected.text.quads,
            first = quads[0].corners,
            last = quads[quads.length - 1].corners;
          return first[0][0] + first[1][0] < last[0][0] + last[1][0];
        }),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "倾斜", exact: true }).click();
  await page.waitForFunction(
    () => window.lineSymbolPreview.viewer.scene.camera.directionWC.z > -0.8,
  );
  const tilted = await page.evaluate(() => {
    const placed = window.lineSymbolPreview.layer._symbols._previous.filter(
      (c) => c.placed,
    );
    const shield = placed.find((c) => c.identity.styleLayer === "shields");
    return {
      height:
        shield.projected.icon.boxes[0][3] - shield.projected.icon.boxes[0][1],
      map: placed
        .filter((c) => c.identity.styleLayer === "names")
        .every((c) =>
          c.projected.text.quads.every((q) => q.positions?.length === 4),
        ),
      upright: shield.projected.icon.quads.every(
        (q) => Math.abs(q.corners[1][1] - q.corners[0][1]) < 0.001,
      ),
    };
  });
  expect(tilted.height).toBeCloseTo(top.height, 6);
  expect(tilted.map && tilted.upright).toBe(true);
  await page.screenshot({ path: info.outputPath("line-symbols-tilted.png") });
  await page.getByRole("button", { name: "连续缩放" }).click();
  await page.waitForFunction(
    (zoom) => window.lineSymbolPreview.layer.statistics.zoom > zoom,
    top.zoom,
  );
  await page.getByRole("button", { name: "重建图层" }).click();
  await page.waitForFunction(() => window.lineSymbolPreview.layer.tilesLoaded);
  expect(
    await page.evaluate(() => {
      const old = window.oldLineResources;
      return (
        old.layer.isDestroyed() &&
        old.vas.every((va) => va.isDestroyed()) &&
        old.textures.every((texture) => texture.isDestroyed()) &&
        old.sprite.isDestroyed()
      );
    }),
  ).toBe(true);
  await expect(page.locator("#error")).toBeEmpty();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
