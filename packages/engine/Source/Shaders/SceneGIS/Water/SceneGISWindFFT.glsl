uniform sampler2D u_a;
uniform sampler2D u_b;
uniform int u_axis;
uniform int u_halfSpan;
in vec2 v_textureCoordinates;
layout(location=0) out vec4 out_A;
layout(location=1) out vec4 out_B;
int reverseIndex(int index,int size) {
    int result=0;
    for(int bit=1;bit<size;bit*=2) { result=result*2+index%2; index/=2; }
    return result;
}
vec4 rotateComplex(vec4 value,vec2 w) {
    return vec4(value.x*w.x-value.y*w.y,value.x*w.y+value.y*w.x,
                value.z*w.x-value.w*w.y,value.z*w.y+value.w*w.x);
}
void main() {
    ivec2 p=ivec2(gl_FragCoord.xy), size=textureSize(u_a,0);
    int i=u_axis==0?p.x:p.y;
    int span=2*u_halfSpan, k=i%u_halfSpan;
    int low=(i/span)*span+k, high=low+u_halfSpan;
    if(u_halfSpan==1) { low=reverseIndex(low,size.x); high=reverseIndex(high,size.x); }
    ivec2 a=u_axis==0?ivec2(low,p.y):ivec2(p.x,low);
    ivec2 b=u_axis==0?ivec2(high,p.y):ivec2(p.x,high);
    float angle=czm_twoPi*float(k)/float(span);
    vec2 w=vec2(cos(angle),sin(angle))*(i%span<u_halfSpan?1.0:-1.0);
    out_A=texelFetch(u_a,a,0)+rotateComplex(texelFetch(u_a,b,0),w);
    out_B=texelFetch(u_b,a,0)+rotateComplex(texelFetch(u_b,b,0),w);
}
