uniform float u_colorMaximum;
uniform bool u_colorConcentration;
vec3 windDisplayColor(vec4 field) {
    float value=u_colorConcentration?field.w:length(field.xyz);
    float t=clamp(value/u_colorMaximum,0.0,1.0);
    vec3 cool=mix(vec3(0.07,0.20,0.65),vec3(0.05,0.85,0.85),smoothstep(0.0,0.45,t));
    return mix(cool,vec3(1.0,0.35,0.08),smoothstep(0.45,1.0,t));
}
