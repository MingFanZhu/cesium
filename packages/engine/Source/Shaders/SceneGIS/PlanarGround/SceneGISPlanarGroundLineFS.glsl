in vec4 v_color;
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
    out_FragColor = czm_gammaCorrect(v_color);
    out_FragColor.rgb *= out_FragColor.a;
    czm_writeDepthClamp();
}
