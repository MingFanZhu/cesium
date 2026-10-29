in vec3 a_seed;
in float a_step;
uniform float u_lineStep;
out vec4 v_windColor;
void main() {
    vec3 p=a_seed;
    bool valid=!sceneGISWindSolid(p);
    for(int i=0;i<64;++i) {
        if(float(i)>=a_step || !valid) break;
        vec3 velocity=sceneGISWindSample(p).xyz;
        float speed=length(velocity);
        if(speed<1e-8) {valid=false;break;}
        vec3 midpoint=p+0.5*u_lineStep*velocity/speed;
        vec3 middleVelocity=sceneGISWindSample(midpoint).xyz;
        float middleSpeed=length(middleVelocity);
        if(middleSpeed<1e-8 || sceneGISWindSolid(midpoint)) {valid=false;break;}
        p+=u_lineStep*middleVelocity/middleSpeed;
        valid=!sceneGISWindSolid(p);
    }
    vec4 field=sceneGISWindSample(p);
    v_windColor=vec4(windDisplayColor(field),valid?0.72:0.0);
    gl_Position=czm_modelViewProjection*vec4(p,1.0);
    czm_vertexLogDepth();
}
