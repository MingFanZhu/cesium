import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

// Establish the current scalar AO baseline; no directional implementation is enabled.
for (const world of ["globe", "planar"]) {
  test(`directional occlusion assessment: ${world} scalar baseline`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/PBR综合验收.html?world=${world}`);
    await page.waitForFunction(() => window.example?.state.ready);
    await page.evaluate(() => {
      const e = window.example;
      e.autoExposure.enabled = false;
      e.colorGrading.enabled = false;
      Object.assign(e.rendering, {
        ao: false,
        ssr: false,
        ssil: false,
        specularAA: false,
        antialiasing: "无 AA",
        aoRadius: 0.7,
        aoIntensity: 0.8,
      });
      Object.assign(e.atmosphere, {
        mode: "物理大气",
        day: 79,
        hour: 12,
        exposure: 1,
        showHeightFog: false,
        showAerialPerspective: false,
        surfaceRadianceScale: 1.2,
        backgroundRadianceScale: 2.5,
      });
      e.state.setTime();
      e.state.applyAtmosphere();
      e.lighting.diffuse = e.lighting.specular = 1;
      e.state.applyLighting();
      e.state.apply();
      e.state.resetView();
      document.body.classList.add("panels-hidden");
      e.viewer.useDefaultRenderLoop = false;
      window.assessmentFrame = () => {
        e.viewer.render();
        return e.viewer.scene.canvas.toDataURL();
      };
    });
    for (const mode of ["off", "scalar", "visibility"]) {
      const png = await page.evaluate((mode) => {
        const e = window.example;
        const ao = e.viewer.scene.postProcessStages.ambientOcclusion;
        ao.enabled = mode !== "off";
        ao.uniforms.ambientOcclusionOnly = mode === "visibility";
        return window.assessmentFrame();
      }, mode);
      await writeFile(
        testInfo.outputPath(`${mode}.png`),
        Buffer.from(png.split(",")[1], "base64"),
      );
    }
    const report = await page.evaluate(async () => {
      const e = window.example;
      const { viewer } = e;
      const scene = viewer.scene;
      const deferred = scene._sceneGISDeferred;
      const ao = scene.postProcessStages.ambientOcclusion;
      ao.uniforms.ambientOcclusionOnly = false;
      viewer.render();
      const state = ao._sceneGISAmbientOcclusion;
      const context = scene.context;
      const gl = context._gl;
      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      const textureInfo = (texture) => ({
        width: texture.width,
        height: texture.height,
        format: texture.pixelFormat,
        datatype: texture.pixelDatatype,
        bytes: texture.sizeInBytes,
      });
      const result = {
        renderer: debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        dimensions: [scene.drawingBufferWidth, scene.drawingBufferHeight],
        settings: {
          radius: ao.uniforms.lengthCap,
          intensity: ao.uniforms.intensity,
          directions: ao.uniforms.directionCount,
          steps: ao.uniforms.stepCount,
        },
        mainPass: state.mainPass,
        prepassDraws: state.prepassDraws,
        sharedDepth: state.sourceDepth === deferred.opaqueDepthTexture,
        estimate: textureInfo(state.estimate.getColorTexture()),
        filtered: textureInfo(state.filtered.getColorTexture()),
        gpu: { frameOff: [], frameAO: [], estimateAndFilter: [] },
        snapshots: [],
      };
      if (ext) {
        async function measure(draw) {
          gl.finish();
          const query = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          draw();
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
            await new Promise(window.requestAnimationFrame);
          }
          const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
          const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
          gl.deleteQuery(query);
          if (disjoint) {
            throw new Error("Disjoint GPU timing; no valid assessment sample");
          }
          return ms;
        }
        for (let i = 0; i < 8; i++) {
          for (const enabled of i % 2 === 0 ? [false, true] : [true, false]) {
            ao.enabled = enabled;
            // Establish the selected resource layout before the measured frame.
            viewer.render();
            const values = enabled ? result.gpu.frameAO : result.gpu.frameOff;
            values.push(await measure(() => viewer.render()));
            if (i === 0) {
              result.snapshots.push({
                enabled,
                materialDraws: deferred.drawCount,
                lightDraws: deferred.lightDrawCount,
                groups: deferred.groupCount,
              });
            }
          }
        }
        ao.enabled = true;
        viewer.render();
        const passState = scene._view.passState;
        const original = passState.framebuffer;
        context.uniformState.updateFrustum(scene.camera.frustum);
        try {
          for (let i = 0; i < 8; i++) {
            result.gpu.estimateAndFilter.push(
              await measure(() => {
                passState.framebuffer = state.estimate.framebuffer;
                state.estimateCommand.execute(context, passState);
                passState.framebuffer = state.filtered.framebuffer;
                state.filterCommand.execute(context, passState);
              }),
            );
          }
        } finally {
          passState.framebuffer = original;
        }
      }
      e.destroy();
      result.destroyed = viewer.isDestroyed();
      return result;
    });
    expect(report.mainPass).toBe(true);
    expect(report.prepassDraws).toBe(0);
    expect(report.sharedDepth).toBe(true);
    expect(report.destroyed).toBe(true);
    expect(errors).toEqual([]);
    await writeFile(
      testInfo.outputPath("baseline.json"),
      JSON.stringify(report, null, 2),
    );
  });
}
