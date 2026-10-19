uniform mat3 u_sceneGISWhiteBalance;
uniform bool u_sceneGISSolarWhiteBalanceEnabled;
uniform bool u_sceneGISWhiteBalanceEnabled;
uniform float u_sceneGISContrast;
uniform float u_sceneGISSaturation;

vec3 sceneGIS_gradeColor(vec3 color)
{
    if (u_sceneGISSolarWhiteBalanceEnabled) {
        // Bruneton demo: normalize integrated solar RGB by its arithmetic mean.
        // The Sun factors in SceneGISBrunetonAtmosphere reconstruct that integral
        // from the frozen Earth samples. Requalify both when the spectrum changes.
        const vec3 solar = vec3(1.474, 1.8504, 1.91198) *
            vec3(98242.786222, 69954.398112, 66475.012354);
        const vec3 whitePoint = solar / ((solar.r + solar.g + solar.b) / 3.0);
        color /= whitePoint;
    }
    if (u_sceneGISWhiteBalanceEnabled) {
        color = max(u_sceneGISWhiteBalance * color, vec3(0.0));
    }
    const vec3 luminanceWeights = vec3(0.2126, 0.7152, 0.0722);
    float luminance = dot(color, luminanceWeights);
    if (u_sceneGISContrast != 1.0 && luminance > 0.0) {
        color *= pow(luminance / 0.18, u_sceneGISContrast - 1.0);
        luminance = dot(color, luminanceWeights);
    }
    if (u_sceneGISSaturation != 1.0) {
        color = max(mix(vec3(luminance), color, u_sceneGISSaturation), vec3(0.0));
    }
    return color;
}
