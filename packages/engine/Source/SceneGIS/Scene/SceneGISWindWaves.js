import BoundingRectangle from "../../Core/BoundingRectangle.js";
import Cartesian2 from "../../Core/Cartesian2.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import JulianDate from "../../Core/JulianDate.js";
import PixelFormat from "../../Core/PixelFormat.js";
import RuntimeError from "../../Core/RuntimeError.js";
import Framebuffer from "../../Renderer/Framebuffer.js";
import PixelDatatype from "../../Renderer/PixelDatatype.js";
import RenderState from "../../Renderer/RenderState.js";
import Sampler from "../../Renderer/Sampler.js";
import Texture from "../../Renderer/Texture.js";
import TextureWrap from "../../Renderer/TextureWrap.js";
import TextureMinificationFilter from "../../Renderer/TextureMinificationFilter.js";
import TextureMagnificationFilter from "../../Renderer/TextureMagnificationFilter.js";
import spectrum from "./_private/_SceneGISWindSpectrum.js";
import evolution from "../../Shaders/SceneGIS/Water/SceneGISWindEvolution.js";
import fft from "../../Shaders/SceneGIS/Water/SceneGISWindFFT.js";
import finalize from "../../Shaders/SceneGIS/Water/SceneGISWindFinalize.js";

const fields = [
  "windSpeed",
  "fetchLength",
  "waterDepth",
  "amplitudeScale",
  "choppiness",
  "whitecapIntensity",
  "directionalSpread",
  "rippleIntensity",
];
const ranges = [
  [0, 40],
  [10, 1000000],
  [0.1, 10000],
  [0, 4],
  [0, 1],
  [0, 1],
  [0, 1],
  [0, 4],
];
const repeat = new Sampler({
  wrapS: TextureWrap.REPEAT,
  wrapT: TextureWrap.REPEAT,
  minificationFilter: TextureMinificationFilter.LINEAR_MIPMAP_LINEAR,
  magnificationFilter: TextureMagnificationFilter.LINEAR,
});
function validate(waves) {
  if (
    !Number.isFinite(waves.foamHalfLife) ||
    waves.foamHalfLife < 0 ||
    waves.foamHalfLife > 30
  ) {
    throw new DeveloperError("foamHalfLife must be in [0, 30] seconds.");
  }
  for (let i = 0; i < fields.length; ++i) {
    const value = waves[fields[i]],
      range = ranges[i];
    if (!Number.isFinite(value) || value < range[0] || value > range[1]) {
      throw new DeveloperError(`${fields[i]} is outside its supported range.`);
    }
  }
  if (
    !Number.isFinite(waves.windDirection?.x) ||
    !Number.isFinite(waves.windDirection?.y) ||
    Cartesian2.magnitudeSquared(waves.windDirection) === 0
  ) {
    throw new DeveloperError(
      "windDirection must be a finite nonzero Cartesian2.",
    );
  }
}
function texture(context, size, datatype = PixelDatatype.FLOAT) {
  return new Texture({
    context,
    flipY: false,
    width: size,
    height: size,
    pixelFormat: PixelFormat.RGBA,
    pixelDatatype: datatype,
    sampler: Sampler.NEAREST,
  });
}
function target(context, size, datatype) {
  return new Framebuffer({
    context,
    colorTextures: [
      texture(context, size, datatype),
      texture(context, size, datatype),
    ],
  });
}

/**
 * 供 SceneGISWaterSurface 复用的三频带 FFT 风浪。使用带种子的 JONSWAP/TMA 频谱、有限水深色散和局部 XY 米制坐标。这是可视化波浪合成，不是水动力求解器，也不预测实测天气或水深。频谱分别以 patchLength、其四倍及其八分之一为周期，表示频带之外的波长被省略。风与吹程描述稳态风海，不包含岛屿绕射。
 * 通过 WaterSurface 的 windWaves 选项挂载。在同一 Scene Context 中，局部坐标对齐的多个水面可共享同一对象。对象归调用方所有，destroy() 前须移除借用水面。资源延迟分配，模拟遵循 Scene 时间。
 * @alias SceneGISWindWaves
 * @constructor
 * @param {object} [options] 波浪配置。
 * @param {number} [options.windSpeed=6] 水面上方 10 米处风速，单位为 m/s，范围 [0,40]。
 * @param {Cartesian2} [options.windDirection=Cartesian2.UNIT_X] 局部 XY 波浪传播方向，不是风的来源方位。
 * @param {number} [options.fetchLength=1500] 有效风吹程，单位为米，范围 [10,1000000]。
 * @param {number} [options.waterDepth=3] 用于色散和 TMA 的均匀平均水深，单位为米，范围 [0.1,10000]。
 * @param {number} [options.amplitudeScale=1] 艺术化位移倍率，范围 [0,4]。
 * @param {number} [options.choppiness=0.7] 水平波峰位移强度，范围 [0,1]。
 * @param {number} [options.whitecapIntensity=0.3] 基于压缩程度的波峰白沫强度，范围 [0,1]。
 * @param {number} [options.foamHalfLife=2] 风浪白沫半衰期，单位为模拟秒，范围 [0,30]。0 禁用历史，时间回退或波浪配置变化会重置历史。
 * @param {number} [options.directionalSpread=0.7] 角度扩散，范围 [0,1]，频谱峰值以上越来越宽。0 保留沿风向的窄波。
 * @param {number} [options.rippleIntensity=1] 细频带振幅倍率，范围 [0,4]。
 * @param {number} [options.resolution=128] 不可变 FFT 尺寸，可取 32、64、128 或 256。
 * @param {number} [options.patchLength=64] 不可变基础频带周期，单位为米，范围 [16,1024]。
 * @param {number} [options.seed=12345] 不可变无符号 32 位随机种子。
 */
function SceneGISWindWaves(options = {}) {
  /**
   *  风速，单位为 m/s。
   * @type {number}
   */
  this.windSpeed = options.windSpeed ?? 6;
  /**
   *  局部 XY 波浪传播方向。
   * @type {Cartesian2}
   */
  this.windDirection = Cartesian2.clone(
    options.windDirection ?? Cartesian2.UNIT_X,
  );
  /**
   *  有效吹程，单位为米。
   * @type {number}
   */
  this.fetchLength = options.fetchLength ?? 1500;
  /**
   *  平均水深，单位为米。
   * @type {number}
   */
  this.waterDepth = options.waterDepth ?? 3;
  /**
   *  艺术化振幅倍率。
   * @type {number}
   */
  this.amplitudeScale = options.amplitudeScale ?? 1;
  /**
   *  水平位移强度。
   * @type {number}
   */
  this.choppiness = options.choppiness ?? 0.7;
  /**
   *  波峰白沫强度。
   * @type {number}
   */
  this.whitecapIntensity = options.whitecapIntensity ?? 0.3;
  /**
   * 风浪白沫覆盖半衰期，单位为模拟秒，范围 [0,30]；0 使用瞬时白沫。
   * @type {number}
   */
  this.foamHalfLife = options.foamHalfLife ?? 2;
  /**
   * 角度扩散，范围 [0,1]，短波比长波更分散。
   * @type {number}
   */
  this.directionalSpread = options.directionalSpread ?? 0.7;
  /**
   * 细频带振幅倍率，范围 [0,4]。
   * @type {number}
   */
  this.rippleIntensity = options.rippleIntensity ?? 1;
  this._resolution = options.resolution ?? 128;
  this._patchLength = options.patchLength ?? 64;
  this._seed = options.seed ?? 12345;
  if (
    ![32, 64, 128, 256].includes(this._resolution) ||
    !Number.isFinite(this._patchLength) ||
    this._patchLength < 16 ||
    this._patchLength > 1024 ||
    !Number.isInteger(this._seed) ||
    this._seed < 0 ||
    this._seed > 4294967295
  ) {
    throw new DeveloperError(
      "Invalid wind-wave resolution, patchLength or seed.",
    );
  }
  validate(this);
  this._state = undefined;
  // RiverSurface supplies normalized visual bands without changing the public wind spectrum.
  this._spectrum = options._spectrum ?? spectrum;
  this._significantWaveHeight = 0;
  this._maximumDisplacement = 0;
}
Object.defineProperties(SceneGISWindWaves.prototype, {
  /**
   *  FFT 尺寸。
   * @memberof SceneGISWindWaves.prototype
   * @type {number}
   * @readonly
   */
  resolution: {
    get() {
      return this._resolution;
    },
  },
  /**
   *  基础频带周期，单位为米。
   * @memberof SceneGISWindWaves.prototype
   * @type {number}
   * @readonly
   */
  patchLength: {
    get() {
      return this._patchLength;
    },
  },
  /**
   *  确定性随机种子。
   * @memberof SceneGISWindWaves.prototype
   * @type {number}
   * @readonly
   */
  seed: {
    get() {
      return this._seed;
    },
  },
  /**
   *  是否存在 GPU 输出。
   * @memberof SceneGISWindWaves.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get() {
      return !!this._state?.time;
    },
  },
  /**
   *  已表示频谱的估计有义波高，单位为米，更新后可用。
   * @memberof SceneGISWindWaves.prototype
   * @type {number}
   * @readonly
   */
  significantWaveHeight: {
    get() {
      return this._significantWaveHeight;
    },
  },
});
/**
 * @private
 */
SceneGISWindWaves.prototype._update = function (frameState, timeScale = 1) {
  validate(this);
  const context = frameState.context,
    n = this.resolution;
  if (this._state && this._state.context !== context) {
    throw new DeveloperError("Wind waves belong to one rendering context.");
  }
  if (
    !context.webgl2 ||
    !context.colorBufferFloat ||
    !context.textureHalfFloatLinear
  ) {
    throw new RuntimeError(
      "Wind waves require WebGL2 floating-point rendering and half-float filtering.",
    );
  }
  let state = this._state;
  if (!state) {
    state = this._state = {
      context,
      epoch: JulianDate.clone(frameState.time),
      bands: [],
      buffers: [target(context, n), target(context, n)],
      seconds: 0,
      foamShift: new Cartesian2(),
      axis: 0,
      halfSpan: 1,
    };
    const uniformMap = {
      u_initial: () => state.band.initial,
      u_seconds: () => state.seconds,
      u_choppiness: () => this.choppiness,
      u_a: () => state.input.getColorTexture(0),
      u_b: () => state.input.getColorTexture(1),
      u_axis: () => state.axis,
      u_halfSpan: () => state.halfSpan,
      u_spacing: () => state.band.length / n,
      u_whitecapIntensity: () =>
        state.band.length >= this.patchLength ? this.whitecapIntensity : 0,
      u_foamHistory: () => state.band.history,
      u_foamDecay: () => state.foamDecay,
      u_foamShift: () => state.foamShift,
    };
    const renderState = RenderState.fromCache({
      viewport: new BoundingRectangle(0, 0, n, n),
    });
    state.commands = [evolution, fft, finalize].map((source) =>
      context.createViewportQuadCommand(source, {
        owner: this,
        uniformMap,
        renderState,
      }),
    );
  }
  const changed =
    !state.config ||
    fields.some((key, i) => this[key] !== state.config[i]) ||
    this.windDirection.x !== state.config[fields.length] ||
    this.windDirection.y !== state.config[fields.length + 1];
  if (
    !changed &&
    state.halfLife === this.foamHalfLife &&
    state.timeScale === timeScale &&
    JulianDate.equals(state.time, frameState.time)
  ) {
    return;
  }
  if (changed) {
    const generated = this._spectrum(this);
    this._significantWaveHeight = generated.significantWaveHeight;
    this._maximumDisplacement = generated.maximumDisplacement;
    for (let i = 0; i < generated.bands.length; ++i) {
      const data = generated.bands[i];
      if (!state.bands[i]) {
        const output = target(context, n, PixelDatatype.HALF_FLOAT);
        const history = texture(context, n, PixelDatatype.HALF_FLOAT);
        state.bands[i] = {
          length: data.length,
          initial: texture(context, n),
          output,
          primary: output,
          history,
          extraNormal: history,
          alternate: new Framebuffer({
            context,
            colorTextures: [output.getColorTexture(0), history],
            destroyAttachments: false,
          }),
        };
      }
      state.bands[i].initial.copyFrom({
        source: { width: n, height: n, arrayBufferView: data.data },
      });
    }
    state.config = fields
      .map((key) => this[key])
      .concat(this.windDirection.x, this.windDirection.y);
  }
  const nextSeconds =
    JulianDate.secondsDifference(frameState.time, state.epoch) * timeScale;
  const delta = nextSeconds - state.seconds;
  const reset =
    changed ||
    state.timeScale !== timeScale ||
    delta < 0 ||
    this.foamHalfLife === 0;
  state.foamDecay = reset ? 0 : Math.pow(2, -delta / this.foamHalfLife);
  Cartesian2.normalize(this.windDirection, state.foamShift);
  Cartesian2.multiplyByScalar(
    state.foamShift,
    reset ? 0 : this.windSpeed * 0.03 * delta,
    state.foamShift,
  );
  state.halfLife = this.foamHalfLife;
  state.timeScale = timeScale;
  state.seconds =
    JulianDate.secondsDifference(frameState.time, state.epoch) * timeScale;
  state.draws = 0;
  for (const band of state.bands) {
    state.band = band;
    band.history = band.output.getColorTexture(1);
    band.output = band.output === band.primary ? band.alternate : band.primary;
    let index = 0;
    const draw = (command, framebuffer) => {
      command.framebuffer = framebuffer;
      command.execute(context);
      ++state.draws;
    };
    draw(state.commands[0], state.buffers[index]);
    for (state.axis = 0; state.axis < 2; ++state.axis) {
      for (state.halfSpan = 1; state.halfSpan < n; state.halfSpan *= 2) {
        state.input = state.buffers[index];
        index = 1 - index;
        draw(state.commands[1], state.buffers[index]);
      }
    }
    state.input = state.buffers[index];
    draw(state.commands[2], band.output);
    for (let i = 0; i < 2; ++i) {
      const t = band.output.getColorTexture(i);
      t.generateMipmap();
      t.sampler = repeat;
    }
  }
  state.time = JulianDate.clone(frameState.time, state.time);
};
/**
 *  @returns {boolean} 此模拟是否已销毁。
 */
SceneGISWindWaves.prototype.isDestroyed = function () {
  return false;
};
/**
 *  释放自有 FFT 纹理与程序，先移除借用水面。
 * @returns {undefined}
 */
SceneGISWindWaves.prototype.destroy = function () {
  const s = this._state;
  if (s) {
    for (const band of s.bands) {
      band.initial.destroy();
      band.alternate.destroy();
      band.extraNormal.destroy();
      band.primary.destroy();
    }
    for (const b of s.buffers) {
      b.destroy();
    }
    for (const c of s.commands) {
      c.shaderProgram.destroy();
    }
  }
  return destroyObject(this);
};
export default SceneGISWindWaves;
