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
  const provider = runtime.layer.imageryProvider;
  this.coverage = new Cartesian4(0.0, 0.0, 1.0, 1.0);
  const coverage = provider.coverageExtent;
  if (coverage) {
    const extent = tile.extent;
    this.coverage.x = Math.max(
      0.0,
      (coverage.minimumX - extent.minimumX) / extent.width,
    );
    this.coverage.y = Math.max(
      0.0,
      (coverage.minimumY - extent.minimumY) / extent.height,
    );
    this.coverage.z = Math.min(
      1.0,
      (coverage.maximumX - extent.minimumX) / extent.width,
    );
    this.coverage.w = Math.min(
      1.0,
      (coverage.maximumY - extent.minimumY) / extent.height,
    );
  }
  const covered =
    tile.level >= provider.minimumLevel &&
    this.coverage.x < this.coverage.z &&
    this.coverage.y < this.coverage.w;
  this.desiredAddress = covered ? getAddress(tile, provider) : undefined;
  this.desired = covered
    ? manager.acquire(runtime, this.desiredAddress)
    : undefined;
  this.fallback = undefined;
  this.selected = undefined;
  this.translationScale = new Cartesian4(0.0, 0.0, 1.0, 1.0);
  this._destroyed = false;
}

SceneGISPlanarTileImagery.prototype.select = function () {
  const manager = this.manager;
  const desired = this.desired;
  if (!desired) {
    return undefined;
  }
  const minimumLevel = this.runtime.layer.imageryProvider.minimumLevel;
  let selected = desired.state === manager.State.READY ? desired : undefined;
  if (
    desired.state === manager.State.FAILED &&
    this.fallback?.state === manager.State.READY
  ) {
    selected = this.fallback;
  }

  if (!selected && desired.state !== manager.State.FAILED) {
    let level = desired.level - 1;
    while (level >= minimumLevel) {
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
    desired.level > minimumLevel &&
    desired.state !== manager.State.FAILED
  ) {
    const factor = 2 ** (desired.level - minimumLevel);
    const rootAddress = {
      level: minimumLevel,
      x: Math.floor(desired.x / factor),
      y: Math.floor(desired.y / factor),
    };
    if (!this.fallback || this.fallback.level !== minimumLevel) {
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
  if (!this.desired) {
    return true;
  }
  const State = this.manager.State;
  if (this.desired.state === State.UNAVAILABLE) {
    return (
      !this.fallback ||
      this.fallback.state === State.READY ||
      this.fallback.state === State.FAILED ||
      this.fallback.state === State.UNAVAILABLE
    );
  }
  return (
    this.desired.state === this.manager.State.READY ||
    this.desired.state === this.manager.State.FAILED
  );
};

SceneGISPlanarTileImagery.prototype.destroy = function () {
  if (this._destroyed) {
    return;
  }
  if (this.desired) {
    this.manager.release(this.runtime, this.desired);
  }
  if (this.fallback) {
    this.manager.release(this.runtime, this.fallback);
  }
  this.desired = undefined;
  this.fallback = undefined;
  this.selected = undefined;
  this._destroyed = true;
};

export default SceneGISPlanarTileImagery;
