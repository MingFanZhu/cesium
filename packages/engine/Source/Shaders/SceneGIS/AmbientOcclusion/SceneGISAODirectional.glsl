// Cone overlap adapted from Filament, Apache-2.0; see Assets/SceneGIS/Occlusion.
uniform sampler2D u_sceneGISDirectionalOcclusion;
vec3 sceneGISOcclusionCoatDirection;

float sceneGISDiffuseVisibility()
{
    return texelFetch(u_sceneGISDirectionalOcclusion, ivec2(gl_FragCoord.xy), 0).r;
}

float sceneGISCapIntersection(float cosA, float cosB, float cosDistance)
{
    float a = acos(cosA);
    float b = acos(cosB);
    float d = acos(clamp(cosDistance, -1.0, 1.0));
    float smallerArea = 1.0 - max(cosA, cosB);
    if (d <= abs(a - b)) { return smallerArea; }
    if (d >= a + b) { return 0.0; }
    float x = 1.0 - (d - abs(a - b)) / (2.0 * min(a, b));
    return x * x * (3.0 - 2.0 * x) * smallerArea;
}

float sceneGISSpecularVisibility(vec3 reflectionEC, float perceptualRoughness)
{
    vec4 data = texelFetch(u_sceneGISDirectionalOcclusion, ivec2(gl_FragCoord.xy), 0);
    float alpha = perceptualRoughness * perceptualRoughness;
    // An open aperture is identity. Near-mirror cones are unreliable with one depth layer.
    if (data.r >= 1.0 || alpha <= 0.01) { return 1.0; }
    float fade = smoothstep(0.01, 0.09, alpha);
    if (data.r <= 0.0) { return 1.0 - fade; }
    vec3 bent = normalize(data.gba * 2.0 - 1.0);
    float cosVisibility = sqrt(1.0 - data.r);
    float cosReflection = exp2(-3.32192809489 * alpha * alpha);
    float overlap = sceneGISCapIntersection(cosVisibility, cosReflection, dot(bent, reflectionEC));
    return mix(1.0, clamp(overlap / (1.0 - cosReflection), 0.0, 1.0), fade);
}
