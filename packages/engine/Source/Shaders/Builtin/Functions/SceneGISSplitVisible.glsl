/**
 * Tests the existing native split directions in drawing-buffer coordinates.
 * Vertical split positions are measured from the top of the canvas.
 *
 * @private
 */
bool czm_SceneGISSplitVisible(float direction)
{
    // Direction can arrive through an interpolated float varying. Classify the
    // enum range instead of requiring exact equality after rasterization.
    if (direction < -1.5) {
        return gl_FragCoord.y >= czm_sceneGISSplitPositionY;
    }
    if (direction > 1.5) {
        return gl_FragCoord.y <= czm_sceneGISSplitPositionY;
    }
    return !((direction < 0.0 && gl_FragCoord.x > czm_splitPosition) ||
             (direction > 0.0 && gl_FragCoord.x < czm_splitPosition));
}
