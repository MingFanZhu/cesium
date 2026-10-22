import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

for (const projection of ["perspective", "orthographic"]) {
  test(`Planar rolled navigation: ${projection}`, async ({ page }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/Test/Planar/相机控制.html");
    await page.waitForFunction(() => window.example?.world.tilesLoaded);
    await page.evaluate(async (projection) => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const { viewer, world } = window.example;
      viewer.useDefaultRenderLoop = false;
      viewer.clock.shouldAnimate = false;
      const camera = viewer.camera;
      if (projection === "orthographic") {
        camera.switchToOrthographicFrustum();
        camera.frustum.width = 16000;
      }
      const controller = viewer.planarCameraController;
      controller.inertiaTranslate =
        controller.inertiaZoom =
        controller.inertiaSpin =
          0;
      const pose = {
        destination: new C.Cartesian3(0, -8000, 6000),
        orientation: { heading: 0, pitch: -Math.atan(0.75), roll: 0.6 },
      };
      camera.setView(pose);
      window.rollTest = {
        C,
        viewer,
        world,
        controller,
        pose,
        async frame(count = 1) {
          for (let i = 0; i < count; i++) {
            await new Promise(requestAnimationFrame);
            viewer.render();
          }
          return this.state();
        },
        state() {
          const point = controller._rotatePivot;
          const pixel = viewer.scene.cartesianToCanvasCoordinates(point);
          return {
            roll: C.Math.negativePiToPi(camera.roll),
            position: C.Cartesian3.clone(camera.positionWC),
            up: C.Cartesian3.clone(camera.upWC),
            pivot: C.Cartesian3.clone(point),
            pixel,
            range: controller._rotateDistance,
            inertia: controller._inertia.running,
          };
        },
      };
      await window.rollTest.frame();
    }, projection);
    const frame = (count = 1) =>
      page.evaluate((n) => window.rollTest.frame(n), count);
    const baseline = await frame();
    expect(baseline.roll).toBeCloseTo(0.6, 10);
    expect((await frame(3)).position).toEqual(baseline.position);
    await page.screenshot({ path: info.outputPath("rolled.png") });
    const pointer = { x: 720, y: 470 };
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down();
    await page.mouse.move(pointer.x + 10, pointer.y + 5);
    expect((await frame()).roll).toBeCloseTo(0.6, 10);
    await page.mouse.up();
    await frame();
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.wheel(0, -40);
    expect((await frame(2)).roll).toBeCloseTo(0.6, 10);
    const beforeOrbit = await frame();
    await page.mouse.down({ button: "middle" });
    expect((await frame()).position).toEqual(beforeOrbit.position);
    const orbit = [];
    for (let i = 1; i <= 30; i++) {
      await page.mouse.move(pointer.x + i * 9, pointer.y);
      orbit.push(await frame());
    }
    expect(orbit[0].roll).toBeGreaterThan(0.5);
    expect(Math.abs(orbit.at(-1).roll)).toBeLessThan(1e-10);
    for (let i = 0; i < orbit.length; i++) {
      const state = orbit[i];
      expect(state.roll).toBeLessThanOrEqual(
        (i ? orbit[i - 1].roll : 0.6) + 1e-10,
      );
      expect(Math.abs(state.pixel.x - pointer.x)).toBeLessThan(0.1);
      expect(Math.abs(state.pixel.y - pointer.y)).toBeLessThan(0.1);
      expect(state.range).toBeCloseTo(orbit[0].range, 8);
    }
    await page.mouse.up({ button: "middle" });
    await frame();
    await page.screenshot({ path: info.outputPath("upright.png") });
    await page.evaluate(() => {
      const t = window.rollTest;
      t.flightComplete = false;
      t.viewer.camera.flyTo({
        ...t.pose,
        duration: 0.1,
        complete: () => {
          t.flightComplete = true;
        },
      });
      t.controller.inertiaSpin = 0.9;
    });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          await window.rollTest.frame();
          return window.rollTest.flightComplete;
        }),
      )
      .toBe(true);
    expect((await frame()).roll).toBeCloseTo(0.6, 10);
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down({ button: "middle" });
    await page.mouse.move(pointer.x + 10, pointer.y);
    const held = await frame();
    await page.mouse.up({ button: "middle" });
    const coast = await frame();
    expect(coast.inertia).toBe(true);
    expect(coast.roll).toBeLessThan(held.roll);
    expect(Math.abs(coast.pixel.x - pointer.x)).toBeLessThan(0.1);
    expect(Math.abs(coast.pixel.y - pointer.y)).toBeLessThan(0.1);
    await page.mouse.move(pointer.x, pointer.y);
    await page.mouse.down({ button: "middle" });
    const newPress = await frame();
    expect(newPress.inertia).toBe(false);
    expect(newPress.roll).toBeCloseTo(coast.roll, 10);
    expect(newPress.position).toEqual(coast.position);
    await page.mouse.move(pointer.x + 2, pointer.y);
    const resumed = await frame();
    expect(resumed.roll).toBeLessThan(newPress.roll);
    await page.mouse.up({ button: "middle" });
    await page.evaluate(() => window.example.destroy());
    expect(errors).toEqual([]);
    await writeFile(
      info.outputPath("interaction.json"),
      JSON.stringify(
        { projection, baseline, orbit, held, coast, newPress, resumed },
        null,
        2,
      ),
    );
  });
}
