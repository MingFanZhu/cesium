uniform sampler2D u_boundary;
uniform int u_boundaryNodeCount;
#ifdef SCENEGIS_ELLIPSOID_UNDERWATER
uniform float u_volumeRadius;
uniform float u_chartRadius;
uniform mat3 u_waterToChart;
uniform vec2 u_chartCamera;
#endif
#ifdef SCENEGIS_PROFILE_WATER
uniform float u_profileAnchor;
uniform vec2 u_profileRange;
#endif

float sceneGISWaterCross(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }

vec3 sceneGISVolumeChart(vec3 p)
{
    #ifdef SCENEGIS_ELLIPSOID_UNDERWATER
    vec3 center=u_waterToChart*vec3(0.0,0.0,u_volumeRadius-u_cameraDepth);
    vec3 shift=u_waterToChart*(p-vec3(0.0,0.0,-u_cameraDepth));
    float z=center.z+shift.z;
    return vec3(u_chartCamera+(u_chartRadius*shift.xy-u_chartCamera*shift.z)/z,z);
    #else
    return vec3(p.xy,1.0);
    #endif
}

float sceneGISWaterBaseDepth(vec3 p)
{
    #ifdef SCENEGIS_ELLIPSOID_UNDERWATER
    // Rationalize the radius difference, retaining meter-scale depths at Earth scale.
    float r = u_volumeRadius;
    float numerator = 2.0 * r * p.z + dot(p, p);
    return -numerator / (sqrt(max(r * r + numerator, 0.0)) + r);
    #else
    return -p.z;
    #endif
}

float sceneGISWaterVolumeDepth(vec3 p)
{
    float depth=sceneGISWaterBaseDepth(p);
    #ifdef SCENEGIS_PROFILE_WATER
    vec3 chart=sceneGISVolumeChart(p),profile;
    if(chart.z<=0.0||!sceneGISProfileHeight(chart.xy,profile)){return -1.0;}
    depth+=profile.x-u_profileAnchor;
    #endif
    return depth;
}

vec3 sceneGISWaterVolumeUp(vec3 p)
{
    #ifdef SCENEGIS_ELLIPSOID_UNDERWATER
    vec3 up=normalize(p + vec3(0.0, 0.0, u_volumeRadius));
    #else
    vec3 up=vec3(0.0,0.0,1.0);
    #endif
    #ifdef SCENEGIS_PROFILE_WATER
    vec3 chart=sceneGISVolumeChart(p),profile;
    if(sceneGISProfileHeight(chart.xy,profile)){
        #ifdef SCENEGIS_ELLIPSOID_UNDERWATER
        vec3 gradient=transpose(u_waterToChart)*vec3(profile.yz,-dot(profile.yz,chart.xy)/u_chartRadius);
        up-=gradient*(u_chartRadius/chart.z);
        #else
        up-=vec3(profile.yz,0.0);
        #endif
    }
    #endif
    return normalize(up);
}

#ifdef SCENEGIS_ELLIPSOID_UNDERWATER
float sceneGISWaterShellHit(vec3 origin, vec3 direction, float depth)
{
    float r = u_volumeRadius;
    float b = dot(origin, direction) + r * direction.z;
    float c = dot(origin, origin) + 2.0 * r * origin.z + depth * (2.0 * r - depth);
    float discriminant = b * b - c;
    if (discriminant < 0.0) { return 1e20; }
    // The product of the roots avoids subtracting two almost equal large values.
    float q = -b - (b < 0.0 ? -sqrt(discriminant) : sqrt(discriminant));
    if (q == 0.0) { return 1e20; }
    float a = q, second = c / q;
    return min(a > 0.0 ? a : 1e20, second > 0.0 ? second : 1e20);
}
#endif

bool sceneGISWaterHalfplane(float a,float b,inout float lo,inout float hi)
{
    if(b==0.0){return a>=0.0;}
    float t=-a/b;
    if(b>0.0){lo=max(lo,t);}else{hi=min(hi,t);}
    return lo<=hi;
}

bool sceneGISWaterBox(vec4 bounds,vec2 start,vec2 velocity,float z,float dz,inout float lo,inout float hi)
{
    vec2 a=start-bounds.xy,b=bounds.zw-start;
    return sceneGISWaterHalfplane(a.x*z,a.x*dz+velocity.x,lo,hi)&&
        sceneGISWaterHalfplane(a.y*z,a.y*dz+velocity.y,lo,hi)&&
        sceneGISWaterHalfplane(b.x*z,b.x*dz-velocity.x,lo,hi)&&
        sceneGISWaterHalfplane(b.y*z,b.y*dz-velocity.y,lo,hi);
}

#ifdef SCENEGIS_PROFILE_WATER
#ifdef SCENEGIS_ELLIPSOID_UNDERWATER
float sceneGISProfileShellRoot(vec3 p,vec3 v,float height,float rate,float c,float depth)
{
    float r=u_volumeRadius;
    float n0=dot(p,p)+2.0*r*p.z;
    float n1=2.0*(dot(p,v)+r*v.z),n2=dot(v,v);
    float s0=height-depth,s1=s0*c+rate;
    vec4 coefficients=vec4(n0-2.0*r*s0-s0*s0,
        n1+2.0*n0*c-2.0*r*(s0*c+s1)-2.0*s0*s1,
        n2+2.0*n1*c+n0*c*c-2.0*r*s1*c-s1*s1,
        2.0*n2*c+n1*c*c);
    return sceneGISQuarticFirst(coefficients,n2*c*c);
}
#endif

float sceneGISProfileRay(vec3 origin,vec3 direction,vec2 start,vec2 velocity,float z,float dz,float limit)
{
    int node=0;
    for(int visit=0;visit<2047;++visit){
        if(node>=u_profileNodeCount){break;}
        vec4 bounds=texelFetch(u_waterProfile,ivec2(0,node),0);
        vec4 data=texelFetch(u_waterProfile,ivec2(3,node),0);
        float lo=0.0,hi=limit;
        if(!sceneGISWaterBox(bounds,start,velocity,z,dz,lo,hi)) {node=int(data.y);continue;}
        if(data.z>0.0){
            vec4 ab=texelFetch(u_waterProfile,ivec2(1,node),0);
            vec4 cg=texelFetch(u_waterProfile,ivec2(2,node),0);
            vec2 vertices[3];vertices[0]=ab.xy;vertices[1]=ab.zw;vertices[2]=cg.xy;
            bool hit=true;
            for(int i=0;i<3;++i){
                vec2 edge=vertices[(i+1)%3]-vertices[i];
                float side=sceneGISWaterCross(edge,start-vertices[i]);
                hit=hit&&sceneGISWaterHalfplane(side*z,side*dz+sceneGISWaterCross(edge,velocity),lo,hi);
            }
            if(hit&&hi>lo){
                #ifdef SCENEGIS_ELLIPSOID_UNDERWATER
                float length=hi-lo,den=z+lo*dz;
                vec2 position=start+velocity*lo/den;
                vec2 rate=u_chartRadius*(u_waterToChart*direction).xy-position*dz;
                float height=data.x+dot(cg.zw,position-ab.xy)-u_profileAnchor;
                float slope=dot(cg.zw,rate)*length/den;
                float c=length*dz/den;
                vec3 p=origin+direction*lo,v=direction*length;
                float top=sceneGISProfileShellRoot(p,v,height,slope,c,0.0);
                float bottom=sceneGISProfileShellRoot(p,v,height,slope,c,u_underwaterDepth);
                float t=lo+min(top,bottom)*length;
                if(t>0.0){limit=min(limit,t);}
                #else
                float height=data.x+dot(cg.zw,start-ab.xy)-u_profileAnchor;
                float slope=dot(cg.zw,direction.xy)-direction.z;
                if(slope!=0.0){
                    float top=(origin.z-height)/slope;
                    float bottom=(origin.z-height+u_underwaterDepth)/slope;
                    if(top>0.0&&top>=lo&&top<=hi){limit=min(limit,top);}
                    if(bottom>0.0&&bottom>=lo&&bottom<=hi){limit=min(limit,bottom);}
                }
                #endif
            }
        }
        ++node;
    }
    return limit;
}
#endif

vec4 sceneGISWaterBoundaryTexel(int index)
{
    int width=textureSize(u_boundary,0).x;
    return texelFetch(u_boundary,ivec2(index%width,index/width),0);
}

// One stackless traversal serves origin parity and the nearest finite ray.
bool sceneGISWaterBoundaryRay(vec2 start,vec2 velocity,float z,float dz,inout float distance)
{
    #ifdef SCENEGIS_PROFILE_WATER
    bool inside=true;
    #else
    bool inside=false;
    #endif
    int node=0;
    while(node<u_boundaryNodeCount){
        vec4 bounds=sceneGISWaterBoundaryTexel(node*2);
        vec4 data=sceneGISWaterBoundaryTexel(node*2+1);
        bool point=false;
        #ifndef SCENEGIS_PROFILE_WATER
        point=start.y>=bounds.y&&start.y<=bounds.w&&start.x<bounds.z;
        #endif
        float lo=0.0,hi=distance;
        if(dz<0.0){hi=min(hi,-z/dz);}
        bool ray=sceneGISWaterBox(bounds,start,velocity,z,dz,lo,hi)&&hi>0.0;
        if(!point&&!ray){node=int(data.x);continue;}
        for(int j=0;j<4;++j){
            if(j>=int(data.z)){break;}
            vec4 edge=sceneGISWaterBoundaryTexel(int(data.y)+j);
            vec2 a=edge.xy,b=edge.zw,segment=b-a;
            #ifndef SCENEGIS_PROFILE_WATER
            if(point&&(a.y>start.y)!=(b.y>start.y)&&
                start.x<(b.x-a.x)*(start.y-a.y)/(b.y-a.y)+a.x){inside=!inside;}
            #endif
            if(!ray){continue;}
            #ifdef SCENEGIS_ELLIPSOID_UNDERWATER
            float side=sceneGISWaterCross(a-start,segment);
            float denominator=sceneGISWaterCross(velocity,segment)-side*dz;
            if(abs(denominator)>1e-8){
                float t=side*z/denominator,endZ=z+t*dz;
                if(t>0.0&&t<distance&&endZ>0.0){
                    vec2 hit=start+velocity*t/endZ;
                    float u=dot(hit-a,segment)/dot(segment,segment);
                    if(u>=0.0&&u<=1.0){distance=t;}
                }
            }
            #else
            float denominator=sceneGISWaterCross(velocity,segment);
            if(abs(denominator)>1e-8){
                float t=sceneGISWaterCross(a-start,segment)/denominator;
                float u=sceneGISWaterCross(a-start,velocity)/denominator;
                if(t>0.0&&u>=0.0&&u<=1.0){distance=min(distance,t);}
            }
            #endif
        }
        ++node;
    }
    return inside;
}

bool sceneGISWaterVolumeRay(vec3 origin, vec3 direction, out float distance)
{
    float depth = sceneGISWaterVolumeDepth(origin);
    if (depth <= 0.0 || depth >= u_underwaterDepth) { return false; }
    #ifdef SCENEGIS_ELLIPSOID_UNDERWATER
    vec3 chart=sceneGISVolumeChart(origin);
    float chartZ = chart.z;
    if (chartZ <= 0.0) { return false; }
    // Orthographic origins can differ from the camera. Use a relative rational
    // projection rather than subtracting Earth-sized chart products.
    vec2 start = chart.xy;
    vec3 chartDirection = u_waterToChart * direction;
    vec2 velocity = u_chartRadius * chartDirection.xy - start * chartDirection.z;
    #ifdef SCENEGIS_PROFILE_WATER
    distance=sceneGISWaterShellHit(origin,direction,-u_profileRange.y);
    if(chartDirection.z<0.0){distance=min(distance,-chartZ/chartDirection.z);}
    #else
    distance = min(sceneGISWaterShellHit(origin, direction, 0.0),
        sceneGISWaterShellHit(origin, direction, u_underwaterDepth));
    #endif
    #else
    vec2 start = origin.xy;
    distance = 1e20;
    float chartZ=1.0;vec3 chartDirection=vec3(direction.xy,0.0);vec2 velocity=direction.xy;
    #ifdef SCENEGIS_PROFILE_WATER
    if(direction.z>0.0){distance=(u_profileRange.y-origin.z)/direction.z;}
    if(direction.z<0.0){distance=(u_profileRange.x-u_underwaterDepth-origin.z)/direction.z;}
    #else
    if (direction.z > 0.0) { distance = min(distance, -origin.z / direction.z); }
    if (direction.z < 0.0) { distance = min(distance, (-u_underwaterDepth - origin.z) / direction.z); }
    #endif
    #endif
    bool inside = sceneGISWaterBoundaryRay(start,velocity,chartZ,chartDirection.z,distance);
    #ifdef SCENEGIS_PROFILE_WATER
    distance=sceneGISProfileRay(origin,direction,start,velocity,chartZ,chartDirection.z,distance);
    #endif
    return inside;
}
