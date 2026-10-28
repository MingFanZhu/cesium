in vec4 v_windColor;
void main() {
    if(v_windColor.a<0.01) discard;
    out_FragColor=v_windColor;
    czm_writeLogDepth();
}
