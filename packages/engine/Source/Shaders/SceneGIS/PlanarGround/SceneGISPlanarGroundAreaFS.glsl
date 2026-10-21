#ifdef SCENEGIS_GROUND_MATERIAL
in vec2 v_rotation;
uniform bool u_sceneGISGroundAreaPick;
#else
in vec4 v_color;
#endif
in vec4 v_westPlane;
in vec4 v_southPlane;
in vec2 v_inverseExtents;
uniform bool u_sceneGISGroundAreaColor;

void main()
{
#ifdef SCENEGIS_GROUND_MATERIAL
    // Stencil coverage must not depend on material alpha or texture readiness.
    out_FragColor = vec4(1.0);
#endif
    // Stencil establishes the exact polygon (including holes). Extent clipping
    // assigns that coverage to its instance even when volumes overlap on screen.
    if (u_sceneGISGroundAreaColor)
    {
        float depth = czm_unpackDepth(texture(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw));
        vec4 surface = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
        vec3 surfaceEC = surface.xyz / surface.w;
        vec2 uv = vec2(czm_planeDistance(v_westPlane, surfaceEC),
                       czm_planeDistance(v_southPlane, surfaceEC)) * v_inverseExtents;
#ifdef SCENEGIS_GROUND_MATERIAL
        vec2 st = mat2(v_rotation.x, v_rotation.y, -v_rotation.y, v_rotation.x) * (uv - 0.5) + 0.5;
        vec3 dx = dFdx(surfaceEC);
        vec3 dy = dFdy(surfaceEC);
        vec2 sx = dFdx(st);
        vec2 sy = dFdy(st);
#endif
        if (depth == 0.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0)
        {
            discard;
        }
#ifdef SCENEGIS_GROUND_MATERIAL
        if (!u_sceneGISGroundAreaPick)
        {
            vec3 normalEC = normalize(cross(dx, dy));
            vec3 upEC = normalize(czm_normal * vec3(0.0, 0.0, 1.0));
            normalEC *= dot(normalEC, upEC) < 0.0 ? -1.0 : 1.0;
#ifdef FACE_FORWARD
            normalEC = faceforward(normalEC, surfaceEC, normalEC);
#endif
            float orientation = sign(sx.x * sy.y - sx.y * sy.x);
            vec3 tangent = normalize((dx * sy.y - dy * sx.y) * orientation);
            vec3 bitangent = normalize(cross(normalEC, tangent));
            czm_materialInput materialInput;
            materialInput.s = st.x;
            materialInput.st = st;
            materialInput.str = vec3(st, 0.0);
            materialInput.normalEC = normalEC;
            materialInput.positionToEyeEC = -surfaceEC;
            materialInput.tangentToEyeMatrix = mat3(tangent, bitangent, normalEC);
            czm_material material = czm_getMaterial(materialInput);
#ifdef FLAT
            out_FragColor = vec4(material.diffuse + material.emission, material.alpha);
#else
            out_FragColor = czm_phong(normalize(-surfaceEC), material, czm_lightDirectionEC);
#endif
        }
#endif
    }
#ifndef SCENEGIS_GROUND_MATERIAL
    out_FragColor = czm_gammaCorrect(v_color);
#endif
    out_FragColor.rgb *= out_FragColor.a;
    czm_writeDepthClamp();
}
