import SceneGISPlanarSurfaceShader from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceShader.js";

describe("SceneGIS/Scene/SceneGISPlanarSurfaceShader", function () {
  it("keeps tile-local UV and the opaque zero-layer base color", function () {
    const vertexShader = SceneGISPlanarSurfaceShader.createVertexShader(false);
    expect(vertexShader).toBe(SceneGISPlanarSurfaceShader.vertexShader);
    expect(vertexShader).toContain("position.xy + vec2(0.5)");
    expect(vertexShader).not.toContain("v_positionEC");
    const fragmentShader = SceneGISPlanarSurfaceShader.createFragmentShader(0);
    expect(fragmentShader).not.toContain("sampler2D");
    expect(fragmentShader).not.toContain("dFdx");
    expect(fragmentShader).not.toContain("czm_getLambertDiffuse");
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

  it("lights the fully composed color from a face-forward geometric normal", function () {
    const vertexShader = SceneGISPlanarSurfaceShader.createVertexShader(true);
    const fragmentShader = SceneGISPlanarSurfaceShader.createFragmentShader(
      2,
      true,
    );

    expect(vertexShader).toContain(
      "v_positionEC = (czm_modelView * vec4(position, 1.0)).xyz",
    );
    expect(fragmentShader).toContain(
      "cross(dFdx(v_positionEC), dFdy(v_positionEC))",
    );
    expect(fragmentShader).toContain(
      "faceforward(normalEC, vec3(0.0, 0.0, 1.0), -normalEC)",
    );
    expect(fragmentShader).toContain(
      "czm_getLambertDiffuse(czm_lightDirectionEC, normalEC)",
    );
    expect(fragmentShader).toContain(
      "diffuse * u_lambertDiffuseMultiplier + 0.3",
    );
    expect(fragmentShader.indexOf("sample1.a * u_alpha1")).toBeLessThan(
      fragmentShader.indexOf("color.rgb *= czm_lightColor * intensity"),
    );
    expect(fragmentShader).toContain("vec4(color.rgb, 1.0)");
  });
});
