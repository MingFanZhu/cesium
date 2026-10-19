in vec4 v_color;
in vec4 v_westPlane;
in vec4 v_southPlane;
in vec2 v_inverseExtents;
uniform bool u_sceneGISGroundAreaColor;

void main()
{
    // Stencil establishes the exact polygon (including holes). Extent clipping
    // assigns that coverage to its instance even when volumes overlap on screen.
    if (u_sceneGISGroundAreaColor)
    {
        float depth = czm_unpackDepth(texture(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw));
        vec4 surface = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
        vec3 surfaceEC = surface.xyz / surface.w;
        vec2 uv = vec2(czm_planeDistance(v_westPlane, surfaceEC),
                       czm_planeDistance(v_southPlane, surfaceEC)) * v_inverseExtents;
        if (depth == 0.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)
        {
            discard;
        }
    }
    out_FragColor = czm_gammaCorrect(v_color);
    out_FragColor.rgb *= out_FragColor.a;
    czm_writeDepthClamp();
}
