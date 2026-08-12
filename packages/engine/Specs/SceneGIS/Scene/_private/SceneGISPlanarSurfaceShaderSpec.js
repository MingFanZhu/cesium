import SceneGISPlanarSurfaceShader from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarSurfaceShader.js";

describe("SceneGIS/Scene/SceneGISPlanarSurfaceShader", function () {
  it("keeps tile-local UV and the opaque zero-layer base color", function () {
    const vertexShader = SceneGISPlanarSurfaceShader.createVertexShader(false);
    expect(vertexShader).toBe(SceneGISPlanarSurfaceShader.vertexShader);
    expect(vertexShader).toContain("position.xy + vec2(0.5)");
    expect(vertexShader).not.toContain("v_positionEC");
    const fragmentShader = SceneGISPlanarSurfaceShader.createFragmentShader(0);
    expect(fragmentShader).not.toContain("sampler2D");
    expect(fragmentShader).not.toContain("#define SCENEGIS_LIGHTING");
    expect(fragmentShader).toContain(
      "sceneGISComposeLayers(u_color, v_textureCoordinates)",
    );
    expect(fragmentShader).toContain("vec4(color.rgb, 1.0)");
    expect(fragmentShader).not.toContain(
      "SCENEGIS_PLANAR_SURFACE_DYNAMIC_LAYERS",
    );
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
    for (const uniform of [
      "brightness",
      "contrast",
      "hue",
      "saturation",
      "gamma",
      "colorToAlpha",
      "colorToAlphaThreshold",
    ]) {
      expect(fragmentShader).toContain(`u_${uniform}0`);
      expect(fragmentShader).toContain(`u_${uniform}1`);
    }
  });

  it("filters raw samples in the approved order with exact identity bypasses", function () {
    const shader = SceneGISPlanarSurfaceShader.createFragmentShader(1);
    const ordered = [
      "vec4 sample0 = texture",
      "u_colorToAlpha0.a > 0.5",
      "u_gamma0 != 1.0",
      "u_brightness0 != 1.0",
      "u_contrast0 != 1.0",
      "u_hue0 != 0.0",
      "u_saturation0 != 1.0",
      "sample0.a * u_alpha0",
    ];
    for (let i = 1; i < ordered.length; ++i) {
      expect(shader.indexOf(ordered[i - 1])).toBeLessThan(
        shader.indexOf(ordered[i]),
      );
    }
    expect(shader).toContain("vec3(1.0 / u_gamma0)");
    expect(shader).toContain("czm_hue(sample0.rgb, u_hue0)");
    expect(shader).toContain("czm_saturation(sample0.rgb, u_saturation0)");
    expect(shader).not.toContain("czm_gammaCorrect");
  });

  it("lights the fully composed color from a stable planar-up geometric normal", function () {
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
    expect(fragmentShader).toContain("czm_normal * vec3(0.0, 0.0, 1.0)");
    expect(fragmentShader).toContain("dot(normalEC, planarUpEC) < 0.0");
    expect(fragmentShader).not.toContain("faceforward");
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

  it("decodes smooth terrain normals without changing imagery and Lambert order", function () {
    const vertexShader = SceneGISPlanarSurfaceShader.createVertexShader(
      true,
      "smooth",
    );
    const fragmentShader = SceneGISPlanarSurfaceShader.createFragmentShader(
      2,
      true,
      "smooth",
    );

    expect(vertexShader).toContain("in vec2 normal");
    expect(vertexShader).toContain("czm_viewRotation * czm_octDecode(normal)");
    expect(vertexShader).not.toContain("czm_normal * czm_octDecode(normal)");
    expect(vertexShader).not.toContain("v_positionEC");
    expect(fragmentShader).toContain("normalize(v_normalEC)");
    expect(fragmentShader).toContain("#define SCENEGIS_LIGHTING");
    expect(fragmentShader).toContain("#define SCENEGIS_SMOOTH_NORMALS");
    expect(fragmentShader).not.toContain("faceforward");
    expect(fragmentShader.indexOf("sample1.a * u_alpha1")).toBeLessThan(
      fragmentShader.indexOf("color.rgb *= czm_lightColor * intensity"),
    );
  });

  it("replaces the single dynamic layer seam for every layer count", function () {
    for (const layerCount of [0, 1, 4]) {
      const fragmentShader = SceneGISPlanarSurfaceShader.createFragmentShader(
        layerCount,
        true,
        "smooth",
      );
      expect(fragmentShader).not.toContain(
        "SCENEGIS_PLANAR_SURFACE_DYNAMIC_LAYERS",
      );
      expect(fragmentShader.match(/sceneGISComposeLayers/g).length).toBe(2);
      expect(fragmentShader.match(/uniform sampler2D/g)?.length ?? 0).toBe(
        layerCount,
      );
    }
  });
});
