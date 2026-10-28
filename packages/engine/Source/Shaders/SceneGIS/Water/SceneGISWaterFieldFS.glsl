uniform sampler2D u_bathymetry;
uniform sampler2D u_previousFoam;
uniform vec4 u_fieldRectangle;
uniform vec2 u_foamTransport;
uniform float u_fieldDelta;
uniform float u_foamWidth;
uniform float u_foamIntensity;
uniform bool u_fieldReset;
in vec2 v_textureCoordinates;
void main()
{
    vec2 size = vec2(textureSize(u_bathymetry, 0));
    vec2 uv = (v_textureCoordinates * (size - 1.0) + 0.5) / size;
    vec2 bed = texture(u_bathymetry, uv).rg;
    if (bed.x <= 0.0 || bed.y < 0.5 || u_foamIntensity == 0.0 || u_foamWidth == 0.0) {
        out_FragColor = vec4(0.0); return;
    }
    vec2 oldUV = v_textureCoordinates - u_foamTransport * u_fieldDelta / u_fieldRectangle.zw;
    bool valid = all(greaterThanEqual(oldUV, vec2(0.0))) && all(lessThanEqual(oldUV, vec2(1.0)));
    float old = !u_fieldReset && valid ? texture(u_previousFoam, oldUV).r : 0.0;
    float source = (1.0 - smoothstep(0.0, u_foamWidth, bed.x)) * u_foamIntensity * 2.0;
    // Exact local generation/decay step; semi-Lagrangian advection is in local meters.
    float loss = 0.7;
    float equilibrium = source / (source + loss);
    float coverage = equilibrium + (old - equilibrium) * exp(-(source + loss) * u_fieldDelta);
    out_FragColor = vec4(coverage, 0.0, 0.0, 1.0);
}
