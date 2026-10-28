// Density-thresholded texture and relief lighting follow Crest OceanFoam.hlsl.
// Reference: wave-harmonic/crest, db0658ff0b2e93e4a9e28cc2867509658b0ecc00.
// Independently integrated with SceneGIS concentration, coordinates and lighting.
uniform sampler2D u_foamDetail;
uniform bool u_hasFoamDetail;

float sceneGISFoamPattern(vec2 p, vec2 dx, vec2 dy)
{
    // A one-meter tile resolves centimeter-scale films. A second, rotated scale
    // modulates coverage without the circular holes of the procedural material.
    mat2 rotation = mat2(0.8, 0.6, -0.6, 0.8);
    float fine = textureGrad(u_foamDetail, p, dx, dy).r;
    float coarse = textureGrad(u_foamDetail, rotation * p * 0.19 + 0.37,
        rotation * dx * 0.19, rotation * dy * 0.19).r;
    return fine * (0.65 + coarse * 0.35);
}

float sceneGISFoamCoverage(float density, float pattern, float footprint)
{
    // Filter the threshold as well as the texture so unresolved films converge
    // smoothly to coverage instead of turning into sharp distant white bands.
    float feather = 0.12 + min(0.3, footprint * 0.5);
    return smoothstep(1.0 - density, 1.0 - density + feather, pattern) *
        smoothstep(0.0, 0.08, density);
}

vec4 sceneGISFoamMaterial(float density, vec2 p, vec2 dx, vec2 dy)
{
    float footprint = max(length(dx), length(dy));
    float value = sceneGISFoamPattern(p, dx, dy);
    float coverage = sceneGISFoamCoverage(density, value, footprint);
    // Differentiate the already anisotropically filtered height. An isotropic
    // world-space step would erase resolved lateral relief at grazing angles.
    float delta = 1.0 / float(textureSize(u_foamDetail, 0).x);
    float x = sceneGISFoamPattern(p + vec2(delta, 0.0), dx, dy);
    float y = sceneGISFoamPattern(p + vec2(0.0, delta), dx, dy);
    vec2 slope = (vec2(x, y) - value) * (0.003 / delta);
    return vec4(slope, value, coverage);
}

vec3 sceneGISFoamDiffuse(vec3 normal, vec3 light, vec3 beam, vec3 sky)
{
    return vec3(0.8) * (sky + beam * max(dot(normal, light), 0.0) / czm_pi);
}
