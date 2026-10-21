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
 * Reusable three-band FFT wind waves for SceneGISWaterSurface. Uses a seeded JONSWAP/TMA
 * spectrum, finite-depth dispersion and local XY meters. This is visual wave synthesis,
 * not a hydraulic solver or a prediction of measured weather/bathymetry. Spectra repeat
 * over patchLength, four times patchLength and patchLength / 8; wavelengths outside the represented bands
 * are omitted. Wind and fetch describe a steady wind sea, without island diffraction.
 * Attach through WaterSurface's windWaves option. One object may be shared by surfaces
 * using aligned local coordinates in the same Scene context. The caller owns this object:
 * remove its surfaces before destroy(). Allocation is lazy and simulation follows Scene time.
 * @alias SceneGISWindWaves
 * @constructor
 * @param {object} [options] Wave configuration.
 * @param {number} [options.windSpeed=6] Wind speed at 10 m above water, in m/s, in [0, 40].
 * @param {Cartesian2} [options.windDirection=Cartesian2.UNIT_X] Wave travel direction in local XY, not wind-from bearing.
 * @param {number} [options.fetchLength=1500] Effective wind fetch in meters, in [10, 1000000].
 * @param {number} [options.waterDepth=3] Uniform mean depth for dispersion/TMA, in meters, in [0.1, 10000].
 * @param {number} [options.amplitudeScale=1] Artistic displacement multiplier in [0, 4].
 * @param {number} [options.choppiness=0.7] Horizontal crest displacement strength in [0, 1].
 * @param {number} [options.whitecapIntensity=0.3] Compression-based crest foam strength in [0, 1].
 * @param {number} [options.directionalSpread=0.7] Angular spreading in [0, 1], increasingly broad above the spectral peak. Zero retains narrow wind-aligned waves.
 * @param {number} [options.rippleIntensity=1] Fine-band amplitude multiplier in [0, 4].
 * @param {number} [options.resolution=128] Immutable FFT size: 32, 64, 128 or 256.
 * @param {number} [options.patchLength=64] Immutable base-band period in meters, in [16, 1024].
 * @param {number} [options.seed=12345] Immutable unsigned 32-bit random seed.
 */
function SceneGISWindWaves(options = {}) {
  /**
   *  Wind speed in m/s.
   * @type {number}
   */
  this.windSpeed = options.windSpeed ?? 6;
  /**
   *  Local XY wave travel direction.
   * @type {Cartesian2}
   */
  this.windDirection = Cartesian2.clone(
    options.windDirection ?? Cartesian2.UNIT_X,
  );
  /**
   *  Effective fetch in meters.
   * @type {number}
   */
  this.fetchLength = options.fetchLength ?? 1500;
  /**
   *  Mean depth in meters.
   * @type {number}
   */
  this.waterDepth = options.waterDepth ?? 3;
  /**
   *  Artistic amplitude multiplier.
   * @type {number}
   */
  this.amplitudeScale = options.amplitudeScale ?? 1;
  /**
   *  Horizontal displacement strength.
   * @type {number}
   */
  this.choppiness = options.choppiness ?? 0.7;
  /**
   *  Crest foam strength.
   * @type {number}
   */
  this.whitecapIntensity = options.whitecapIntensity ?? 0.3;
  /**
   * Angular spread in [0, 1]; short waves spread more than long waves.
   * @type {number}
   */
  this.directionalSpread = options.directionalSpread ?? 0.7;
  /**
   * Fine-band amplitude multiplier in [0, 4].
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
   *  FFT size.
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
   *  Base-band period in meters.
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
   *  Deterministic random seed.
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
   *  Whether GPU outputs exist.
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
   *  Estimated significant height of the represented spectrum in meters; available after update.
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
      u_whitecapIntensity: () => this.whitecapIntensity,
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
        state.bands[i] = {
          length: data.length,
          initial: texture(context, n),
          output: target(context, n, PixelDatatype.HALF_FLOAT),
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
  state.timeScale = timeScale;
  state.seconds =
    JulianDate.secondsDifference(frameState.time, state.epoch) * timeScale;
  state.draws = 0;
  for (const band of state.bands) {
    state.band = band;
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
 *  @returns {boolean} Whether this simulation has been destroyed.
 */
SceneGISWindWaves.prototype.isDestroyed = function () {
  return false;
};
/**
 *  Releases owned FFT textures and programs; remove borrowing surfaces first.
 * @returns {undefined}
 */
SceneGISWindWaves.prototype.destroy = function () {
  const s = this._state;
  if (s) {
    for (const band of s.bands) {
      band.initial.destroy();
      band.output.destroy();
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
