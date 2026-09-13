uniform vec4 u_color;
uniform vec2 u_depthRange;
uniform bool u_lighting;
void main()
{
    float depth = czm_unpackDepth(texture(czm_globeDepthTexture, gl_FragCoord.xy / czm_viewport.zw));
    if (depth == 0.0 || depth == 1.0) discard;
    vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
    eye /= eye.w;
    if (-eye.z <= u_depthRange.x || -eye.z > u_depthRange.y) discard;
    vec4 color = czm_gammaCorrect(u_color);
    if (u_lighting) {
        vec3 normal = normalize(cross(dFdx(eye.xyz), dFdy(eye.xyz)));
        vec3 world = (czm_inverseView * eye).xyz;
        if (dot(mat3(czm_inverseView) * normal, world) < 0.0) normal = -normal;
        color.rgb *= 0.4 + 0.6 * max(0.0, dot(normal, czm_lightDirectionEC));
    }
    color.rgb *= color.a;
    out_FragColor = color;
}
