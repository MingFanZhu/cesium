// Compensated arithmetic retains the low component until the region origin has
// been subtracted. This uses the same polynomial and quadrants as CesiumMath's
// fastApproximateAtan2, including its coefficients in double precision.
// A uniform rounding barrier prevents GLSL optimizers from reassociating the
// error-free transforms into zero (observed on ANGLE's D3D backend).
uniform float u_sceneGISClippingRound;
vec2 sceneGISClipSum(vec2 a, vec2 b)
{
    float s = (a.x + b.x) * u_sceneGISClippingRound;
    float v = (s - a.x) * u_sceneGISClippingRound;
    float e = (a.x - (s - v) * u_sceneGISClippingRound) +
        (b.x - v) * u_sceneGISClippingRound + a.y + b.y;
    float r = (s + e) * u_sceneGISClippingRound;
    return vec2(r, e - (r - s) * u_sceneGISClippingRound);
}

vec2 sceneGISClipProduct(vec2 a, vec2 b)
{
    float p = (a.x * b.x) * u_sceneGISClippingRound;
    float ca = 4097.0 * a.x;
    float cb = 4097.0 * b.x;
    float ah = ca - (ca - a.x) * u_sceneGISClippingRound;
    float bh = cb - (cb - b.x) * u_sceneGISClippingRound;
    float al = a.x - ah;
    float bl = b.x - bh;
    float e = ((ah * bh - p) + ah * bl + al * bh) + al * bl;
    e += a.x * b.y + a.y * b.x;
    float r = (p + e) * u_sceneGISClippingRound;
    return vec2(r, e - (r - p) * u_sceneGISClippingRound);
}

vec2 sceneGISClipDivide(vec2 a, vec2 b)
{
    float q = (a.x / b.x) * u_sceneGISClippingRound;
    vec2 r = sceneGISClipSum(a, -sceneGISClipProduct(b, vec2(q, 0.0)));
    return sceneGISClipSum(vec2(q, 0.0), vec2((r.x + r.y) / b.x, 0.0));
}

vec2 sceneGISClipSqrt(vec2 a)
{
    float s = sqrt(a.x) * u_sceneGISClippingRound;
    if (s == 0.0) { return vec2(0.0); }
    vec2 r = sceneGISClipSum(a, -sceneGISClipProduct(vec2(s, 0.0), vec2(s, 0.0)));
    return sceneGISClipSum(vec2(s, 0.0), vec2((r.x + r.y) / (2.0 * s), 0.0));
}

vec2 sceneGISClipAtan(vec2 x, vec2 y)
{
    vec2 ax = x.x < 0.0 ? -x : x;
    vec2 ay = y.x < 0.0 ? -y : y;
    bool swap = ay.x > ax.x || (ay.x == ax.x && ay.y > ax.y);
    vec2 t = sceneGISClipDivide(swap ? ax : ay, swap ? ay : ax);
    vec2 t2 = sceneGISClipProduct(t, t);
    vec2 a = sceneGISClipProduct(vec2(-0.17839999496936798, -5.030632019e-9), t);
    vec2 b = sceneGISClipProduct(vec2(-0.06629999727010727, -2.729892730e-9), t2);
    t = sceneGISClipProduct(t, sceneGISClipSum(sceneGISClipSum(a, b), vec2(1.0300999879837036, 1.201629640e-8)));
    vec2 pi = vec2(3.1415927410125732, -8.742278012618954e-8);
    if (swap) { t = sceneGISClipSum(pi * 0.5, -t); }
    if (x.x < 0.0) { t = sceneGISClipSum(pi, -t); }
    if (y.x < 0.0) { t = -t; }
    return t;
}

// Interpolate Cartesian RTC coordinates, then project per fragment. Projecting
// vertices first introduces an LOD-dependent nonlinear interpolation error.
void sceneGISGlobeClipPolygons(highp sampler2D distanceTexture,
    highp sampler2D extentsTexture, vec3 centerHigh, vec3 centerLow, vec3 position)
{
    vec2 x = sceneGISClipSum(vec2(centerHigh.x, centerLow.x), vec2(position.x, 0.0));
    vec2 y = sceneGISClipSum(vec2(centerHigh.y, centerLow.y), vec2(position.y, 0.0));
    vec2 z = sceneGISClipSum(vec2(centerHigh.z, centerLow.z), vec2(position.z, 0.0));
    vec2 xy = sceneGISClipSqrt(sceneGISClipSum(sceneGISClipProduct(x, x), sceneGISClipProduct(y, y)));
    vec2 latitude = sceneGISClipAtan(xy, z);
    vec2 longitude = sceneGISClipAtan(x, y);
    vec2 pi = vec2(3.1415927410125732, -8.742278012618954e-8);
    if (longitude.x > pi.x || (longitude.x == pi.x && longitude.y >= pi.y))
    {
        longitude = sceneGISClipSum(longitude, -2.0 * pi);
    }
    vec2 clippingPosition = vec2(0.0);
    int selectedRegion = -1;
    for (int i = 0; i < CLIPPING_POLYGON_REGIONS_LENGTH; ++i)
    {
        vec4 extents = czm_unpackClippingExtents(extentsTexture, i);
        vec2 lat = sceneGISClipSum(latitude, vec2(-extents.x, 0.0));
        vec2 lon = sceneGISClipSum(longitude, vec2(-extents.y, 0.0));
        vec2 uv = vec2((lon.x + lon.y) * extents.w, (lat.x + lat.y) * extents.z);
        if (all(greaterThan(uv, vec2(0.0))) && all(lessThan(uv, vec2(1.0))))
        {
            clippingPosition = uv;
            selectedRegion = i;
            break;
        }
    }
    czm_clipPolygons(distanceTexture, CLIPPING_POLYGON_REGIONS_LENGTH, clippingPosition, selectedRegion);
}
