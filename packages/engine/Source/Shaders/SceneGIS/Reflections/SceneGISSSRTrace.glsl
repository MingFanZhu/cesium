uniform sampler2D u_baseRay;
uniform sampler2D u_coatRay;
layout(location = 1) out vec4 sceneGISSSRCoat;

void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    float depth = texelFetch(u_depth, pixel, 0).r;
    out_FragColor = vec4(0.0);
    sceneGISSSRCoat = vec4(0.0);
    if (depth <= 0.0) { return; }
    vec3 position = sceneGISSSRPosition(gl_FragCoord.xy, depth);
    out_FragColor = sceneGISSSRTrace(position, texelFetch(u_baseRay, pixel, 0));
    sceneGISSSRCoat = sceneGISSSRTrace(position, texelFetch(u_coatRay, pixel, 0));
}
