uniform float u_causticsIntensity;

void sceneGISWaterCausticWave(vec2 windPhase, vec2 riverPhase, vec3 flow, float spacing,
    out vec3 displacement, out vec3 normal)
{
    #ifdef SCENEGIS_WIND_WAVES
    windPhase = mod(windPhase, u_wavePeriod * 4.0);
    #endif
    vec3 position;
    sceneGISWaterWave(windPhase, spacing, position, normal);
    displacement = position - vec3(windPhase, 0.0);
    #ifdef SCENEGIS_RIVER_WATER
    float h = max(spacing, u_currentRippleLength / 128.0);
    float height = sceneGISRiverHeight(riverPhase, flow.xy, flow.z, spacing);
    vec2 gradient = vec2(
        sceneGISRiverHeight(riverPhase + vec2(h, 0.0), flow.xy, flow.z, spacing) -
        sceneGISRiverHeight(riverPhase - vec2(h, 0.0), flow.xy, flow.z, spacing),
        sceneGISRiverHeight(riverPhase + vec2(0.0, h), flow.xy, flow.z, spacing) -
        sceneGISRiverHeight(riverPhase - vec2(0.0, h), flow.xy, flow.z, spacing)) / (2.0 * h);
    #ifndef SCENEGIS_WIND_WAVES
    normal = vec3(0.0, 0.0, 1.0);
    #endif
    normal = normalize(vec3(normal.xy / max(normal.z, 0.1) - gradient, 1.0));
    displacement.z += height;
    #endif
}


vec3 sceneGISWaterCausticProject(vec3 position, vec3 ray, vec3 receiver, vec3 receiverNormal)
{
    float travel = dot(receiver - position, receiverNormal) / min(dot(ray, receiverNormal), -0.01);
    return position + ray * max(travel, 0.0);
}

void sceneGISWaterCausticPair(vec3 source, vec3 meanNormal, mat3 waveFrame,
    vec2 windPhase, vec2 riverPhase, vec3 flow, float spacing, float fade,
    vec3 receiver, vec3 receiverNormal, vec3 light, out vec3 reference, out vec3 focused)
{
    vec3 displacement, waveNormal;
    sceneGISWaterCausticWave(windPhase, riverPhase, flow, spacing, displacement, waveNormal);
    vec3 position = source + waveFrame * displacement * fade;
    vec3 normal = normalize(meanNormal + waveFrame * vec3(waveNormal.xy / max(waveNormal.z, 0.1) * fade, 0.0));
    reference = sceneGISWaterCausticProject(source, refract(-light, meanNormal, 1.0 / 1.333), receiver, receiverNormal);
    focused = sceneGISWaterCausticProject(position, refract(-light, normal, 1.0 / 1.333), receiver, receiverNormal);
}

// Single-branch local focusing on visible opaque receivers. Metric differences
// avoid magnifying bilinear/half-float texel derivatives into visible caustic cells.
float sceneGISWaterCaustics(vec3 receiver, vec3 meanOrigin, vec3 meanNormal, mat3 waveFrame,
    vec2 windPhase, vec2 riverPhase, vec3 flow, float waveFade, bool validReceiver)
{
    if (u_causticsIntensity == 0.0) { return 1.0; }
    vec3 light = normalize(czm_lightDirectionEC);
    vec3 meanRay = refract(-light, meanNormal, 1.0 / 1.333);
    float normalDepth = dot(meanOrigin - receiver, meanNormal);
    float vertical = max(dot(waveFrame[2], meanNormal), 0.05);
    float depth = normalDepth / vertical;
    float meanTravel = max(normalDepth, 0.0) / max(-dot(meanRay, meanNormal), 0.05);
    vec3 source = receiver - meanRay * meanTravel;
    vec2 offset = (transpose(waveFrame) * (source - meanOrigin)).xy;
    windPhase += offset;
    riverPhase += offset;
    float spacing = max(0.02, max(length(dFdx(windPhase)), length(dFdy(windPhase))));
    vec3 receiverCross = cross(dFdx(receiver), dFdy(receiver));
    float receiverArea = length(receiverCross);
    vec3 receiverNormal = receiverCross / max(receiverArea, 1e-18);
    if (dot(receiverNormal, meanNormal) < 0.0) { receiverNormal = -receiverNormal; }
    // All screen derivatives are evaluated before per-pixel validity rejection.
    if (!validReceiver || depth <= 0.0 || receiverArea <= 1e-18) { return 1.0; }
    float h = max(spacing, 0.05);
    #ifdef SCENEGIS_WIND_WAVES
    h = max(h, u_wavePeriod * 0.125 / u_waveResolution);
    #endif
    #ifdef SCENEGIS_RIVER_WATER
    h = max(h, u_currentRippleLength / 64.0);
    #endif
    vec3 tx = waveFrame[0] - waveFrame[2] * dot(waveFrame[0], meanNormal) / vertical;
    vec3 ty = waveFrame[1] - waveFrame[2] * dot(waveFrame[1], meanNormal) / vertical;
    vec3 sx0, sx1, sy0, sy1, rx0, rx1, ry0, ry1;
    sceneGISWaterCausticPair(source - tx*h, meanNormal, waveFrame, windPhase-vec2(h,0.0), riverPhase-vec2(h,0.0), flow,
        spacing, waveFade, receiver, receiverNormal, light, sx0, rx0);
    sceneGISWaterCausticPair(source + tx*h, meanNormal, waveFrame, windPhase+vec2(h,0.0), riverPhase+vec2(h,0.0), flow,
        spacing, waveFade, receiver, receiverNormal, light, sx1, rx1);
    sceneGISWaterCausticPair(source - ty*h, meanNormal, waveFrame, windPhase-vec2(0.0,h), riverPhase-vec2(0.0,h), flow,
        spacing, waveFade, receiver, receiverNormal, light, sy0, ry0);
    sceneGISWaterCausticPair(source + ty*h, meanNormal, waveFrame, windPhase+vec2(0.0,h), riverPhase+vec2(0.0,h), flow,
        spacing, waveFade, receiver, receiverNormal, light, sy1, ry1);
    float sourceArea = length(cross(sx1-sx0, sy1-sy0));
    float focusedArea = length(cross(rx1-rx0, ry1-ry0));
    float focus = sourceArea / max(max(focusedArea, sourceArea * 0.125), 1e-18);
    float facing = max(dot(receiverNormal, meanNormal), 0.0);
    float visibility = exp(-depth * 0.12) * smoothstep(0.0, 0.3, dot(meanNormal, light)) * facing * facing;
    return max(0.0, 1.0 + (clamp(focus, 0.0, 8.0) - 1.0) * u_causticsIntensity * 0.5 * visibility);
}
