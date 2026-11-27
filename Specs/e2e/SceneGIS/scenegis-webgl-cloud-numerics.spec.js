import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// Port the native probes from 5bede894ca without the WebGPU comparison harness.
const root = new URL(
  "../../packages/engine/Source/Shaders/SceneGIS/EnvironmentEffects/",
  import.meta.url,
);
const source = (name) => readFileSync(new URL(`${name}.glsl`, root), "utf8");
function body(text, name) {
  const start = text.indexOf(name);
  if (start < 0) {
    throw new Error(`Missing production function ${name}`);
  }
  return text.slice(start, text.indexOf("\n}", start) + 2);
}

async function probe(page, fragment, width) {
  return page.evaluate(
    ({ fragment, width }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = 1;
      const gl = canvas.getContext("webgl2");
      if (!gl?.getExtension("EXT_color_buffer_float")) {
        throw new Error("Float WebGL2 target unavailable");
      }
      const program = gl.createProgram(),
        texture = gl.createTexture(),
        framebuffer = gl.createFramebuffer();
      const shaders = [];
      try {
        function compile(type, text) {
          const shader = gl.createShader(type);
          shaders.push(shader);
          gl.shaderSource(shader, text);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            throw new Error(gl.getShaderInfoLog(shader));
          }
          gl.attachShader(program, shader);
        }
        compile(
          gl.VERTEX_SHADER,
          `#version 300 es
        void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.0-1.0,0,1);}`,
        );
        compile(
          gl.FRAGMENT_SHADER,
          `#version 300 es\nprecision highp float; out vec4 color;\n${fragment}`,
        );
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program));
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA32F,
          width,
          1,
          0,
          gl.RGBA,
          gl.FLOAT,
          null,
        );
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texture,
          0,
        );
        gl.useProgram(program);
        gl.viewport(0, 0, width, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        const pixels = new Float32Array(width * 4);
        gl.readPixels(0, 0, width, 1, gl.RGBA, gl.FLOAT, pixels);
        if (gl.getError() !== gl.NO_ERROR) {
          throw new Error("Cloud numeric draw failed");
        }
        return Array.from(pixels);
      } finally {
        shaders.forEach((s) => gl.deleteShader(s));
        gl.deleteProgram(program);
        gl.deleteTexture(texture);
        gl.deleteFramebuffer(framebuffer);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      }
    },
    { fragment, width },
  );
}

test("cloud shell intersections retain metric precision at grazing angles and boundaries", async ({
  page,
}) => {
  const cases = [
    { origin: [0, 0, 500], z: 0.010466693, height: 750 },
    { origin: [0, 0, 500], z: -0.001430378, height: 750 },
    { origin: [400, 200, 500], z: 0.3303504, height: 750 },
    { origin: [-400, -200, 1200], z: -0.7, height: 750 },
    { origin: [0, 0, 750.125], z: 1, height: 750 },
    { origin: [0, 0, 749.875], z: 1, height: 750 },
    { origin: [0, 0, 750], z: 0, height: 750 },
    { origin: [0, 0, 751], z: 0, height: 750 },
    { origin: [0, 0, 749], z: 0, height: 750 },
  ].map(({ origin, z, height }) => ({
    origin: origin.map(Math.fround),
    direction: [Math.sqrt(1 - z * z), 0, z].map(Math.fround),
    height,
  }));
  const vector = (v) =>
    `vec3(${v.map((x) => (Number.isInteger(x) ? `${x}.0` : x)).join(",")})`;
  const pixels = await probe(
    page,
    `const float SCENEGIS_BOTTOM_RADIUS=6360000.0;
    ${body(source("SceneGISVolumetricClouds"), "bool sceneGISCloudLocalSphereInterval(")}
    void main(){vec3 o=vec3(0),d=vec3(0);float h=0.0;
    ${cases.map((c, i) => `if(int(gl_FragCoord.x)==${i}){o=${vector(c.origin)};d=${vector(c.direction)};h=${c.height}.0;}`).join("\n")}
    float a=0.0,b=0.0;bool hit=sceneGISCloudLocalSphereInterval(o,d,h,a,b);color=vec4(a,b,hit?1.0:0.0,1.0);}`,
    cases.length,
  );
  cases.forEach(({ origin, direction, height }, i) => {
    const world = [...origin];
    world[2] += 6360000;
    const projected = world.reduce((sum, v, c) => sum + v * direction[c], 0);
    const discriminant =
      projected * projected -
      world.reduce((sum, v) => sum + v * v, 0) +
      (6360000 + height) ** 2;
    const roots =
      discriminant < 0
        ? [0, 0]
        : [
            -projected - Math.sqrt(discriminant),
            -projected + Math.sqrt(discriminant),
          ];
    expect(pixels[i * 4 + 2]).toBe(+(discriminant >= 0 && roots[1] > 0));
    roots.forEach((r, c) =>
      expect(Math.abs(pixels[i * 4 + c] - r)).toBeLessThanOrEqual(
        Math.max(0.02, Math.abs(r) * 5e-7),
      ),
    );
  });
});

test("cloud variance clip preserves constant-channel roundoff but rejects real outliers", async ({
  page,
}) => {
  const values = await probe(
    page,
    `${body(source("SceneGISEnvironmentEffectsCloudResolveFS"), "vec4 sceneGISCloudVarianceClip(")}
    void main(){int i=int(gl_FragCoord.x);float b=0.0625;float channel=b;
      if(i==1){channel=uintBitsToFloat(floatBitsToUint(b)+1u);}
      if(i==2){channel=uintBitsToFloat(floatBitsToUint(b)-1u);}
      if(i==3){channel=b+0.01;}
      color=sceneGISCloudVarianceClip(vec4(0.6,0.65,channel,0.5),vec4(4.5,4.5,b*9.0,4.5),vec4(2.75,2.75,b*b*9.0,2.25),9.0,vec4(0.25,0.25,b,0.5),vec4(0.75,0.75,b,0.5));}`,
    4,
  );
  for (let i = 0; i < 4; i++) {
    expect(values[i * 4]).toBeCloseTo(i === 3 ? 0.5 : 0.6, 6);
    expect(values[i * 4 + 1]).toBeCloseTo(i === 3 ? 0.5 : 0.65, 6);
    expect(values[i * 4 + 2]).toBe(0.0625);
    expect(values[i * 4 + 3]).toBe(0.5);
  }
});

test("full-resolution cloud reconstruction keeps integer source centers under UV roundoff", async ({
  page,
}) => {
  const text = source("SceneGISEnvironmentEffectsCloudResolveFS");
  const start = text.indexOf("    vec2 lowPosition =");
  const code = text.slice(
    start,
    text.indexOf("    if (u_cloudTracePhased)", start),
  );
  const values = await probe(
    page,
    `void main(){
    vec2 lowDimensions=vec2(1198.0,1.0),fullDimensions=lowDimensions;
    vec2 v_textureCoordinates=gl_FragCoord.xy/fullDimensions;
    v_textureCoordinates.x=uintBitsToFloat(floatBitsToUint(v_textureCoordinates.x)-1u);
    ${code}
    color=vec4(lowPosition,fract(lowPosition));}`,
    1198,
  );
  for (let x = 0; x < 1198; x++) {
    expect(values.slice(x * 4, x * 4 + 4)).toEqual([x, 0, 0, 0]);
  }
});
