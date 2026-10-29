import { test, expect } from "@playwright/test";

for (const [format, mount, base] of [
  ["iife", "root", "auto"],
  ["iife", "nested", "auto"],
  ["esm", "root", "auto"],
  ["esm", "nested", "auto"],
  ["esm", "nested", "new"],
  ["iife", "nested", "legacy"],
]) {
  test(`${format} ${mount} ${base}: Worlds, Worker, WASM and texture`, async ({
    page,
  }, info) => {
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        errors.push(`${response.status()} ${response.url()}`);
      }
      requests.push(response.url());
    });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:8104)/, (route) =>
      route.abort(),
    );
    await page.goto(`/__case?format=${format}&mount=${mount}&base=${base}`);
    await page.waitForFunction(() => window.ready);
    const result = await page.evaluate(async () => {
      const C = window.engine;
      const processor = new C.TaskProcessor("decodeDraco");
      try {
        const loaded = await processor.initWebAssemblyModule({
          wasmBinaryFile: "ThirdParty/draco_decoder.wasm",
        });
        const array = new Uint8Array(
          await (await fetch("/__draco.bin")).arrayBuffer(),
        );
        const mesh = await processor.scheduleTask({
          array,
          bufferView: { byteLength: array.byteLength },
          compressedAttributes: { POSITION: 0 },
        });
        const image = await C.Resource.fetchImage({
          url: C.buildModuleUrl("Assets/Textures/waterNormals.jpg"),
        });
        const imageWidth = image.width;
        image.close?.();
        const released = [];
        for (const world of ["globe", "planar"]) {
          const options = {
            baseLayer: false,
            baseLayerPicker: false,
            geocoder: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            animation: false,
            timeline: false,
            fullscreenButton: false,
            homeButton: false,
            infoBox: false,
            selectionIndicator: false,
            useDefaultRenderLoop: false,
          };
          if (world === "planar") {
            delete options.baseLayer;
            options.planarWorld = {
              extent: {
                minimumX: -1000,
                minimumY: -1000,
                maximumX: 1000,
                maximumY: 1000,
              },
              crs: "LOCAL",
              maximumLevel: 4,
            };
          }
          const viewer = new C.Viewer("view", options);
          window.lastViewer = viewer;
          const worldObject = viewer.scene.world;
          if (world === "planar") {
            viewer.scene.camera.setView({
              destination: new C.Cartesian3(0, 0, 1000),
              orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
            });
          }
          viewer.resize();
          viewer.scene.initializeFrame();
          viewer.render();
          viewer.destroy();
          released.push(viewer.isDestroyed() && worldObject.isDestroyed());
        }
        return {
          base: C.buildModuleUrl("Assets/test"),
          loaded,
          triangles: mesh.indexArray.numberOfIndices,
          imageWidth,
          released,
          version: C.VERSION,
        };
      } catch (error) {
        throw new Error(`${String(error)}\n${error.message}\n${error.stack}`, {
          cause: error,
        });
      } finally {
        processor.destroy();
        window.processorReleased = processor.isDestroyed();
      }
    });
    expect(result.loaded).toBe(true);
    expect(result.triangles).toBeGreaterThan(0);
    expect(result.imageWidth).toBeGreaterThan(0);
    expect(result.released).toEqual([true, true]);
    expect(result.base).toContain(
      mount === "nested"
        ? "/deep/site/vendor/engine/Assets/test"
        : ":8104/Assets/test",
    );
    expect(await page.evaluate(() => window.processorReleased)).toBe(true);
    expect(requests.some((url) => url.endsWith("draco_decoder.wasm"))).toBe(
      true,
    );
    expect(errors).toEqual([]);
    await info.attach("runtime-results", {
      body: JSON.stringify({ ...result, requests }, null, 2),
      contentType: "application/json",
    });
  });
}
