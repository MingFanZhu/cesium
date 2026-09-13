const float globeRadius = 6378137.0;
const float globeEccentricity = 0.0066943799901413165;


float globeSinDelta(float x)
{
    // Preserve relative precision near zero; very wide dynamic strokes can
    // extend beyond the small-angle domain of the subdivided source triangle.
    if (abs(x) >= 0.1) return sin(x);
    float x2 = x * x;
    return x * (1.0 + x2 * (-1.0 / 6.0 + x2 * (1.0 / 120.0 - x2 / 5040.0)));
}

vec4 globeFrame(int index, int field)
{
#if defined(SCENEGIS_VECTOR_GLOBE_TERRAIN) && !defined(SCENEGIS_VECTOR_GLOBE_VERTEX)
    if (field == 0) return v_terrainReference;
    if (field == 1) return vec4(0.0, 0.0, 0.0, v_terrainFrame.z);
    if (field == 2) return vec4(0.0, 0.0, 0.0, v_terrainFrame.w);
    return vec4(v_terrainFrame.xy, v_terrainFrame.zw * (v_terrainReference.w / globeRadius));
#else
    return groundFetch(u_sceneGISGroundData, u_sceneGISGroundDataSize, int(u_sceneGISGroundOffsets.y) + index * 4 + field);
#endif
}

mat3 globeAxes(int index)
{
    vec4 p = globeFrame(index, 0);
    vec2 l = globeFrame(index, 3).xy;
    return mat3(vec3(-l.x, l.y, 0.0),
        vec3(-p.z * l.y, -p.z * l.x, p.w),
        vec3(p.w * l.y, p.w * l.x, p.z));
}

vec4 globeOrigin(int index)
{
    return czm_translateRelativeToEye(globeFrame(index, 1).xyz, globeFrame(index, 2).xyz);
}

// Invert around the same high/low origin used to draw the volume. Absolute
// float longitude/latitude subtraction would lose sub-metre street detail.
vec3 globeLocalPosition(vec3 eye, int index)
{
#if defined(SCENEGIS_VECTOR_GLOBE_TERRAIN) && !defined(SCENEGIS_VECTOR_GLOBE_VERTEX)
    vec3 originEye = v_terrainOriginEye;
#else
    vec3 originEye = (czm_modelViewRelativeToEye * globeOrigin(index)).xyz;
#endif
    return transpose(globeAxes(index)) * (mat3(czm_inverseView) * (eye - originEye));
}

vec2 globeCoordinates(vec3 delta, int index)
{
    vec4 reference = globeFrame(index, 0);
    float s0 = reference.z, c0 = reference.w;
    float n0 = globeFrame(index, 1).w;
    float m0 = globeFrame(index, 2).w;
    float radial = -delta.y * s0 + delta.z * c0;
    float dz = delta.y * c0 + delta.z * s0;
    float h0 = n0 * c0;
    float horizontal = length(vec2(h0 + radial, delta.x));
    float dh = (2.0 * h0 * radial + radial * radial + delta.x * delta.x) / (horizontal + h0);
    float longitude = atan(delta.x, h0 + radial);
    float latitude = delta.y / m0;
    float height = delta.z;
    float ds = 0.0;
    float s = s0;
    vec2 metric = globeFrame(index, 3).zw;
    float tolerance = min(0.001, 0.001 * u_sceneGISVectorMetersPerPixel * min(metric.x, metric.y));
    for (int iteration = 0; iteration < 4; ++iteration) {
        float sd = globeSinDelta(latitude);
        float cd = -2.0 * globeSinDelta(latitude * 0.5) * globeSinDelta(latitude * 0.5);
        ds = s0 * cd + c0 * sd;
        float dc = c0 * cd - s0 * sd;
        s = s0 + ds;
        float c = c0 + dc;
        float d0 = sqrt(1.0 - globeEccentricity * s0 * s0);
        float d = sqrt(1.0 - globeEccentricity * s * s);
        float dn = globeRadius * globeEccentricity * ds * (s + s0) / (d * d0 * (d + d0));
        float radialError = dh - (n0 * dc + dn * c + height * c);
        float zError = dz - ((1.0 - globeEccentricity) * (n0 * ds + dn * s) + height * s);
        float meridianRadius = globeRadius * (1.0 - globeEccentricity) / (d * d * d);
        latitude += (zError * c - radialError * s) / (meridianRadius + height);
        height += radialError * c + zError * s;
        // Stop below both one millimetre and one thousandth of the reference
        // pixel; small-scale views retain the tighter bound and all four steps.
        if (max(abs(radialError), abs(zError)) < tolerance) break;
    }
    float sd = globeSinDelta(latitude);
    ds = -2.0 * s0 * globeSinDelta(latitude * 0.5) * globeSinDelta(latitude * 0.5) + c0 * sd;
    float q = ds / (1.0 - (s0 + ds) * s0);
    float mercator = abs(q) < 0.001 ? q * (1.0 + q * q / 3.0) : 0.5 * log((1.0 + q) / (1.0 - q));
    return reference.xy + globeRadius * vec2(longitude, mercator);
}
