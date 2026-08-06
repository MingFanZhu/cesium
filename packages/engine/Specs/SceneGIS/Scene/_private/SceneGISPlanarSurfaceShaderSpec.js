import SceneGISPlanarSurfaceShader from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceShader.js";

describe("SceneGIS/Scene/SceneGISPlanarSurfaceShader", function () {
  it("keeps tile-local UV and the opaque zero-layer base color", function () {
    expect(SceneGISPlanarSurfaceShader.vertexShader).toContain(
      "position.xy + vec2(0.5)",
    );
    const fragmentShader = SceneGISPlanarSurfaceShader.createFragmentShader(0);
    expect(fragmentShader).not.toContain("sampler2D");
    expect(fragmentShader).toContain("vec4 color = u_color");
    expect(fragmentShader).toContain("vec4(color.rgb, 1.0)");
  });

  it("statically composes texture slots bottom-to-top", function () {
    const fragmentShader = SceneGISPlanarSurfaceShader.createFragmentShader(2);
    expect(fragmentShader).toContain("uniform sampler2D u_texture0");
    expect(fragmentShader).toContain("uniform sampler2D u_texture1");
    expect(fragmentShader).toContain("clamp(");
    expect(fragmentShader.indexOf("sample0")).toBeLessThan(
      fragmentShader.indexOf("sample1"),
    );
    expect(fragmentShader).toContain("sample1.a * u_alpha1");
  });
});
