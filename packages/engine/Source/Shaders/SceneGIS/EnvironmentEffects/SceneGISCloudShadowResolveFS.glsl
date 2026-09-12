precision highp float;

in vec2 v_textureCoordinates;

uniform sampler2D u_sceneGISCloudShadowCurrentTexture;
uniform sampler2D u_sceneGISCloudShadowDepthVelocityTexture;
uniform sampler2D u_sceneGISCloudShadowHistoryTexture;
uniform float u_sceneGISCloudShadowResolution;
uniform int u_sceneGISCloudShadowCascadeCount;
uniform bool u_sceneGISCloudShadowHistoryValid;

ivec2 sceneGISCloudShadowTileOffset(ivec2 pixel)
{
    int resolution = int(u_sceneGISCloudShadowResolution);
    return ivec2(pixel.x / resolution, pixel.y / resolution) * resolution;
}

ivec2 sceneGISCloudShadowClampedPixel(
    ivec2 tileOffset,
    ivec2 pixelOffset)
{
    int resolution = int(u_sceneGISCloudShadowResolution);
    return clamp(
        tileOffset + pixelOffset,
        tileOffset,
        tileOffset + ivec2(resolution - 1));
}

void main()
{
    ivec2 atlasPixel = ivec2(gl_FragCoord.xy);
    int resolution = int(u_sceneGISCloudShadowResolution);
    ivec2 tile = atlasPixel / resolution;
    int cascade = tile.y * 2 + tile.x;
    vec4 current = texelFetch(
        u_sceneGISCloudShadowCurrentTexture,
        atlasPixel,
        0);
    if (!u_sceneGISCloudShadowHistoryValid ||
        cascade >= u_sceneGISCloudShadowCascadeCount) {
        out_FragColor = current;
        return;
    }

    ivec2 tileOffset = sceneGISCloudShadowTileOffset(atlasPixel);
    ivec2 localPixel = atlasPixel - tileOffset;
    vec4 closest = vec4(0.0, 0.0, 0.0, -1.0);
    vec4 neighborhoodMinimum = vec4(65504.0);
    vec4 neighborhoodMaximum = vec4(-65504.0);
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            ivec2 samplePixel = sceneGISCloudShadowClampedPixel(
                tileOffset,
                localPixel + ivec2(x, y));
            vec4 sampleValue = texelFetch(
                u_sceneGISCloudShadowCurrentTexture,
                samplePixel,
                0);
            vec4 depthVelocity = texelFetch(
                u_sceneGISCloudShadowDepthVelocityTexture,
                samplePixel,
                0);
            neighborhoodMinimum = min(neighborhoodMinimum, sampleValue);
            neighborhoodMaximum = max(neighborhoodMaximum, sampleValue);
            if (depthVelocity.a > 0.5 &&
                (closest.a < 0.0 || depthVelocity.r < closest.r)) {
                closest = depthVelocity;
            }
        }
    }
    if (closest.a < 0.0) {
        out_FragColor = current;
        return;
    }

    vec2 currentLocalUv = (vec2(localPixel) + 0.5) /
        u_sceneGISCloudShadowResolution;
    vec2 previousLocalUv = currentLocalUv -
        closest.gb / u_sceneGISCloudShadowResolution;
    if (any(lessThan(previousLocalUv, vec2(0.0))) ||
        any(greaterThan(previousLocalUv, vec2(1.0)))) {
        out_FragColor = current;
        return;
    }
    vec2 tileHalfTexel = vec2(0.5 / u_sceneGISCloudShadowResolution);
    previousLocalUv = clamp(
        previousLocalUv,
        tileHalfTexel,
        vec2(1.0) - tileHalfTexel);
    vec2 previousAtlasUv =
        (vec2(tile) + previousLocalUv) * 0.5;
    vec4 history = texture(
        u_sceneGISCloudShadowHistoryTexture,
        previousAtlasUv);
    history = clamp(history, neighborhoodMinimum, neighborhoodMaximum);
    out_FragColor = mix(history, current, 0.01);
}
