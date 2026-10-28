uniform sampler2D u_a;
uniform sampler2D u_b;
uniform float u_spacing;
uniform float u_whitecapIntensity;
uniform sampler2D u_foamHistory;
uniform float u_foamDecay;
uniform vec2 u_foamShift;
in vec2 v_textureCoordinates;
layout(location=0) out vec4 out_Displacement;
layout(location=1) out vec4 out_Normal;
vec3 displacement(ivec2 p) {
    ivec2 size=textureSize(u_a,0); p=(p+size)%size;
    vec4 a=texelFetch(u_a,p,0); return vec3(a.z,texelFetch(u_b,p,0).x,a.x);
}
void main() {
    ivec2 p=ivec2(gl_FragCoord.xy);
    vec3 dx=(displacement(p+ivec2(1,0))-displacement(p-ivec2(1,0)))/(2.0*u_spacing);
    vec3 dy=(displacement(p+ivec2(0,1))-displacement(p-ivec2(0,1)))/(2.0*u_spacing);
    float jacobian=(1.0+dx.x)*(1.0+dy.y)-dx.y*dy.x;
    vec3 n=normalize(cross(vec3(1.0,0.0,0.0)+dx,vec3(0.0,1.0,0.0)+dy));
    out_Displacement=vec4(displacement(p),1.0);
    float generated = clamp((0.65-jacobian)*2.0,0.0,1.0)*u_whitecapIntensity;
    vec2 period = vec2(textureSize(u_a, 0)) * u_spacing;
    float retained = u_foamDecay > 0.0 ? textureLod(u_foamHistory,
        fract(v_textureCoordinates - u_foamShift / period), 0.0).a * u_foamDecay : 0.0;
    out_Normal=vec4(n,max(generated,retained));
}
