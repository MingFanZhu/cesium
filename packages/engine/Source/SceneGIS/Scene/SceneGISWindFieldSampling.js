import DeveloperError from "../../Core/DeveloperError.js";
import shaderSource from "../../Shaders/SceneGIS/Wind/SceneGISWindSampling.js";

/**
 * 格心风场图集的公开 GPU 消费适配器。将 shaderSource 追加到 GLSL 着色器，并将 createUniformMap(field) 合并到原生采样器回调。函数使用模拟局部米制坐标：sceneGISWindInside、sceneGISWindSolid、sceneGISWindSample（vec4，速度 m/s 与示踪量）。三线性插值忽略固体角点并重新归一化权重，固体内部或域外采样返回零。这是显示采样器，不是守恒输运算子。每次绘制须解析实时场 getter；不得销毁借用纹理，应先销毁消费者。
 * @namespace SceneGISWindFieldSampling
 */
const SceneGISWindFieldSampling = {
  /**
   * 使用 u_sgWind 前缀的 GLSL 声明和采样函数。
   * @type {string}
   * @readonly
   */
  shaderSource,
  /**
   * @param {SceneGISWindSimulation.GpuField} field 已就绪的借用 GPU 描述对象。
   * @returns {object} Uniform 回调，不改变其纹理所有权。
   */
  createUniformMap(field) {
    if (!field) {
      throw new DeveloperError("A ready wind GPU field is required.");
    }
    return {
      u_sgWindVelocity: () => field.velocityTexture,
      u_sgWindSolid: () => field.solidTexture,
      u_sgWindTracer: () => field.concentrationTexture,
      u_sgWindDimensions: () => field.dimensions,
      u_sgWindMinimum: () => field.minimum,
      u_sgWindCellSize: () => field.cellSize,
      u_sgWindColumns: () => field.atlasColumns,
    };
  },
};
export default SceneGISWindFieldSampling;
