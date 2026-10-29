import { writeFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
for (const world of ["planar", "globe"]) {
  test(`indexed original water boundaries in ${world}`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.log("PAGE ERROR", e.message);
    });
    await page.goto(`/Test/Rendering/岸线索引.html?world=${world}`);
    await page.waitForFunction(
      () =>
        window.waterBoundaryExample?.water?.underwaterBoundaryByteLength > 0,
    );
    await page.evaluate(
      () =>
        (window.previousBoundaryTexture =
          window.waterBoundaryExample.water._underwater.texture),
    );
    await page.locator("#count").selectOption("4096");
    await page.waitForFunction(
      () =>
        window.waterBoundaryExample?.edgeCount === 5120 &&
        window.waterBoundaryExample.water.underwaterBoundaryByteLength > 0,
    );
    const sample = await page.evaluate(() => {
      const e = window.waterBoundaryExample;
      e.viewer.useDefaultRenderLoop = false;
      e.viewer.scene.initializeFrame();
      e.viewer.render();
      return {
        edges: e.edgeCount,
        bytes: e.water.underwaterBoundaryByteLength,
        oldReleased: window.previousBoundaryTexture.isDestroyed(),
        active: e.water._underwater.active,
      };
    });
    expect(sample.edges).toBe(5120);
    expect(sample.bytes).toBeLessThan(8388608);
    expect(sample.oldReleased).toBe(true);
    expect(sample.active).toBe(true);
    const a = await page.screenshot({
      path: info.outputPath("underwater-5120-edges.png"),
    });
    await page.evaluate(() => {
      const v = window.waterBoundaryExample.viewer;
      v.scene.initializeFrame();
      v.render();
    });
    expect((await page.screenshot()).equals(a)).toBe(true);
    await page.locator("#above").click();
    await page.evaluate(() => {
      const v = window.waterBoundaryExample.viewer;
      v.scene.initializeFrame();
      v.render();
    });
    await page.screenshot({
      path: info.outputPath("source-shores-5120-edges.png"),
    });
    const benchmark = await page.evaluate(async (curved) => {
      const C = await import("/Build/CesiumUnminified/index.js"),
        ctx = window.waterBoundaryExample.viewer.scene.context;
      const volume = await (
        await fetch(
          "/packages/engine/Source/Shaders/SceneGIS/Water/SceneGISUnderwaterVolume.glsl",
        )
      ).text();
      const gl = ctx._gl,
        ext = gl.getExtension("EXT_disjoint_timer_query_webgl2"),
        width = 384,
        height = 256;
      let texture, nodes, count;
      const target = new C.Framebuffer({
        context: ctx,
        colorTextures: [
          new C.Texture({
            context: ctx,
            width,
            height,
            pixelFormat: C.PixelFormat.RGBA,
            pixelDatatype: C.PixelDatatype.FLOAT,
          }),
        ],
      });
      const common = `uniform float u_underwaterDepth,u_cameraDepth;uniform int u_count,u_offset;`;
      const linear = `bool linearReference(vec2 start,vec2 velocity,float z,float dz,inout float distance){
      bool inside=false;for(int i=0;i<u_count;++i){vec4 edge=sceneGISWaterBoundaryTexel(u_offset+i);
      vec2 a=edge.xy,b=edge.zw,segment=b-a;
      if((a.y>start.y)!=(b.y>start.y)&&start.x<(b.x-a.x)*(start.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
      float side=sceneGISWaterCross(a-start,segment),den=sceneGISWaterCross(velocity,segment)-side*dz;
      if(abs(den)>1e-8){float t=side*z/den,endZ=z+t*dz;
        if(t>0.0&&t<distance&&endZ>0.0){vec2 hit=start+velocity*t/endZ;float u=dot(hit-a,segment)/dot(segment,segment);
          if(u>=0.0&&u<=1.0)distance=t;}}}return inside;}`;
      const main = (
        fn,
      ) => `void main(){vec2 uv=gl_FragCoord.xy/vec2(${width}.0,${height}.0);
      vec2 start=vec2(0.0,-55.0),v=normalize(vec2((uv.x-.5)*1.8,1.0));
      float z=${curved ? "6371000.0" : "1.0"},dz=${curved ? "-6371.0" : "0.0"},distance=500.0;
      bool inside=${fn}(start,v*z,z,dz,distance);out_FragColor=vec4(inside?distance/500.0:0.0,0.0,0.0,1.0);}`;
      const command = (fn) =>
        ctx.createViewportQuadCommand(
          new C.ShaderSource({
            defines: curved ? ["SCENEGIS_ELLIPSOID_UNDERWATER"] : [],
            sources: [common, volume, linear, main(fn)],
          }),
          {
            framebuffer: target,
            renderState: C.RenderState.fromCache({
              viewport: new C.BoundingRectangle(0, 0, width, height),
            }),
            uniformMap: {
              u_boundary: () => texture,
              u_boundaryNodeCount: () => nodes,
              u_count: () => count,
              u_offset: () => nodes * 2,
            },
          },
        );
      const indexed = command("sceneGISWaterBoundaryRay"),
        flat = command("linearReference");
      async function measure(c) {
        const values = [];
        c.execute(ctx);
        if (ext) {
          for (let i = 0; i < 3; i++) {
            const q = gl.createQuery();
            gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
            c.execute(ctx);
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
              await new Promise((r) => requestAnimationFrame(r));
            }
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
              values.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
            }
            gl.deleteQuery(q);
          }
        }
        return (
          values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? null
        );
      }
      const results = [];
      try {
        for (const n of [64, 256, 1024, 4096]) {
          const e = [];
          for (let i = 0; i < n; i++) {
            const a = (i * 2 * Math.PI) / n,
              b = ((i + 1) * 2 * Math.PI) / n;
            e.push(
              Math.cos(a) * 120,
              Math.sin(a) * 120,
              Math.cos(b) * 120,
              Math.sin(b) * 120,
            );
          }
          const started = performance.now(),
            boundary = new C._SceneGISWaterBoundary(e);
          const buildMilliseconds = performance.now() - started;
          texture = boundary.createTexture(ctx);
          nodes = boundary.nodes.length;
          count = n;
          const bvhMilliseconds = await measure(indexed),
            a = ctx.readPixels({ framebuffer: target, width, height });
          const linearMilliseconds = await measure(flat),
            b = ctx.readPixels({ framebuffer: target, width, height });
          let error = 0;
          for (let i = 0; i < a.length; i++) {
            error = Math.max(error, Math.abs(a[i] - b[i]));
          }
          results.push({
            edges: n,
            indexBytes: boundary.byteLength,
            buildMilliseconds,
            bvhMilliseconds,
            linearMilliseconds,
            maximumDifference: error,
          });
          texture.destroy();
          texture = undefined;
        }
      } finally {
        texture?.destroy();
        indexed.shaderProgram.destroy();
        flat.shaderProgram.destroy();
        target.destroy();
      }
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        width,
        height,
        timingSupported: !!ext,
        renderer: debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : "unavailable",
        results,
      };
    }, world === "globe");
    await writeFile(
      info.outputPath("benchmark.json"),
      JSON.stringify({ sample, benchmark }, null, 2),
    );
    console.log(world, JSON.stringify({ sample, benchmark }));
    for (const r of benchmark.results) {
      expect(r.maximumDifference).toBeLessThan(0.0001);
    }
    const released = await page.evaluate(() => {
      const e = window.waterBoundaryExample,
        t = e.water._underwater.texture;
      e.destroy();
      return t.isDestroyed() && e.waves.isDestroyed();
    });
    expect(released).toBe(true);
    expect(errors).toEqual([]);
  });
}
