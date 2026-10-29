import defined from "./defined.js";
import DeveloperError from "./DeveloperError.js";
import getAbsoluteUri from "./getAbsoluteUri.js";
import Resource from "./Resource.js";

// SCENEGIS_PATCH_BEGIN SGP-0073: Recognize either distribution without renaming modules.
/*global SCENEGIS_BASE_URL,CESIUM_BASE_URL,define,require*/
const cesiumScriptRegex = /((?:.*\/)|^)(?:Cesium|SceneGIS)\.js(?:\?|\#|$)/;
// SCENEGIS_PATCH_END SGP-0073
function getBaseUrlFromCesiumScript() {
  const scripts = document.getElementsByTagName("script");
  for (let i = 0, len = scripts.length; i < len; ++i) {
    const src = scripts[i].getAttribute("src");
    const result = cesiumScriptRegex.exec(src);
    if (result !== null) {
      return result[1];
    }
  }
  return undefined;
}

let a;
function tryMakeAbsolute(url) {
  if (typeof document === "undefined") {
    // Node.js and Web Workers. In both cases, the URL will already be absolute.
    return url;
  }

  if (!defined(a)) {
    a = document.createElement("a");
  }
  a.href = url;
  return a.href;
}

let baseResource;
function getCesiumBaseUrl() {
  if (defined(baseResource)) {
    return baseResource;
  }

  let baseUrlString;
  // SCENEGIS_PATCH_BEGIN SGP-0073: The branded resource root takes precedence.
  if (typeof SCENEGIS_BASE_URL !== "undefined") {
    baseUrlString = SCENEGIS_BASE_URL;
  } else if (typeof CESIUM_BASE_URL !== "undefined") {
    // SCENEGIS_PATCH_END SGP-0073
    baseUrlString = CESIUM_BASE_URL;
  } else if (defined(import.meta?.url)) {
    // ESM
    baseUrlString = getAbsoluteUri(".", import.meta.url);
  } else if (
    typeof define === "object" &&
    defined(define.amd) &&
    !define.amd.toUrlUndefined &&
    defined(require.toUrl)
  ) {
    // RequireJS
    baseUrlString = getAbsoluteUri(
      "..",
      buildModuleUrl("Core/buildModuleUrl.js"),
    );
  } else {
    // IIFE
    baseUrlString = getBaseUrlFromCesiumScript();
  }

  //>>includeStart('debug', pragmas.debug);
  if (!defined(baseUrlString)) {
    throw new DeveloperError(
      // SCENEGIS_PATCH_BEGIN SGP-0073: Explain both explicit resource roots.
      "Unable to determine the engine base URL automatically, try defining SCENEGIS_BASE_URL or CESIUM_BASE_URL.",
      // SCENEGIS_PATCH_END SGP-0073
    );
  }
  //>>includeEnd('debug');

  baseResource = new Resource({
    url: tryMakeAbsolute(baseUrlString),
  });
  baseResource.appendForwardSlash();

  return baseResource;
}

function buildModuleUrlFromRequireToUrl(moduleID) {
  //moduleID will be non-relative, so require it relative to this module, in Core.
  return tryMakeAbsolute(require.toUrl(`../${moduleID}`));
}

function buildModuleUrlFromBaseUrl(moduleID) {
  const resource = getCesiumBaseUrl().getDerivedResource({
    url: moduleID,
  });
  return resource.url;
}

let implementation;

/**
 * Given a relative URL under the Cesium base URL, returns an absolute URL.
 * @function
 *
 * @param {string} relativeUrl The relative path.
 * @returns {string} The absolutely URL representation of the provided path.
 *
 * @example
 * const viewer = new Cesium.Viewer("cesiumContainer", {
 *   baseLayer: Cesium.ImageryLayer.fromProviderAsync(
 *     Cesium.TileMapServiceImageryProvider.fromUrl(
 *       Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
 *     )),
 *   baseLayerPicker: false,
 * });
 */
function buildModuleUrl(relativeUrl) {
  if (!defined(implementation)) {
    //select implementation
    if (
      typeof define === "object" &&
      defined(define.amd) &&
      !define.amd.toUrlUndefined &&
      defined(require.toUrl)
    ) {
      implementation = buildModuleUrlFromRequireToUrl;
    } else {
      implementation = buildModuleUrlFromBaseUrl;
    }
  }

  const url = implementation(relativeUrl);
  return url;
}

// exposed for testing
buildModuleUrl._cesiumScriptRegex = cesiumScriptRegex;
buildModuleUrl._buildModuleUrlFromBaseUrl = buildModuleUrlFromBaseUrl;
buildModuleUrl._clearBaseResource = function () {
  baseResource = undefined;
};

/**
 * Sets the base URL for resolving modules.
 * @param {string} value The new base URL.
 */
buildModuleUrl.setBaseUrl = function (value) {
  baseResource = Resource.DEFAULT.getDerivedResource({
    url: value,
  });
};

/**
 * Gets the base URL for resolving modules.
 *
 * @function
 * @returns {string} The configured base URL
 */
buildModuleUrl.getCesiumBaseUrl = getCesiumBaseUrl;

export default buildModuleUrl;
