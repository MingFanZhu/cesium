import Cartesian4 from "../../../Core/Cartesian4.js";

function getAddress(tile, provider) {
  const level = Math.min(tile.level, provider.maximumLevel);
  const factor = 2 ** (tile.level - level);
  return {
    level,
    x: Math.floor(tile.x / factor),
    y: Math.floor(tile.y / factor),
  };
}

function setTranslationScale(tile, entry, result) {
  const delta = tile.level - entry.level;
  const factor = 2 ** delta;
  const localX = tile.x - entry.x * factor;
  const localY = tile.y - entry.y * factor;
  const scale = 1.0 / factor;
  result.x = localX * scale;
  result.y = 1.0 - (localY + 1.0) * scale;
  result.z = scale;
  result.w = scale;
  return result;
}

/**
 * Holds one surface tile's dependencies for one imagery layer.
 *
 * @alias SceneGISPlanarTileImagery
 * @constructor
 * @private
 */
function SceneGISPlanarTileImagery(manager, tile, runtime) {
  this.manager = manager;
  this.tile = tile;
  this.runtime = runtime;
  this.desiredAddress = getAddress(tile, runtime.layer.imageryProvider);
  this.desired = manager.acquire(runtime, this.desiredAddress);
  this.fallback = undefined;
  this.selected = undefined;
  this.translationScale = new Cartesian4(0.0, 0.0, 1.0, 1.0);
  this._destroyed = false;
}

SceneGISPlanarTileImagery.prototype.select = function () {
  const manager = this.manager;
  const desired = this.desired;
  let selected = desired.state === manager.State.READY ? desired : undefined;
  if (
    desired.state === manager.State.FAILED &&
    this.fallback?.state === manager.State.READY
  ) {
    selected = this.fallback;
  }

  if (!selected && desired.state !== manager.State.FAILED) {
    let level = desired.level - 1;
    while (level >= 0) {
      const factor = 2 ** (desired.level - level);
      const address = {
        level,
        x: Math.floor(desired.x / factor),
        y: Math.floor(desired.y / factor),
      };
      const cached = manager.find(this.runtime, address);
      if (cached?.state === manager.State.READY) {
        selected = cached;
        break;
      }
      --level;
    }
  }

  if (
    !selected &&
    desired.level > 0 &&
    desired.state !== manager.State.FAILED
  ) {
    const rootAddress = { level: 0, x: 0, y: 0 };
    if (!this.fallback || this.fallback.level !== 0) {
      if (this.fallback) {
        manager.release(this.runtime, this.fallback);
      }
      this.fallback = manager.acquire(this.runtime, rootAddress);
    }
  }

  if (selected && selected !== desired) {
    if (this.fallback !== selected) {
      if (this.fallback) {
        manager.release(this.runtime, this.fallback);
      }
      this.fallback = manager.acquire(this.runtime, selected);
    }
  } else if (selected === desired || desired.state === manager.State.FAILED) {
    if (this.fallback && this.fallback !== selected) {
      manager.release(this.runtime, this.fallback);
      this.fallback = undefined;
    }
  }

  if (!selected && this.fallback?.state === manager.State.READY) {
    selected = this.fallback;
  }
  this.selected = selected;
  if (selected) {
    setTranslationScale(this.tile, selected, this.translationScale);
  }
  return selected;
};

SceneGISPlanarTileImagery.prototype.isSettled = function () {
  return (
    this.desired.state === this.manager.State.READY ||
    this.desired.state === this.manager.State.FAILED
  );
};

SceneGISPlanarTileImagery.prototype.destroy = function () {
  if (this._destroyed) {
    return;
  }
  this.manager.release(this.runtime, this.desired);
  if (this.fallback) {
    this.manager.release(this.runtime, this.fallback);
  }
  this.desired = undefined;
  this.fallback = undefined;
  this.selected = undefined;
  this._destroyed = true;
};

export default SceneGISPlanarTileImagery;
