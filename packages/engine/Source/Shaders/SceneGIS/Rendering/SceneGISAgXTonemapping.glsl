/**
 * @license
 * AgX adapted from three.js r179, commit 54ac263593c81b669ca9a089491ddd9e240427d2,
 * src/renderers/shaders/ShaderChunk/tonemapping_pars_fragment.glsl.js.
 * Based on Filament's Rec.2020 implementation of Blender AgX.
 * https://github.com/google/filament/pull/7236
 *
 * The MIT License
 * Copyright (c) 2010-2025 three.js authors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;
#ifdef AUTO_EXPOSURE
uniform sampler2D autoExposure;
#else
uniform float exposure;
#endif

vec3 sceneGISAgXContrast(vec3 x)
{
    vec3 x2 = x * x;
    vec3 x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4
        - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

// Input and output are linear Rec.709. Exposure is applied by the caller once.
vec3 sceneGISAgXTonemapping(vec3 color)
{
    const mat3 toRec2020 = mat3(
        vec3(0.6274, 0.0691, 0.0164),
        vec3(0.3293, 0.9195, 0.0880),
        vec3(0.0433, 0.0113, 0.8956));
    const mat3 toRec709 = mat3(
        vec3(1.6605, -0.1246, -0.0182),
        vec3(-0.5876, 1.1329, -0.1006),
        vec3(-0.0728, -0.0083, 1.1187));
    const mat3 inset = mat3(
        vec3(0.856627153315983, 0.137318972929847, 0.11189821299995),
        vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
        vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
    const mat3 outset = mat3(
        vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
        vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
        vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
    const float minEv = -12.47393;
    const float maxEv = 4.026069;

    color = inset * (toRec2020 * color);
    color = log2(max(color, vec3(1e-10)));
    color = clamp((color - minEv) / (maxEv - minEv), 0.0, 1.0);
    color = outset * sceneGISAgXContrast(color);
    // AgX returns to linear RGB here; the display gamma still follows once.
    color = pow(max(color, vec3(0.0)), vec3(2.2));
    return clamp(toRec709 * color, 0.0, 1.0);
}

void main()
{
    vec4 inputColor = texture(colorTexture, v_textureCoordinates);
    vec3 color = inputColor.rgb;
#ifdef AUTO_EXPOSURE
    color /= texture(autoExposure, vec2(0.5)).r;
#else
    color *= exposure;
#endif
#ifdef SCENEGIS_COLOR_GRADING
    color = sceneGIS_gradeColor(color);
#endif
    color = sceneGISAgXTonemapping(color);
    out_FragColor = vec4(czm_inverseGamma(color), inputColor.a);
}
