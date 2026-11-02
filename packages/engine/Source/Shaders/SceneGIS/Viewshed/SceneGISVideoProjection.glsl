uniform sampler2D colorTexture;
uniform sampler2D u_video;
uniform bool u_videoReady;
uniform float u_videoAspect;
uniform float u_frustumAspect;
uniform float u_opacity;
uniform bool u_flipY;
uniform bool u_gaussianOnly;
in vec2 v_textureCoordinates;

void main()
{
    vec4 color = texture(colorTexture, v_textureCoordinates);
    out_FragColor = color;
    if (u_gaussianOnly) return;
    vec2 uv;
    bool visible;
    if (!u_videoReady || !sceneGIS_observerVisibility(v_textureCoordinates, uv, visible) || !visible) {
        return;
    }
    // Contain the media in the projector rectangle; letterboxing leaves the scene intact.
    vec2 scale = vec2(max(u_frustumAspect / u_videoAspect, 1.0),
                      max(u_videoAspect / u_frustumAspect, 1.0));
    uv = (uv - 0.5) * scale + 0.5;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
        return;
    }
    if (u_flipY) {
        uv.y = 1.0 - uv.y;
    }
    // The native display stage has already converted the scene to display RGB.
    vec3 video = texture(u_video, uv).rgb;
    out_FragColor = vec4(mix(color.rgb, video, u_opacity), color.a);
}
