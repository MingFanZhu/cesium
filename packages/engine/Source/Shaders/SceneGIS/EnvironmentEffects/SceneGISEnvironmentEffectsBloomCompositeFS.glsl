// Adapted from takram-design-engineering/three-geospatial, MIT License.
// Copyright (c) 2024 Shota Matsuda.
// Commit b012ad06d858fc035d88aacfd73f092f93c994e4:
// packages/effects/src/shaders/lensFlareFeatures.frag and lensFlareEffect.frag.

precision highp float;

in vec2 v_textureCoordinates;

uniform sampler2D u_colorTexture;
uniform sampler2D u_depthTexture;
uniform sampler2D u_bloomTexture;
uniform bool u_hasCurrentGlobeDepth;
uniform bool u_showBloom;
uniform bool u_showLensFlare;
uniform bool u_sunLensVisible;
uniform vec2 u_sunViewportCoordinates;
uniform float u_bloomThreshold;
uniform float u_bloomIntensity;
uniform float u_lensFlareIntensity;

float sceneGISLuminance(vec3 color)
{
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

vec3 sceneGISLensGhost(vec2 direction, vec3 tint, float offset)
{
    vec2 uv = clamp(
        1.0 - v_textureCoordinates + direction * offset,
        vec2(0.0),
        vec2(1.0));
    vec3 color = texture(u_bloomTexture, uv).rgb * tint;
    float perimeter = clamp(length(uv - 0.5) / 0.7071067812, 0.0, 1.0);
    return color * pow(1.0 - perimeter, 3.0);
}

float sceneGISCubicRingMask(float value, float radius, float thickness)
{
    float normalized = min(abs(value - radius) / thickness, 1.0);
    return 1.0 - normalized * normalized * (3.0 - 2.0 * normalized);
}

vec3 sceneGISLensHalo(vec2 aspectRatio, vec2 texelSize)
{
    vec2 direction = normalize(
        (v_textureCoordinates - 0.5) / aspectRatio) * aspectRatio;
    vec3 offset = vec3(texelSize.x * 10.0) * vec3(-1.0, 0.0, 1.0);
    vec2 uv = fract(1.0 - v_textureCoordinates + direction * 0.3);
    vec3 color = vec3(
        texture(u_bloomTexture, uv + direction * offset.r).r,
        texture(u_bloomTexture, uv + direction * offset.g).g,
        texture(u_bloomTexture, uv + direction * offset.b).b);
    vec2 weightedUv =
        (v_textureCoordinates - vec2(0.5, 0.0)) / aspectRatio +
        vec2(0.5, 0.0);
    float distanceFromCenter = clamp(
        distance(weightedUv, vec2(0.5)),
        0.0,
        1.0);
    return color * sceneGISCubicRingMask(distanceFromCenter, 0.45, 0.25);
}

void main()
{
    vec4 inputColor = texture(u_colorTexture, v_textureCoordinates);
    vec3 bloom = texture(u_bloomTexture, v_textureCoordinates).rgb;
    vec3 result = inputColor.rgb + (u_showBloom ? bloom * u_bloomIntensity : vec3(0.0));

    float sunDepth = texture(u_depthTexture, u_sunViewportCoordinates).r;
    vec3 sunSignal = texture(u_colorTexture, u_sunViewportCoordinates).rgb;
    bool clearSun = !u_hasCurrentGlobeDepth ||
        sunDepth == 0.0 || sunDepth == 1.0;
    float signal = smoothstep(
        u_bloomThreshold,
        u_bloomThreshold + 1.0,
        sceneGISLuminance(sunSignal)
    );
    if (u_showLensFlare && u_sunLensVisible && clearSun && signal > 0.0)
    {
        vec2 direction = v_textureCoordinates - 0.5;
        vec3 features = vec3(0.0);
        features += sceneGISLensGhost(direction, vec3(0.8, 0.8, 1.0), -5.0);
        features += sceneGISLensGhost(direction, vec3(1.0, 0.8, 0.4), -1.5);
        features += sceneGISLensGhost(direction, vec3(0.9, 1.0, 0.8), -0.4);
        features += sceneGISLensGhost(direction, vec3(1.0, 0.8, 0.4), -0.2);
        features += sceneGISLensGhost(direction, vec3(0.9, 0.7, 0.7), -0.1);
        features += sceneGISLensGhost(direction, vec3(0.5, 1.0, 0.4), 0.7);
        features += sceneGISLensGhost(direction, vec3(0.5), 1.0);
        features += sceneGISLensGhost(direction, vec3(1.0, 1.0, 0.6), 2.5);
        features += sceneGISLensGhost(direction, vec3(0.5, 0.8, 1.0), 10.0);
        vec2 bloomDimensions = vec2(textureSize(u_bloomTexture, 0));
        vec2 aspectRatio = vec2(
            bloomDimensions.y / bloomDimensions.x,
            1.0);
        features += sceneGISLensHalo(aspectRatio, 1.0 / bloomDimensions);
        result += features * (u_lensFlareIntensity * signal * 1.0e-5);
    }

    if (any(isnan(result)) || any(isinf(result)))
    {
        result = inputColor.rgb;
    }
    result = min(max(result, vec3(0.0)), vec3(65504.0));
    out_FragColor = vec4(result, inputColor.a);
}
