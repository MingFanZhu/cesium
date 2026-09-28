uniform sampler2D u_initial;
uniform float u_seconds;
uniform float u_choppiness;
in vec2 v_textureCoordinates;
layout(location=0) out vec4 out_A;
layout(location=1) out vec4 out_B;
vec2 multiplyComplex(vec2 a, vec2 b) { return vec2(a.x*b.x-a.y*b.y,a.x*b.y+a.y*b.x); }
void main() {
    ivec2 size=textureSize(u_initial,0), p=ivec2(gl_FragCoord.xy);
    vec4 a=texelFetch(u_initial,p,0), b=texelFetch(u_initial,(size-p)%size,0);
    float phase=a.z*u_seconds;
    vec2 rotation=vec2(cos(phase),-sin(phase));
    vec2 h=multiplyComplex(a.xy,rotation)+multiplyComplex(b.xy*vec2(1.0,-1.0),rotation*vec2(1.0,-1.0));
    vec2 k=vec2(p.x<size.x/2?p.x:p.x-size.x,p.y<size.y/2?p.y:p.y-size.y);
    vec2 direction=length(k)>0.0?normalize(k):vec2(0.0);
    vec2 displacement=vec2(-h.y,h.x)*u_choppiness;
    out_A=vec4(h,displacement*direction.x);
    out_B=vec4(displacement*direction.y,0.0,0.0);
}
