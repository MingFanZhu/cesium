// Adapted from the separable blur topology in
// takram-design-engineering/three-geospatial, MIT License.
// Copyright (c) 2024 Shota Matsuda.
// Commit b012ad06d858fc035d88aacfd73f092f93c994e4:
// packages/effects/src/LensFlareEffect.ts.

precision highp float;

in vec2 v_textureCoordinates;

uniform sampler2D u_bloomTexture;
uniform vec2 u_bloomDirection;

void main()
{
    vec2 offset = u_bloomDirection / vec2(textureSize(u_bloomTexture, 0));
    vec3 color = texture(u_bloomTexture, v_textureCoordinates).rgb * 0.2270270270;
    color += texture(u_bloomTexture, v_textureCoordinates + offset * 1.3846153846).rgb * 0.3162162162;
    color += texture(u_bloomTexture, v_textureCoordinates - offset * 1.3846153846).rgb * 0.3162162162;
    color += texture(u_bloomTexture, v_textureCoordinates + offset * 3.2307692308).rgb * 0.0702702703;
    color += texture(u_bloomTexture, v_textureCoordinates - offset * 3.2307692308).rgb * 0.0702702703;
    out_FragColor = vec4(color, 1.0);
}
