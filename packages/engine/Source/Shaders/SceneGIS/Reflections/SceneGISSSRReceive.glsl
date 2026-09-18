uniform sampler2D u_sceneGISSSRBase;
uniform sampler2D u_sceneGISSSRCoat;
vec3 sceneGISSSRCoatDirection;

vec3 sceneGISSSR(vec3 environment, vec3 directionEC, float roughness, bool coat)
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec4 hit = coat ? texelFetch(u_sceneGISSSRCoat, pixel, 0) : texelFetch(u_sceneGISSSRBase, pixel, 0);
    return mix(environment, hit.rgb, hit.a);
}
