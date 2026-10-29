#ifdef SCENEGIS_PROFILE_WATER
// Isolate all roots on [0,1] by the derivative's monotone intervals. The
// normalized ray interval keeps bisection and coefficient magnitudes bounded.
float sceneGISPoly3(vec4 p,float x) { return ((p.w*x+p.z)*x+p.y)*x+p.x; }
float sceneGISPoly4(vec4 p,float a,float x) { return (((a*x+p.w)*x+p.z)*x+p.y)*x+p.x; }

int sceneGISQuadratic(float a,float b,float c,out vec2 roots)
{
    roots=vec2(1e20);
    if(a==0.0) { if(b==0.0){return 0;} roots.x=-c/b;return 1; }
    float d=b*b-4.0*a*c;
    if(d<0.0) {return 0;}
    float q=-0.5*(b+(b<0.0?-sqrt(d):sqrt(d)));
    if(q==0.0) {roots.x=-b/(2.0*a);return 1;}
    roots=vec2(q/a,c/q);
    if(roots.x>roots.y){roots=roots.yx;}
    return d==0.0?1:2;
}

int sceneGISCubicRoots(vec4 p,out vec3 roots)
{
    roots=vec3(1e20);
    float scale=max(max(abs(p.x),abs(p.y)),max(abs(p.z),abs(p.w)));
    if(scale==0.0){return 0;}
    p/=scale;
    vec2 critical;
    int count=sceneGISQuadratic(3.0*p.w,2.0*p.z,p.y,critical);
    float stops[4];int n=1;stops[0]=0.0;
    for(int i=0;i<2;++i){if(i<count&&critical[i]>0.0&&critical[i]<1.0){stops[n++]=critical[i];}}
    stops[n++]=1.0;
    int found=0;
    for(int i=0;i<3;++i){
        if(i+1>=n){break;}
        float lo=stops[i],hi=stops[i+1];
        float left=sceneGISPoly3(p,lo),right=sceneGISPoly3(p,hi);
        float error=4e-7*(((abs(p.w)*lo+abs(p.z))*lo+abs(p.y))*lo+abs(p.x));
        if(abs(left)<=error&&found<3){roots[found++]=lo;}
        if(left*right<0.0&&found<3){
            for(int j=0;j<24;++j){float mid=(lo+hi)*0.5;float value=sceneGISPoly3(p,mid);
                if((value<0.0)==(left<0.0)){lo=mid;}else{hi=mid;}}
            roots[found++]=(lo+hi)*0.5;
        }
    }
    return found;
}

float sceneGISQuarticFirst(vec4 p,float a)
{
    float scale=max(max(max(abs(p.x),abs(p.y)),max(abs(p.z),abs(p.w))),abs(a));
    if(scale==0.0){return 0.0;}
    p/=scale;a/=scale;
    vec3 critical;
    int count=sceneGISCubicRoots(vec4(p.y,2.0*p.z,3.0*p.w,4.0*a),critical);
    float lo=0.0,left=sceneGISPoly4(p,a,0.0);
    for(int i=0;i<4;++i){
        float hi=i<count?critical[min(i,2)]:1.0;
        if(hi<=lo&&i<count){continue;}
        float right=sceneGISPoly4(p,a,hi);
        float errorLo=4e-7*((((abs(a)*lo+abs(p.w))*lo+abs(p.z))*lo+abs(p.y))*lo+abs(p.x));
        if(abs(left)<=errorLo){return lo;}
        if(left*right<0.0){
            for(int j=0;j<24;++j){float mid=(lo+hi)*0.5;float value=sceneGISPoly4(p,a,mid);
                if((value<0.0)==(left<0.0)){lo=mid;}else{hi=mid;}}
            return (lo+hi)*0.5;
        }
        float errorHi=4e-7*((((abs(a)*hi+abs(p.w))*hi+abs(p.z))*hi+abs(p.y))*hi+abs(p.x));
        if(abs(right)<=errorHi){return hi;}
        lo=hi;left=right;
        if(i>=count){break;}
    }
    return 1e20;
}
#endif
