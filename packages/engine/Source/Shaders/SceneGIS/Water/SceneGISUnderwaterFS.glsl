uniform sampler2D u_edges;
uniform int u_edgeCount;
uniform mat4 u_eyeToWater;
uniform mat3 u_waterToEye;
uniform vec3 u_absorption;
uniform vec3 u_scattering;
uniform bool u_mediumOptics;
uniform vec3 u_waterColor;
uniform float u_scatteringAnisotropy;
in vec2 v_textureCoordinates;

float cross2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }

void main()
{
    vec2 pixel = gl_FragCoord.xy;
    // Start at the eye-plane intercept; also supports orthographic rays.
    vec3 originEC = sceneGISSSRPosition(pixel, 0.0);
    vec3 origin = (u_eyeToWater * vec4(originEC, 1.0)).xyz;
    vec3 directionEC = normalize(sceneGISSSRPosition(pixel, 1.0) - originEC);
    vec3 direction = normalize(mat3(u_eyeToWater) * directionEC);
    bool inside = false;
    float distance = 1e20;
    for (int i = 0; i < u_edgeCount; ++i) {
        vec4 edge = texelFetch(u_edges, ivec2(i, 0), 0);
        vec2 a = edge.xy, b = edge.zw;
        if ((a.y > origin.y) != (b.y > origin.y) &&
            origin.x < (b.x - a.x) * (origin.y - a.y) / (b.y - a.y) + a.x) { inside = !inside; }
        vec2 segment = b - a;
        float denominator = cross2(direction.xy, segment);
        if (abs(denominator) > 1e-8) {
            float t = cross2(a - origin.xy, segment) / denominator;
            float u = cross2(a - origin.xy, direction.xy) / denominator;
            if (t > 0.0 && u >= 0.0 && u <= 1.0) { distance = min(distance, t); }
        }
    }
    if (!inside || origin.z >= 0.0 || origin.z <= -u_underwaterDepth) { discard; }
    if (direction.z > 0.0) { distance = min(distance, -origin.z / direction.z); }
    if (direction.z < 0.0) { distance = min(distance, (-u_underwaterDepth - origin.z) / direction.z); }
    float opaqueDepth = texture(u_depth, v_textureCoordinates).r;
    float opaqueDistance = opaqueDepth > 0.0 ? length(sceneGISSSRPosition(pixel, opaqueDepth) - originEC) : 1e20;
    distance = min(distance, opaqueDistance);
    vec3 end = origin + direction * distance;
    vec3 up = u_waterToEye * vec3(0.0, 0.0, 1.0);
    vec3 beam = czm_lightColorHdr;
    vec3 sky = vec3(1.0);
    #ifdef SCENEGIS_WATER_PHYSICAL
    beam = sceneGISModelDirectSource(originEC, beam);
    sky = sceneGISModelSkyIrradiance(originEC, up);
    #endif
    vec3 background = texture(u_color, v_textureCoordinates).rgb;
    float airCosine = max(dot(up, czm_lightDirectionEC), 0.0);
    if (opaqueDistance <= distance && end.z < 0.0) {
        float footprint = max(length(dFdx(end.xy)), length(dFdy(end.xy)));
        background *= sceneGISWaterCaustics(end.xy, -end.z, footprint, airCosine);
    }
    vec3 color;
    if (u_mediumOptics) {
        float eta = 1.0 / 1.333;
        float lightCosine = sqrt(1.0 - eta * eta * (1.0 - airCosine * airCosine));
        vec3 light = normalize(czm_lightDirectionEC);
        vec3 travel = -eta * (light - up * dot(up, light)) - up * lightCosine;
        vec3 direct = beam * (airCosine / lightCosine) * (1.0 - sceneGISWaterFresnel(airCosine)) *
            sceneGISWaterPhase(dot(travel, -directionEC), u_scatteringAnisotropy);
        color = sceneGISWaterUnderwater(background, u_absorption, u_scattering, distance,
            -origin.z, max(-end.z, 0.0), direct, sky * 0.49, lightCosine);
    } else {
        vec3 transmission = exp(-u_absorption * distance);
        color = background * transmission + u_waterColor * sky * (vec3(1.0) - transmission);
    }
    out_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
