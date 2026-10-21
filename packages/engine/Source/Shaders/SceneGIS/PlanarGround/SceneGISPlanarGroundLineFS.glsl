#ifndef SCENEGIS_GROUND_MATERIAL
in vec4 v_color;
#else
in vec4 v_lineTexture;
#endif
in vec4 v_startPlane;
in vec4 v_endPlane;
in vec4 v_rightPlane;
in float v_halfWidth;

void main()
{
    float depth = czm_unpackDepth(texture(czm_globeDepthTexture,
        gl_FragCoord.xy / czm_viewport.zw));
    if (depth == 0.0 || v_halfWidth == 0.0) {
        discard;
    }
    vec4 surfaceEC = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
    surfaceEC /= surfaceEC.w;
    float halfWidth = v_halfWidth * czm_metersPerPixel(surfaceEC);
    if (abs(dot(v_rightPlane, surfaceEC)) > halfWidth ||
        dot(v_startPlane, surfaceEC) < 0.0 ||
        dot(v_endPlane, surfaceEC) < 0.0) {
        discard;
    }
#ifdef SCENEGIS_GROUND_MATERIAL
    float fromStart = max(dot(v_startPlane, surfaceEC), 0.0) / v_lineTexture.z;
    float fromEnd = max(dot(v_endPlane, surfaceEC), 0.0) / v_lineTexture.w;
    float progress = fromStart / max(fromStart + fromEnd, 1.0e-7);
    vec2 st = vec2(v_lineTexture.x + progress * v_lineTexture.y,
        0.5 + dot(v_rightPlane, surfaceEC) / (2.0 * halfWidth));
    czm_materialInput materialInput;
    materialInput.s = st.s;
    materialInput.st = st;
    materialInput.str = vec3(st, 0.0);
    czm_material material = czm_getMaterial(materialInput);
    out_FragColor = vec4(material.diffuse + material.emission, material.alpha);
#else
    out_FragColor = czm_gammaCorrect(v_color);
#endif
    out_FragColor.rgb *= out_FragColor.a;
    czm_writeDepthClamp();
}
