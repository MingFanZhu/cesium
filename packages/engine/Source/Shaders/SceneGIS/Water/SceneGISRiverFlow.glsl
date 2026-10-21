#ifdef SCENEGIS_RIVER_WATER
uniform float u_riverTime;
uniform float u_currentSpeedScale;
uniform float u_currentRippleLength;
uniform float u_currentRippleAmplitude;
uniform float u_currentFoamIntensity;

void sceneGISRiverPhases(vec3 data, out vec2 a, out vec2 b, out float weight)
{
    float phase = fract(u_riverTime / 32.0);
    float second = fract(phase + 0.5);
    // The wrapping phase has zero value and first derivative in the blend.
    weight = 0.5 + 0.5 * cos(czm_twoPi * phase);
    float travel = data.z * u_currentSpeedScale * 32.0;
    a = (data.xy - vec2(phase * travel, 0.0)) / u_currentRippleLength;
    b = (data.xy - vec2(second * travel, 0.0)) / u_currentRippleLength;
}

float sceneGISRiverWave(vec2 p, float footprint)
{
    // Non-harmonic downstream bands break up parallel crests. Positive station
    // frequencies follow bends in the river chart, not a world-space wind vector.
    vec4 phase = czm_twoPi * vec4(dot(p, vec2(1.0, 0.11)),
        dot(p, vec2(0.71, -0.16)), dot(p, vec2(1.63, 0.29)),
        dot(p, vec2(2.81, -0.34))) + vec4(0.0, 1.7, 3.1, 0.8);
    // Slowly bend and modulate the crests so the channel is not covered by ruler-straight stripes.
    phase += sin(p.y * 1.1 + 0.35 * sin(p.x * 0.7)) * vec4(1.3, 0.7, 1.6, 0.9);
    float envelope = 0.75 + 0.25 * sin(dot(p, vec2(0.31, 0.53)));
    vec4 k = czm_twoPi * vec4(1.12, 0.79, 1.79, 2.91);
    vec4 filterWeight = exp(-k * k * footprint * footprint);
    // Absolute weights sum to one: currentRippleAmplitude bounds all displacement.
    return envelope * dot(sin(phase), vec4(0.48, 0.27, 0.16, 0.09) * filterWeight);
}

#ifdef SCENEGIS_RIVER_VERTEX
float sceneGISRiverHeight(vec3 data, float spacing)
{
    vec2 a, b;
    float weight;
    sceneGISRiverPhases(data, a, b, weight);
    float footprint = spacing / u_currentRippleLength;
    return u_currentRippleAmplitude * mix(sceneGISRiverWave(a, footprint),
        sceneGISRiverWave(b, footprint), weight);
}
#else
in vec3 v_riverData;

float sceneGISRiverStreak(vec2 p)
{
    return 0.5 + 0.25 * sin(dot(p, vec2(1.3, 7.1))) +
        0.25 * cos(dot(p, vec2(0.7, 4.3)) + sin(p.x * 0.6));
}

vec2 sceneGISRiverCurrent()
{
    vec2 a, b;
    float weight;
    sceneGISRiverPhases(v_riverData, a, b, weight);
    // Filter each phase independently; the wrapping phase must not affect the active one.
    float footprintA = max(length(dFdx(a)), length(dFdy(a)));
    float footprintB = max(length(dFdx(b)), length(dFdy(b)));
    float height = mix(sceneGISRiverWave(a, footprintA), sceneGISRiverWave(b, footprintB), weight);
    float foamA = mix(0.5, sceneGISRiverStreak(a), exp(-40.0 * footprintA * footprintA));
    float foamB = mix(0.5, sceneGISRiverStreak(b), exp(-40.0 * footprintB * footprintB));
    return vec2(height, mix(foamA, foamB, weight));
}

vec3 sceneGISRiverNormal(vec3 normal, vec3 up, float height)
{
    // Convert derivatives of the advected height into an eye-space surface gradient.
    // This follows bends and varying widths instead of using one global flow direction.
    vec3 dx = dFdx(v_waterBaseEC), dy = dFdy(v_waterBaseEC);
    vec3 r1 = cross(dy, up), r2 = cross(up, dx);
    float determinant = dot(dx, r1);
    vec3 gradient = (dFdx(height) * r1 + dFdy(height) * r2) /
        (sign(determinant) * max(abs(determinant), 1.0e-12));
    return normalize(normal - gradient);
}
#endif
#endif
