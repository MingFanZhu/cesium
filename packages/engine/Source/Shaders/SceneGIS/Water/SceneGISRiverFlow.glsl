#ifdef SCENEGIS_RIVER_WATER
in vec3 v_riverData;
uniform float u_riverTime;
uniform float u_currentSpeedScale;
uniform float u_currentRippleLength;
uniform float u_currentRippleAmplitude;
uniform float u_currentFoamIntensity;

vec2 sceneGISRiverPattern(vec2 p)
{
    float ripple = 0.6 * sin(czm_twoPi * p.x + 0.5 * sin(p.y * 4.0)) +
        0.4 * sin(czm_twoPi * dot(p, vec2(0.63, 0.47)));
    float streak = 0.5 + 0.25 * sin(dot(p, vec2(1.3, 7.1))) +
        0.25 * cos(dot(p, vec2(0.7, 4.3)) + sin(p.x * 0.6));
    return vec2(ripple, streak);
}

vec2 sceneGISRiverCurrent()
{
    // Two staggered, bounded advections prevent indefinite texture stretching when
    // speed varies along the channel. Each wrap is hidden by its zero blend weight.
    float phase = fract(u_riverTime / 8.0);
    float second = fract(phase + 0.5);
    float weight = abs(phase * 2.0 - 1.0);
    float travel = v_riverData.z * u_currentSpeedScale * 8.0;
    vec2 a = (v_riverData.xy - vec2(phase * travel, 0.0)) / u_currentRippleLength;
    vec2 b = (v_riverData.xy - vec2(second * travel, 0.0)) / u_currentRippleLength;
    // Filter each phase before blending: an invisible wrapping phase must not change
    // the active phase's footprint when the authored speed has a spatial gradient.
    float footprintA = max(length(dFdx(a)), length(dFdy(a)));
    float footprintB = max(length(dFdx(b)), length(dFdy(b)));
    vec2 filteredA = mix(vec2(0.0, 0.5), sceneGISRiverPattern(a), exp(-40.0 * footprintA * footprintA));
    vec2 filteredB = mix(vec2(0.0, 0.5), sceneGISRiverPattern(b), exp(-40.0 * footprintB * footprintB));
    return mix(filteredA, filteredB, weight);
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
