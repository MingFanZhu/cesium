import Cartesian3 from "../../Core/Cartesian3.js";
import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Request from "../../Core/Request.js";
import RequestType from "../../Core/RequestType.js";
/* eslint-disable-next-line no-unused-vars -- Public JSDoc type requires a runtime-resolvable import. */
import SceneGISPlanarTerrainProvider from "./SceneGISPlanarTerrainProvider.js";
import SceneGISPlanarTilingScheme from "./SceneGISPlanarTilingScheme.js";

function validateProvider(provider) {
  if (
    !provider ||
    !(provider.tilingScheme instanceof SceneGISPlanarTilingScheme)
  ) {
    throw new DeveloperError(
      "terrainProvider must use a SceneGISPlanarTilingScheme.",
    );
  }
  if (
    !Number.isFinite(provider.minimumHeight) ||
    !Number.isFinite(provider.maximumHeight) ||
    provider.maximumHeight < provider.minimumHeight
  ) {
    throw new DeveloperError(
      "terrainProvider heights must be finite and ordered.",
    );
  }
  if (
    !Number.isInteger(provider.maximumLevel) ||
    provider.maximumLevel < 0 ||
    provider.maximumLevel > provider.tilingScheme.maximumSafeLevel
  ) {
    throw new DeveloperError(
      "terrainProvider.maximumLevel must be a supported non-negative integer.",
    );
  }
  const errorEvent = provider.errorEvent;
  if (!(
    errorEvent instanceof Event ||
    (errorEvent &&
      typeof errorEvent.addEventListener === "function" &&
      typeof errorEvent.raiseEvent === "function")
  )) {
    throw new DeveloperError(
      "terrainProvider.errorEvent must provide addEventListener and raiseEvent.",
    );
  }
  if (provider.credit !== undefined && !(provider.credit instanceof Credit)) {
    throw new DeveloperError(
      "terrainProvider.credit must be undefined or a Credit.",
    );
  }
  for (const method of [
    "getLevelMaximumGeometricError",
    "requestTileGeometry",
    "getTileDataAvailable",
    "loadTileDataAvailability",
  ]) {
    if (typeof provider[method] !== "function") {
      throw new DeveloperError(`terrainProvider.${method} must be a function.`);
    }
  }
}

function validateArguments(provider, level, positions, rejectOnTileFail) {
  validateProvider(provider);
  if (!Number.isInteger(level) || level < 0 || level > provider.maximumLevel) {
    throw new DeveloperError(
      "level must be a non-negative integer not exceeding terrainProvider.maximumLevel.",
    );
  }
  if (!Array.isArray(positions)) {
    throw new DeveloperError(
      "positions must be an array of Cartesian3 values.",
    );
  }
  for (const position of positions) {
    if (
      !(position instanceof Cartesian3) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      throw new DeveloperError(
        "Every position must be a Cartesian3 with finite components.",
      );
    }
  }
  if (typeof rejectOnTileFail !== "boolean") {
    throw new DeveloperError("rejectOnTileFail must be a boolean.");
  }
}

const schedulerRetryDelay = 100;

function delay() {
  return new Promise((resolve) => {
    setTimeout(resolve, schedulerRetryDelay);
  });
}

async function requestTile(provider, group) {
  let available = provider.getTileDataAvailable(group.x, group.y, group.level);
  if (available === false) {
    return undefined;
  }
  if (available !== true && available !== undefined) {
    throw new DeveloperError(
      "getTileDataAvailable must return true, false, or undefined.",
    );
  }
  if (available === undefined) {
    const metadataPromise = provider.loadTileDataAvailability(
      group.x,
      group.y,
      group.level,
    );
    if (metadataPromise !== undefined) {
      if (typeof metadataPromise.then !== "function") {
        throw new DeveloperError(
          "loadTileDataAvailability must return a Promise or undefined.",
        );
      }
      await metadataPromise;
      available = provider.getTileDataAvailable(group.x, group.y, group.level);
      if (available === false) {
        return undefined;
      }
      if (available !== true && available !== undefined) {
        throw new DeveloperError(
          "getTileDataAvailable must return true, false, or undefined.",
        );
      }
    }
  }

  const request = new Request({
    throttle: false,
    throttleByServer: true,
    type: RequestType.TERRAIN,
  });
  let promise;
  do {
    promise = provider.requestTileGeometry(
      group.x,
      group.y,
      group.level,
      request,
    );
    if (promise === undefined) {
      await delay();
    }
  } while (promise === undefined);
  if (!promise || typeof promise.then !== "function") {
    throw new DeveloperError(
      "requestTileGeometry must return a Promise or undefined.",
    );
  }
  return promise;
}

function validateTerrainData(provider, terrainData) {
  if (
    !terrainData ||
    !Number.isFinite(terrainData.minimumHeight) ||
    !Number.isFinite(terrainData.maximumHeight) ||
    terrainData.maximumHeight < terrainData.minimumHeight ||
    terrainData.minimumHeight < provider.minimumHeight ||
    terrainData.maximumHeight > provider.maximumHeight ||
    typeof terrainData.interpolateHeight !== "function"
  ) {
    throw new DeveloperError(
      "Terrain data must have finite ordered heights within the provider range and support interpolation.",
    );
  }
}

async function sampleGroup(provider, group, results) {
  const terrainData = await requestTile(provider, group);
  if (terrainData === undefined) {
    return;
  }
  validateTerrainData(provider, terrainData);
  const extent = provider.tilingScheme.tileXYToExtent(
    group.x,
    group.y,
    group.level,
  );
  const heights = new Array(group.indices.length);
  for (let i = 0; i < group.indices.length; ++i) {
    const index = group.indices[i];
    const position = group.positions[index];
    const height = terrainData.interpolateHeight(
      extent,
      position.x,
      position.y,
    );
    if (!Number.isFinite(height)) {
      throw new DeveloperError(
        "Terrain data must return a finite height for every in-tile position.",
      );
    }
    heights[i] = height;
  }
  for (let i = 0; i < group.indices.length; ++i) {
    results[group.indices[i]] = heights[i];
  }
}

async function sample(provider, level, positions, rejectOnTileFail) {
  const results = new Array(positions.length).fill(undefined);
  const groups = new Map();
  for (let i = 0; i < positions.length; ++i) {
    const coordinates = provider.tilingScheme.positionToTileXY(
      positions[i],
      level,
    );
    if (coordinates === undefined) {
      continue;
    }
    const key = `${level}/${coordinates.x}/${coordinates.y}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        x: coordinates.x,
        y: coordinates.y,
        level,
        positions,
        indices: [],
      };
      groups.set(key, group);
    }
    group.indices.push(i);
  }

  const promises = [];
  for (const group of groups.values()) {
    let promise = sampleGroup(provider, group, results);
    if (!rejectOnTileFail) {
      promise = promise.catch(() => undefined);
    }
    promises.push(promise);
  }
  await Promise.all(promises);
  return results;
}

/**
 * 对平面地形提供者进行独立、显式层级的采样。此命名空间不可实例化。
 *
 * @namespace SceneGISPlanarTerrainSampler
 */
const SceneGISPlanarTerrainSampler = {};

/**
 * 在显式层级采样提供者地形，不访问 World 缓存或修改输入位置。
 *
 * @param {SceneGISPlanarTerrainProvider} terrainProvider 同步就绪的地形提供者。
 * @param {number} level 采样的地形层级。
 * @param {Cartesian3[]} positions 要采样的有限平面位置。
 * @param {boolean} [rejectOnTileFail=false] 单个瓦片的运行时失败是否使整个操作拒绝。
 * @returns {Promise<Array<number|undefined>>} 按输入顺序排列的高度；范围外、不可用或容忍失败的瓦片为 undefined。
 *
 * @exception {DeveloperError} 提供者、层级、位置或拒绝策略无效。
 */
SceneGISPlanarTerrainSampler.sampleAtLevel = function (
  terrainProvider,
  level,
  positions,
  rejectOnTileFail = false,
) {
  validateArguments(terrainProvider, level, positions, rejectOnTileFail);
  return sample(terrainProvider, level, positions, rejectOnTileFail);
};

export default SceneGISPlanarTerrainSampler;
