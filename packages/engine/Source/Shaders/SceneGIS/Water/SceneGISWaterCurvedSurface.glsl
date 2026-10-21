#ifdef SCENEGIS_CURVED_WATER
in vec3 v_waterBaseEC;
in vec3 v_waterUpEC;
in vec3 v_waterEastEC;
uniform float u_waterCurvatureRadius;

// A local osculating-sphere correction keeps contact tests camera-relative. It avoids
// subtracting two Earth-sized float positions to recover centimeter-scale water depth.
// The opaque refraction/SSR model remains a bounded local optical approximation.
float sceneGISWaterMeanOffset(vec3 pointEC)
{
    vec3 delta = pointEC - v_waterBaseEC;
    float vertical = dot(delta, normalize(v_waterUpEC));
    float squared = dot(delta, delta);
    float r = u_waterCurvatureRadius;
    float numerator = 2.0 * r * vertical + squared;
    return numerator / (sqrt(max(r * r + numerator, 0.0)) + r);
}
#endif
