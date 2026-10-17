precision highp float;
precision highp sampler3D;

uniform sampler2D u_transmittanceTexture;
uniform sampler3D u_scatteringTexture;
uniform sampler2D u_irradianceTexture;

void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    if (pixel.x < 64) {
        out_FragColor = pixel.y < 16
            ? texelFetch(u_irradianceTexture, pixel, 0)
            : vec4(0.0);
        return;
    }

    float heightUnit = floor(float(pixel.y) / SCENEGIS_DIFFUSE_NORMALS) /
        (SCENEGIS_DIFFUSE_HEIGHTS - 1.0);
    float sunUnit = mod(float(pixel.x - 64), SCENEGIS_DIFFUSE_SUNS) /
        (SCENEGIS_DIFFUSE_SUNS - 1.0) * 2.0 - 1.0;
    float sunCosine = sign(sunUnit) * sunUnit * sunUnit *
        (sunUnit < 0.0 ? 0.5 : 1.0);
    float inclination = mod(float(pixel.y), SCENEGIS_DIFFUSE_NORMALS) /
        (SCENEGIS_DIFFUSE_NORMALS - 1.0) * czm_pi;
    float azimuth = floor(float(pixel.x - 64) / SCENEGIS_DIFFUSE_SUNS) /
        (SCENEGIS_DIFFUSE_AZIMUTHS - 1.0) * czm_pi;
    vec3 sun = vec3(sqrt(max(1.0 - sunCosine * sunCosine, 0.0)), 0.0, sunCosine);
    vec3 normal = vec3(sin(inclination) * cos(azimuth),
        sin(inclination) * sin(azimuth), cos(inclination));
    AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
    vec3 point = vec3(0.0, 0.0, atmosphere.bottom_radius +
        heightUnit * heightUnit * (atmosphere.top_radius - atmosphere.bottom_radius));
    vec3 irradiance = vec3(0.0);
    // Integrate only the upper sky; direct Sun and lower ground are separate.
    for (int m = 0; m < 32; ++m) {
        float mu = (float(m) + 0.5) / 32.0;
        float sine = sqrt(1.0 - mu * mu);
        for (int a = 0; a < 32; ++a) {
            float phi = (float(a) + 0.5) * czm_twoPi / 32.0;
            vec3 ray = vec3(sine * cos(phi), sine * sin(phi), mu);
            float weight = max(dot(normal, ray), 0.0);
            if (weight > 0.0) {
                vec3 transmittance;
                vec3 radiance = GetSkyRadiance(atmosphere,
                    u_transmittanceTexture, u_scatteringTexture, u_scatteringTexture,
                    point, ray, 0.0, sun, true, transmittance);
                irradiance += max(radiance, vec3(0.0)) * weight;
            }
        }
    }
    out_FragColor = vec4(irradiance * (czm_twoPi / (32.0 * 32.0)), 1.0);
}
