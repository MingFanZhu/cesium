uniform samplerCube u_sceneGISProbe0;
uniform samplerCube u_sceneGISProbe1;
uniform samplerCube u_sceneGISVisibility0;
uniform samplerCube u_sceneGISVisibility1;
uniform mat4 u_sceneGISProbeMatrix0;
uniform mat4 u_sceneGISProbeMatrix1;
uniform vec4 u_sceneGISProbeBox0;
uniform vec4 u_sceneGISProbeBox1;
uniform vec4 u_sceneGISProbeState;
uniform vec2 u_sceneGISProbeReady;

float sceneGISProbeWeight(vec3 p, vec4 box)
{
    vec3 edge = box.xyz - abs(p);
    return smoothstep(0.0, box.w, min(edge.x, min(edge.y, edge.z)));
}

vec2 sceneGISProbeWeights(vec3 positionEC, out vec3 p0, out vec3 p1)
{
    p0 = (u_sceneGISProbeMatrix0 * vec4(positionEC, 1.0)).xyz;
    p1 = (u_sceneGISProbeMatrix1 * vec4(positionEC, 1.0)).xyz;
    vec2 w = vec2(sceneGISProbeWeight(p0, u_sceneGISProbeBox0),
                  sceneGISProbeWeight(p1, u_sceneGISProbeBox1)) * u_sceneGISProbeReady;
    return w / max(1.0, w.x + w.y);
}

vec3 sceneGISProbeLookup(vec3 p, vec3 ray, vec3 halfSize)
{
    // The caller only samples inside the box. Parallel axes do not limit the exit.
    vec3 t;
    for (int i = 0; i < 3; ++i) {
        t[i] = abs(ray[i]) < 1e-7 ? 1e20 : (sign(ray[i]) * halfSize[i] - p[i]) / ray[i];
    }
    return p + ray * min(t.x, min(t.y, t.z));
}

vec3 sceneGISProbeRadiance(vec3 sky, vec3 positionEC, vec3 rayEC, float roughness)
{
    if (u_sceneGISProbeState.x == 0.0) return sky;
    vec3 p0, p1;
    vec2 w = sceneGISProbeWeights(positionEC, p0, p1);
    vec4 a = vec4(0.0, 0.0, 0.0, 1.0);
    vec4 b = a;
    float lod = roughness * u_sceneGISProbeState.w;
    if (w.x > 0.0) {
        vec3 ray = mat3(u_sceneGISProbeMatrix0) * rayEC;
        a = textureLod(u_sceneGISProbe0, sceneGISProbeLookup(p0, ray, u_sceneGISProbeBox0.xyz), lod);
    }
    if (w.y > 0.0) {
        vec3 ray = mat3(u_sceneGISProbeMatrix1) * rayEC;
        b = textureLod(u_sceneGISProbe1, sceneGISProbeLookup(p1, ray, u_sceneGISProbeBox1.xyz), lod);
    }
    if (u_sceneGISProbeState.y != 0.0) {
        return sky * (1.0 - w.x - w.y) + a.rgb * w.x + b.rgb * w.y;
    }
    float visibility = (1.0 - w.x - w.y) + a.a * w.x + b.a * w.y;
    return sky * mix(1.0, visibility, u_sceneGISProbeState.z);
}

float sceneGISProbeVisibility(vec3 positionEC, vec3 normalEC)
{
    if (u_sceneGISProbeState.x == 0.0 || u_sceneGISProbeState.z == 0.0) return 1.0;
    vec3 p0, p1;
    vec2 w = sceneGISProbeWeights(positionEC, p0, p1);
    float v = 1.0 - w.x - w.y;
    if (w.x > 0.0) v += w.x * texture(u_sceneGISVisibility0, mat3(u_sceneGISProbeMatrix0) * normalEC).r;
    if (w.y > 0.0) v += w.y * texture(u_sceneGISVisibility1, mat3(u_sceneGISProbeMatrix1) * normalEC).r;
    return clamp(v, 0.0, 1.0);
}
