uniform sampler2D colorTexture;
uniform vec4 u_visibleColor;
uniform vec4 u_hiddenColor;
in vec2 v_textureCoordinates;
void main()
{
    vec4 color = texture(colorTexture, v_textureCoordinates);
    out_FragColor = color;
    vec2 uv;
    bool visible;
    if (!sceneGIS_observerVisibility(v_textureCoordinates, uv, visible)) {
        return;
    }
    vec4 overlay = visible ? u_visibleColor : u_hiddenColor;
    out_FragColor = vec4(mix(color.rgb, overlay.rgb, overlay.a), color.a);
}
