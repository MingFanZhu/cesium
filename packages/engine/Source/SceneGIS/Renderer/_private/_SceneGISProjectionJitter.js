function translate(matrix, jitter) {
  for (let column = 0; column < 16; column += 4) {
    matrix[column] += jitter.x * matrix[column + 3];
    matrix[column + 1] += jitter.y * matrix[column + 3];
  }
}

/** Apply an explicit render-only clip-space translation. @private */
function applySceneGISProjectionJitter(state) {
  const jitter = state._sceneGISProjectionJitter;
  if (!jitter) {
    return;
  }
  translate(state._projection, jitter);
  translate(state._infiniteProjection, jitter);
  const planes = state._frustumPlanes;
  const x = jitter.x * (planes.w - planes.z) * 0.5;
  const y = jitter.y * (planes.x - planes.y) * 0.5;
  planes.x -= y;
  planes.y -= y;
  planes.z -= x;
  planes.w -= x;
}

export default applySceneGISProjectionJitter;
