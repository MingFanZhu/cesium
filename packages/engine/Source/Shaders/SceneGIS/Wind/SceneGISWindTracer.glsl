uniform sampler2D u_concentration;
uniform sampler2D u_velocity;
uniform sampler2D u_solid;
uniform vec3 u_dimensions;
uniform vec3 u_minimum;
uniform float u_columns;
uniform float u_dx;
uniform float u_dt;
uniform float u_diffusivity;
uniform vec3 u_boundaryMin;
uniform vec3 u_boundaryMax;
uniform bool u_reset;
uniform int u_sourceCount;
uniform vec4 u_sources[16];
uniform float u_rates[16];

ivec2 pixel(ivec3 p) {
    return ivec2(p.x+(p.z%int(u_columns))*int(u_dimensions.x),p.y+(p.z/int(u_columns))*int(u_dimensions.y));
}
void main() {
    ivec3 n=ivec3(u_dimensions);
    ivec2 fragment=ivec2(gl_FragCoord.xy);
    ivec3 p=ivec3(fragment.x%n.x,fragment.y%n.y,fragment.x/n.x+(fragment.y/n.y)*int(u_columns));
    if(u_reset || p.z>=n.z || texelFetch(u_solid,pixel(p),0).r>0.5) {
        out_FragColor=vec4(0.0); return;
    }
    float current=texelFetch(u_concentration,pixel(p),0).r;
    vec3 velocity=texelFetch(u_velocity,pixel(p),0).xyz;
    float divergence=0.0;
    float cfl=0.0;
    for(int a=0;a<3;++a) for(int side=-1;side<=1;side+=2) {
        ivec3 q=p; q[a]+=side;
        bool outside=q[a]<0||q[a]>=n[a];
        int mode=int(side<0?u_boundaryMin[a]:u_boundaryMax[a]);
        if(outside && (mode==1||mode==2)) continue;
        if(outside && mode==0) {q[a]=(q[a]+n[a])%n[a]; outside=false;}
        float neighbor=current;
        float normalVelocity=velocity[a]*float(side);
        if(!outside) {
            if(texelFetch(u_solid,pixel(q),0).r>0.5) continue;
            neighbor=texelFetch(u_concentration,pixel(q),0).r;
            normalVelocity=0.5*(velocity[a]+texelFetch(u_velocity,pixel(q),0)[a])*float(side);
        }
        float upwind=normalVelocity>=0.0?current:(outside?0.0:neighbor);
        float diffusion=outside?0.0:u_diffusivity*(neighbor-current)/u_dx;
        divergence+=normalVelocity*upwind-diffusion;
        cfl+=(max(normalVelocity,0.0)+(outside?0.0:u_diffusivity/u_dx))*u_dt/u_dx;
    }
    float value=current-divergence*u_dt/u_dx;
    vec3 position=u_minimum+(vec3(p)+0.5)*u_dx;
    for(int i=0;i<16;++i) {
        if(i>=u_sourceCount) break;
        if(distance(position,u_sources[i].xyz)<=u_sources[i].w) value+=u_rates[i]*u_dt;
    }
    // Negative concentration or CFL > 1 is exposed, never hidden by clipping.
    out_FragColor=vec4(value,cfl,0.0,0.0);
}
