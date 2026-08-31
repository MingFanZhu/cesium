// Adapted from takram-design-engineering/three-geospatial, MIT License.
// Copyright (c) 2024 Shota Matsuda.
// Commit b012ad06d858fc035d88aacfd73f092f93c994e4:
// packages/effects/src/shaders/downsampleThreshold.frag.

precision highp float;

in vec2 v_textureCoordinates;

uniform sampler2D u_colorTexture;
uniform float u_bloomThreshold;

float sceneGISLuminance(vec3 color)
{
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

void main()
{
    vec2 texel = 1.0 / vec2(textureSize(u_colorTexture, 0));
    vec3 color = vec3(0.0);
    color += texture(u_colorTexture, v_textureCoordinates + texel * vec2(-0.5, -0.5)).rgb;
    color += texture(u_colorTexture, v_textureCoordinates + texel * vec2( 0.5, -0.5)).rgb;
    color += texture(u_colorTexture, v_textureCoordinates + texel * vec2(-0.5,  0.5)).rgb;
    color += texture(u_colorTexture, v_textureCoordinates + texel * vec2( 0.5,  0.5)).rgb;
    color *= 0.25;
    if (any(isnan(color)) || any(isinf(color)))
    {
        out_FragColor = vec4(0.0);
        return;
    }
    float weight = smoothstep(u_bloomThreshold, u_bloomThreshold + 1.0, sceneGISLuminance(color));
    out_FragColor = vec4(color * weight, 1.0);
}
