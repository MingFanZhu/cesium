// Per-fragment visibility is initialized for receivers outside the shadow volume.
float sceneGISGeometryShadowVisibility = 1.0;
vec4 sceneGISGeometryShadowDebug = vec4(1.0);

float sceneGISGeometryShadow()
{
    return sceneGISGeometryShadowVisibility;
}
