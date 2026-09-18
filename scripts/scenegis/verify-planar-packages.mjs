#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const repo = path.resolve(process.cwd());
const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "scenegis-package-smoke-"),
);
const publicEngine = [
  "SceneGISEnvironmentEffects",
  "SceneGISWorld",
  "SceneGISPlanarExtent",
  "SceneGISPlanarCoordinateSystem",
  "SceneGISPlanarTilingScheme",
  "SceneGISPlanarTerrainData",
  "SceneGISPlanarHeightmapTerrainData",
  "SceneGISPlanarQuantizedMeshTerrainData",
  "SceneGISPlanarTerrainProvider",
  "SceneGISPlanarLayerTerrainProvider",
  "SceneGISPlanarTerrainSampler",
  "SceneGISPlanarUrlTemplateHeightmapTerrainProvider",
  "SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider",
  "SceneGISPlanarWorld",
  "SceneGISPlanarCameraController",
  "SceneGISPlanarEnvironment",
  "SceneGISPlanarSkyBox",
  "SceneGISPlanarImageryProvider",
  "SceneGISPlanarUrlTemplateImageryProvider",
  "SceneGISPlanarWebMapServiceImageryProvider",
  "SceneGISPlanarWebMapTileServiceImageryProvider",
  "SceneGISPlanarTileMapServiceImageryProvider",
  "SceneGISPlanarSingleTileImageryProvider",
  "SceneGISPlanarImageryLayer",
  "SceneGISPlanarImageryLayerCollection",
  "SceneGISPlanarPolylineGeometry",
  "SceneGISPlanarPolygonGeometry",
  "SceneGISPlanarBoxGeometry",
  "SceneGISPlanarCylinderGeometry",
  "SceneGISPlanarEllipsoidGeometry",
  "SceneGISPlanarWallGeometry",
  "SceneGISPlanarPolylineVolumeGeometry",
  "SceneGISPlanarPrimitive",
  "SceneGISPlanarGroundPrimitive",
];
const namespaceEngine = ["SceneGISPlanarTerrainSampler"];
const callableEngine = publicEngine.filter(
  (name) => !namespaceEngine.includes(name),
);
const publicWidgets = [
  "SceneGISPlanarHomeButton",
  "SceneGISPlanarHomeButtonViewModel",
];
const nonPublicSpellings = [
  "SceneGISPlanarClipping",
  "SceneGISPlanarSurface",
  "SceneGISPlanarQuadtree",
  "SceneGISPlanarTile",
  "SceneGISPlanarTileImagery",
  "SceneGISPlanarCamera",
  "SceneGISPlanarCameraFlight",
  "SceneGISPlanarEntityFraming",
  "SceneGISPlanarEntityTracker",
  "SceneGISPlanarViewerBootstrap",
  "SceneGISPlanarImagery",
  "SceneGISPlanarSurfaceShader",
  "SceneGISPlanarPositionResolver",
  "SceneGISPlanarAnchorVisualizer",
  "SceneGISPlanarModelVisualizer",
  "SceneGISPlanarPolylineVisualizer",
  "SceneGISPlanarPolygonVisualizer",
  "SceneGISPlanarPrimitiveOwner",
  "SceneGISPlanarEntityTransform",
  "SceneGISPlanarSolidVisualizer",
  "SceneGISPlanarAreaVisualizer",
  "SceneGISPlanarRouteVisualizer",
  "SceneGISPlanarPathSampler",
  "SceneGISPlanarPathVisualizer",
  "SceneGISPlanarGroundBounds",
  "SceneGISPlanarGroundCommands",
  "SceneGISPlanarGroundLineShader",
  "SceneGISPlanarGroundVolume",
  "SceneGISPlanarVisualizersCallback",
  "SceneGISPlanarTerrainWorker",
  "SceneGISPlanarTerrainWorkerScheduler",
  "SceneGISPlanarTerrainWorkerTasks",
  "SceneGISPlanarCelestialBodyRenderer",
  "SceneGISPlanarAtmosphereRenderer",
  "SceneGISPlanarSceneApi",
];
const softPrivateContentSymbols = [
  "_SceneGISPlanarClipping",
  "_SceneGISPlanarCamera",
  "_SceneGISPlanarCameraFlight",
  "_SceneGISPlanarEntityFraming",
  "_SceneGISPlanarPositionResolver",
  "_SceneGISPlanarAnchorVisualizer",
  "_SceneGISPlanarModelVisualizer",
  "_SceneGISPlanarPolylineVisualizer",
  "_SceneGISPlanarPolygonVisualizer",
  "_SceneGISPlanarPrimitiveOwner",
  "_SceneGISPlanarEntityTransform",
  "_SceneGISPlanarSolidVisualizer",
  "_SceneGISPlanarAreaVisualizer",
  "_SceneGISPlanarRouteVisualizer",
  "_SceneGISPlanarPathSampler",
  "_SceneGISPlanarPathVisualizer",
  "_SceneGISPlanarGroundBounds",
  "_SceneGISPlanarGroundCommands",
  "_SceneGISPlanarGroundLineShader",
  "_SceneGISPlanarGroundVolume",
  "_SceneGISPlanarVisualizersCallback",
  "_SceneGISPlanarTerrainWorkerScheduler",
  "_SceneGISPlanarTerrainWorkerTasks",
  "_SceneGISPlanarCelestialBodyRenderer",
  "_SceneGISPlanarAtmosphereRenderer",
  "_SceneGISPlanarEntityTracker",
  "_SceneGISPlanarSceneApi",
];
const softPrivateWidgetSymbols = ["_SceneGISPlanarViewerBootstrap"];
const privateContentFiles = [
  "package/Source/SceneGIS/Scene/_private/_SceneGISPlanarClipping.js",
  "package/Source/SceneGIS/Scene/_private/_SceneGISEnvironmentEffectsRenderer.js",
  "package/Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js",
  "package/Source/SceneGIS/Scene/_private/_SceneGISPlanarCameraFlight.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarEntityFraming.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPositionResolver.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarAnchorVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarModelVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolylineVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPolygonVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPrimitiveOwner.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarEntityTransform.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarSolidVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarAreaVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarRouteVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPathSampler.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarPathVisualizer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarGroundBounds.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarVisualizersCallback.js",
  "package/Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundCommands.js",
  "package/Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundLineShader.js",
  "package/Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundVolume.js",
  "package/Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerScheduler.js",
  "package/Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerTasks.js",
  "package/Source/SceneGIS/Scene/_private/_SceneGISPlanarCelestialBodyRenderer.js",
  "package/Source/SceneGIS/Scene/_private/_SceneGISPlanarAtmosphereRenderer.js",
  "package/Source/SceneGIS/DataSources/_private/_SceneGISPlanarEntityTracker.js",
  "package/Source/SceneGIS/Scene/_private/_SceneGISPlanarSceneApi.js",
];
const privateWidgetFiles = [
  "package/Source/SceneGIS/_SceneGISPlanarViewerBootstrap.js",
];
const terrainWorkerSource =
  "package/Source/Workers/SceneGISPlanarTerrainWorker.js";
const terrainWorkerBuild =
  "package/Build/Workers/SceneGISPlanarTerrainWorker.js";
const terrainWorkerRelease =
  "package/Build/Cesium/Workers/SceneGISPlanarTerrainWorker.js";
const sceneGISShaderSources = [
  "EnvironmentEffects/SceneGISBrunetonAtmosphere",
  "EnvironmentEffects/SceneGISBrunetonCommon",
  "EnvironmentEffects/SceneGISBrunetonDefinitions",
  "EnvironmentEffects/SceneGISBrunetonRuntime",
  "EnvironmentEffects/SceneGISCloudShadowFS",
  "EnvironmentEffects/SceneGISCloudShadows",
  "EnvironmentEffects/SceneGISEnvironmentEffectsAerialFS",
  "EnvironmentEffects/SceneGISEnvironmentEffectsBackgroundFS",
  "EnvironmentEffects/SceneGISEnvironmentEffectsBloomBlurFS",
  "EnvironmentEffects/SceneGISEnvironmentEffectsBloomCompositeFS",
  "EnvironmentEffects/SceneGISEnvironmentEffectsBloomThresholdFS",
  "EnvironmentEffects/SceneGISEnvironmentEffectsCloudFS",
  "EnvironmentEffects/SceneGISEnvironmentEffectsCloudResolveFS",
  "EnvironmentEffects/SceneGISEnvironmentEffectsVS",
  "EnvironmentEffects/SceneGISExponentialHeightFog",
  "EnvironmentEffects/SceneGISGlobeSurfaceLighting",
  "EnvironmentEffects/SceneGISVolumetricClouds",
  "PlanarGround/SceneGISPlanarGroundAreaFS",
  "PlanarGround/SceneGISPlanarGroundAreaVS",
  "PlanarGround/SceneGISPlanarGroundLineFS",
  "PlanarGround/SceneGISPlanarGroundLineVS",
  "PlanarSurface/SceneGISPlanarClippingFS",
  "PlanarSurface/SceneGISPlanarSurfaceFS",
  "PlanarSurface/SceneGISPlanarSurfaceGeometricLitVS",
  "PlanarSurface/SceneGISPlanarSurfaceSmoothLitVS",
  "PlanarSurface/SceneGISPlanarSurfaceUnlitVS",
  "PlanarEnvironment/SceneGISPlanarCelestialBodyFS",
  "PlanarEnvironment/SceneGISPlanarCelestialBodyVS",
  "PlanarEnvironment/SceneGISPlanarAtmosphereFS",
  "PlanarEnvironment/SceneGISPlanarAtmosphereVS",
];
const sceneGISShaderArchiveEntries = sceneGISShaderSources.flatMap((shader) =>
  ["glsl", "js"].map(
    (extension) => `package/Source/Shaders/SceneGIS/${shader}.${extension}`,
  ),
);
const brunetonFiles = {
  "transmittance.bin": [
    131072,
    "A2A0DD1464048D92E7BFDF385A9108E8D9C3E2748684F1F64523587D5894180A",
  ],
  "scattering.bin": [
    8388608,
    "82C505FE6E3B7F1995C650CC8A1478F42BD510029BF63845E9485C078AEF6617",
  ],
  "irradiance.bin": [
    8192,
    "126BD4FF0419E04C877639CAF9E3CD64A139AE511CF315A23A0C989FC47B51A5",
  ],
  "LICENSE.txt": [
    4239,
    "32F7B6D5E239CA7B8E5662932940BB81DE592FE4DC6B179A029AB267C22CEF7B",
  ],
};
const planarEarthFiles = {
  "transmittance.bin": [
    131072,
    "5CD60C76237A4C6DC20CEB54BE1726C325A6898CD1B114E69FC3496A1A9FF851",
  ],
  "scattering.bin": [
    8388608,
    "22C9240FDCF528521A74798816757D970647C6E3038322A587DABFF01A991135",
  ],
  "irradiance.bin": [
    8192,
    "B2B231213F25C9DE45F2DBBAAFFE1DCD4805398724CE6FE05D391D5E50613A6C",
  ],
  "LICENSE.txt": [
    4239,
    "32F7B6D5E239CA7B8E5662932940BB81DE592FE4DC6B179A029AB267C22CEF7B",
  ],
};
const brunetonSourceArchiveRoot =
  "package/Source/Assets/SceneGIS/Environment/BrunetonEarth";
const brunetonReleaseArchiveRoot =
  "package/Build/Cesium/Assets/SceneGIS/Environment/BrunetonEarth";
const planarEarthSourceArchiveRoot =
  "package/Source/Assets/SceneGIS/Environment/PlanarEarth";
const planarEarthReleaseArchiveRoot =
  "package/Build/Cesium/Assets/SceneGIS/Environment/PlanarEarth";
const cloudCoreArchiveFiles = [
  "shape.bin",
  "detail.bin",
  "weather.bin",
  "turbulence.bin",
  "stbn.bin",
  "PROVENANCE.json",
  "globe-shape.bin",
  "globe-detail.bin",
  "globe-weather.bin",
  "globe-turbulence.bin",
  "globe-stbn.bin",
  "GLOBE_REFERENCE_PROVENANCE.json",
  "THIRD_PARTY_LICENSE_three-geospatial.txt",
];
const cloudCoreSourceArchiveRoot =
  "package/Source/Assets/SceneGIS/Environment/CloudCore";
const cloudCoreReleaseArchiveRoot =
  "package/Build/Cesium/Assets/SceneGIS/Environment/CloudCore";
const moonArchiveFiles = [
  "color_large.webp",
  "PROVENANCE.json",
  "NASA_NOTICE.txt",
  "THIRD_PARTY_LICENSE.txt",
];
const moonSourceArchiveRoot = "package/Source/Assets/SceneGIS/Environment/Moon";
const moonReleaseArchiveRoot =
  "package/Build/Cesium/Assets/SceneGIS/Environment/Moon";

function brunetonArchiveEntries(root) {
  return [...Object.keys(brunetonFiles), "provenance.json"].map(
    (name) => `${root}/${name}`,
  );
}

function planarEarthArchiveEntries(root) {
  return [...Object.keys(planarEarthFiles), "provenance.json"].map(
    (name) => `${root}/${name}`,
  );
}

function cloudCoreArchiveEntries(root) {
  return cloudCoreArchiveFiles.map((name) => `${root}/${name}`);
}

function moonArchiveEntries(root) {
  return moonArchiveFiles.map((name) => `${root}/${name}`);
}

function verifyBrunetonDelivery(root) {
  for (const [name, [expectedBytes, expectedHash]] of Object.entries(
    brunetonFiles,
  )) {
    const file = path.join(root, name);
    const contents = fs.readFileSync(file);
    assert.equal(contents.byteLength, expectedBytes, name);
    assert.equal(
      createHash("sha256").update(contents).digest("hex").toUpperCase(),
      expectedHash,
      name,
    );
  }
  const provenance = JSON.parse(
    fs.readFileSync(path.join(root, "provenance.json"), "utf8"),
  );
  assert.equal(
    provenance.source.commit,
    "9c6dfd0054f077f3ad4695b802e74d4c6a814440",
  );
  assert.equal(provenance.format.pixelDatatype, "HALF_FLOAT");
  assert.equal(
    provenance.format.textures.scattering.combinedSingleMieRedInAlpha,
    true,
  );
}

function verifyPlanarEarthDelivery(root) {
  for (const [name, [expectedBytes, expectedHash]] of Object.entries(
    planarEarthFiles,
  )) {
    const file = path.join(root, name);
    const contents = fs.readFileSync(file);
    assert.equal(contents.byteLength, expectedBytes, name);
    assert.equal(
      createHash("sha256").update(contents).digest("hex").toUpperCase(),
      expectedHash,
      name,
    );
  }
  const provenance = JSON.parse(
    fs.readFileSync(path.join(root, "provenance.json"), "utf8"),
  );
  assert.equal(provenance.preset, "earth-flat-precomputed-v1");
  assert.equal(provenance.generator.version, "scene-gis-flat-atmosphere-3");
  assert.deepEqual(provenance.transport.multipleScatteringOrders, [2, 3, 4]);
  assert.match(provenance.transport.boundaryEvaluation, /true slab boundary/);
  assert.match(provenance.transport.segmentTransmittance, /runtime analytic/);
  assert.match(provenance.transport.groundBoundary, /cosine-weighted/);
  assert.equal(provenance.format.pixelDatatype, "HALF_FLOAT");
  assert.equal(
    provenance.format.textures.scattering.dimensions.join("x"),
    "256x128x32",
  );
}

function verifyCloudCoreDelivery(root) {
  const provenance = JSON.parse(
    fs.readFileSync(path.join(root, "PROVENANCE.json"), "utf8"),
  );
  assert.equal(provenance.generatorVersion, 4);
  assert.equal(provenance.seed, "0x4A17C9E3");
  assert.equal(provenance.copiedBinaries, 0);
  assert.equal(provenance.copiedSource, 0);
  assert.equal(provenance.totalBinaryBytes, 11796480);
  assert.deepEqual(
    provenance.files.map(({ name, format, dimensions, bytes, sha256 }) => ({
      name,
      format,
      dimensions,
      bytes,
      sha256,
    })),
    [
      {
        name: "shape.bin",
        format: "RGBA8",
        dimensions: [128, 128, 128],
        bytes: 8388608,
        sha256:
          "E6D6C471B1753E13FE0C669BB06E3D541C1CD88D66D1452941DE7EC6C7749EC2",
      },
      {
        name: "detail.bin",
        format: "RGBA8",
        dimensions: [64, 64, 64],
        bytes: 1048576,
        sha256:
          "D09AA6508C0EB571A9F33E801B2AF2F288929F754633812699330AB51C29CE7B",
      },
      {
        name: "weather.bin",
        format: "RGBA8",
        dimensions: [256, 256],
        bytes: 262144,
        sha256:
          "122ABD03DD698878EEE0983E8F3441487FCE6EBECE850332A6E18F16BB8F0B88",
      },
      {
        name: "turbulence.bin",
        format: "RGBA8",
        dimensions: [64, 64, 64],
        bytes: 1048576,
        sha256:
          "C8F66FA83474EDE878D76EC2BBF4ABDF0F3EC47A26F710FAB8A9D01BD054B8E8",
      },
      {
        name: "stbn.bin",
        format: "R8",
        dimensions: [128, 128, 64],
        bytes: 1048576,
        sha256:
          "B16C8B017D8435B38F7041F7447D6C52D29E477F978242E97DCDC0987C4A71AE",
      },
    ],
  );
  for (const file of provenance.files) {
    const contents = fs.readFileSync(path.join(root, file.name));
    assert.equal(contents.byteLength, file.bytes, file.name);
    assert.equal(
      createHash("sha256").update(contents).digest("hex").toUpperCase(),
      file.sha256,
      file.name,
    );
  }

  const globeProvenance = JSON.parse(
    fs.readFileSync(path.join(root, "GLOBE_REFERENCE_PROVENANCE.json"), "utf8"),
  );
  assert.equal(globeProvenance.schemaVersion, 1);
  assert.equal(
    globeProvenance.source.commit,
    "b012ad06d858fc035d88aacfd73f092f93c994e4",
  );
  assert.equal(globeProvenance.source.license, "MIT");
  assert.deepEqual(globeProvenance.source.files, [
    {
      name: "shape.bin",
      path: "packages/clouds/assets/shape.bin",
      sha256:
        "EF65CF6156894720C00BF572C49E3E254F8899C4B5158246E5A35A1922E2519C",
    },
    {
      name: "shape_detail.bin",
      path: "packages/clouds/assets/shape_detail.bin",
      sha256:
        "C09112199C6E0281B74FF5283C11C2943AE082650B9B67978CF5D59ED2956E4F",
    },
    {
      name: "local_weather.png",
      path: "packages/clouds/assets/local_weather.png",
      sha256:
        "B84DAEF855DC5EEBCC9B174FE832BA75A98E44B846DDE201BCE354417CC08031",
    },
    {
      name: "turbulence.png",
      path: "packages/clouds/assets/turbulence.png",
      sha256:
        "EC2B1B0AF4A6A6104102B21E58BEB300B0A3D334C0281D84FDE8C91D322910F9",
    },
    {
      name: "stbn.bin",
      path: "packages/core/assets/stbn.bin",
      sha256:
        "51F52F21E5578384585050390821A0A486DCB81E11A716FA7B92FBB6515BA852",
    },
  ]);
  assert.equal(globeProvenance.totalBinaryBytes, 4292608);
  assert.deepEqual(
    globeProvenance.outputs.map(
      ({ name, source, format, dimensions, bytes, sha256 }) => ({
        name,
        source,
        format,
        dimensions,
        bytes,
        sha256,
      }),
    ),
    [
      {
        name: "globe-shape.bin",
        source: "shape.bin",
        format: "R8",
        dimensions: [128, 128, 128],
        bytes: 2097152,
        sha256:
          "EF65CF6156894720C00BF572C49E3E254F8899C4B5158246E5A35A1922E2519C",
      },
      {
        name: "globe-detail.bin",
        source: "shape_detail.bin",
        format: "R8",
        dimensions: [32, 32, 32],
        bytes: 32768,
        sha256:
          "C09112199C6E0281B74FF5283C11C2943AE082650B9B67978CF5D59ED2956E4F",
      },
      {
        name: "globe-weather.bin",
        source: "local_weather.png",
        format: "RGBA8",
        dimensions: [512, 512],
        bytes: 1048576,
        sha256:
          "BB590A69028389A1AE9B0861D5BF322194B5D94CE3D379034AD983C86E97A4AD",
      },
      {
        name: "globe-turbulence.bin",
        source: "turbulence.png",
        format: "RGBA8",
        dimensions: [128, 128],
        bytes: 65536,
        sha256:
          "4D2DB2189CDB43B4CF22B12969B1BE529140DA6A7A84D8B5633656A877390051",
      },
      {
        name: "globe-stbn.bin",
        source: "stbn.bin",
        format: "R8",
        dimensions: [128, 128, 64],
        bytes: 1048576,
        sha256:
          "51F52F21E5578384585050390821A0A486DCB81E11A716FA7B92FBB6515BA852",
      },
    ],
  );
  for (const file of globeProvenance.outputs) {
    const contents = fs.readFileSync(path.join(root, file.name));
    assert.equal(contents.byteLength, file.bytes, file.name);
    assert.equal(
      createHash("sha256").update(contents).digest("hex").toUpperCase(),
      file.sha256,
      file.name,
    );
  }
  const globeLicense = fs.readFileSync(
    path.join(root, "THIRD_PARTY_LICENSE_three-geospatial.txt"),
    "utf8",
  );
  assert.match(globeLicense, /The MIT License \(MIT\)/u);
  assert.match(globeLicense, /Copyright \(c\) 2024 Shota Matsuda/u);
}

function verifyMoonDelivery(root) {
  const payload = fs.readFileSync(path.join(root, "color_large.webp"));
  assert.equal(payload.byteLength, 213446);
  assert.equal(
    createHash("sha256").update(payload).digest("hex").toUpperCase(),
    "1709BA3B65991842CD84A8D338EF46AD942241EE056B1AC8AAD0D3776EDF7DBD",
  );
  const provenance = JSON.parse(
    fs.readFileSync(path.join(root, "PROVENANCE.json"), "utf8"),
  );
  assert.equal(
    provenance.source.commit,
    "b012ad06d858fc035d88aacfd73f092f93c994e4",
  );
  assert.equal(
    provenance.source.path,
    "storybook-webgpu/assets/moon/color_large.webp",
  );
  assert.deepEqual(provenance.output.dimensions, [2048, 1024]);
  assert.equal(provenance.output.bytes, 213446);
  assert.equal(
    provenance.output.sha256,
    "1709BA3B65991842CD84A8D338EF46AD942241EE056B1AC8AAD0D3776EDF7DBD",
  );
  assert.match(
    fs.readFileSync(path.join(root, "NASA_NOTICE.txt"), "utf8"),
    /NASA CGI Moon Kit/u,
  );
  assert.match(
    fs.readFileSync(path.join(root, "THIRD_PARTY_LICENSE.txt"), "utf8"),
    /Copyright \(c\) 2024 Shota Matsuda/u,
  );
}

function npmCommand(args) {
  if (process.platform === "win32") {
    return {
      command: process.execPath,
      args: [
        path.join(
          path.dirname(process.execPath),
          "node_modules/npm/bin/npm-cli.js",
        ),
        ...args,
      ],
    };
  }
  return { command: "npm", args };
}

function pack(packageDirectory) {
  const before = new Set(
    fs.readdirSync(temporaryRoot).filter((file) => file.endsWith(".tgz")),
  );
  const npm = npmCommand([
    "pack",
    path.resolve(repo, packageDirectory),
    "--json",
    "--ignore-scripts",
    "--pack-destination",
    temporaryRoot,
  ]);
  execFileSync(npm.command, npm.args, {
    cwd: temporaryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const archive = fs
    .readdirSync(temporaryRoot)
    .find((file) => file.endsWith(".tgz") && !before.has(file));
  assert.ok(archive, `npm pack output for ${packageDirectory}`);
  return path.join(temporaryRoot, archive);
}

function archiveEntries(archive) {
  return execFileSync("tar", ["-tf", archive], {
    encoding: "utf8",
  })
    .split(/\r?\n/u)
    .filter(Boolean);
}

function assertArchive(archive, required) {
  const entries = archiveEntries(archive);
  for (const file of required) {
    assert.ok(
      entries.includes(file),
      `${path.basename(archive)} contains ${file}`,
    );
  }
  assert.equal(
    entries.some(
      (file) =>
        file.endsWith(".tgz") ||
        file.includes("scenegis-package-smoke-") ||
        file.includes("node_modules/"),
    ),
    false,
    `${path.basename(archive)} excludes nested smoke/archive content`,
  );
}

function extract(archive, destination) {
  fs.mkdirSync(destination, { recursive: true });
  execFileSync(
    "tar",
    ["-xf", archive, "-C", destination, "--strip-components=1"],
    { cwd: temporaryRoot },
  );
}

function linkLocalDependencies(nodeModules) {
  const sourceRoot = path.join(repo, "node_modules");
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === ".bin") {
      continue;
    }
    if (entry.name.startsWith("@")) {
      const scopeTarget = path.join(nodeModules, entry.name);
      fs.mkdirSync(scopeTarget, { recursive: true });
      for (const scoped of fs.readdirSync(path.join(sourceRoot, entry.name), {
        withFileTypes: true,
      })) {
        if (
          entry.name === "@cesium" &&
          (scoped.name === "engine" || scoped.name === "widgets")
        ) {
          continue;
        }
        fs.symlinkSync(
          path.join(sourceRoot, entry.name, scoped.name),
          path.join(scopeTarget, scoped.name),
          "junction",
        );
      }
      continue;
    }
    fs.symlinkSync(
      path.join(sourceRoot, entry.name),
      path.join(nodeModules, entry.name),
      "junction",
    );
  }
}

function assertDeclarations(file, expected) {
  const declarations = fs.readFileSync(file, "utf8");
  for (const name of expected) {
    assert.match(
      declarations,
      new RegExp(
        name === "SceneGISPlanarTerrainSampler"
          ? `(?:namespace|const) ${name}\\b`
          : `(?:class|function|interface) ${name}\\b`,
        "u",
      ),
    );
  }
  for (const name of [...nonPublicSpellings, ...softPrivateContentSymbols]) {
    assert.doesNotMatch(declarations, new RegExp(`\\b${name}\\b`, "u"));
  }
  return declarations;
}

function runConsumer(file, expectSuccess = true) {
  const result = spawnSync(process.execPath, [file], {
    cwd: temporaryRoot,
    encoding: "utf8",
  });
  if (expectSuccess) {
    assert.equal(
      result.status,
      0,
      `${path.basename(file)}\n${result.stdout}\n${result.stderr}`,
    );
  } else {
    assert.notEqual(result.status, 0, "broken public entry must fail");
  }
}

function consumerSource(moduleSyntax) {
  const enginePublic = JSON.stringify([...publicEngine].sort());
  const engineCallable = JSON.stringify(callableEngine);
  const engineNamespaces = JSON.stringify(namespaceEngine);
  const widgetPublicNames = JSON.stringify([...publicWidgets].sort());
  const rootPublic = JSON.stringify([...publicEngine, ...publicWidgets].sort());
  const widgetPublic = JSON.stringify(publicWidgets);
  const privatePublicSpellings = JSON.stringify(nonPublicSpellings);
  const softPrivateSymbols = JSON.stringify(softPrivateContentSymbols);
  const softPrivateWidgets = JSON.stringify(softPrivateWidgetSymbols);
  if (moduleSyntax === "esm") {
    return `
import assert from "node:assert/strict";
import * as engine from "@cesium/engine";
import * as widgets from "@cesium/widgets";
import * as root from "cesium";
const publicSceneGIS = (module) => Object.keys(module).filter((name) => name.startsWith("SceneGIS") && !name.startsWith("_")).sort();
assert.equal(typeof widgets.Viewer, "function");
assert.equal(typeof root.Viewer, "function");
assert.deepEqual(publicSceneGIS(engine), ${enginePublic});
assert.deepEqual(publicSceneGIS(widgets), ${widgetPublicNames});
assert.deepEqual(publicSceneGIS(root), ${rootPublic});
for (const name of ${engineCallable}) assert.equal(typeof engine[name], "function", name);
for (const name of ${engineNamespaces}) assert.equal(typeof engine[name], "object", name);
for (const name of ${widgetPublic}) assert.equal(typeof widgets[name], "function", name);
for (const name of ${engineCallable}) assert.equal(typeof root[name], "function", name);
for (const name of ${engineNamespaces}) assert.equal(typeof root[name], "object", name);
for (const name of ${widgetPublic}) assert.equal(typeof root[name], "function", name);
for (const name of ${privatePublicSpellings}) {
  assert.equal(engine[name], undefined, name);
  assert.equal(widgets[name], undefined, name);
  assert.equal(root[name], undefined, name);
}
for (const name of ${softPrivateSymbols}) {
  assert.notEqual(engine[name], undefined, name);
  assert.notEqual(root[name], undefined, name);
}
for (const name of ${softPrivateWidgets}) {
  assert.notEqual(widgets[name], undefined, name);
  assert.notEqual(root[name], undefined, name);
}
const coordinateSystem = new engine.SceneGISPlanarCoordinateSystem({
  extent: new engine.SceneGISPlanarExtent({
    minimumX: -1,
    minimumY: -1,
    maximumX: 1,
    maximumY: 1,
  }),
});
const world = new engine.SceneGISPlanarWorld({
  coordinateSystem,
  maximumLevel: 0,
});
const globeEffects = new engine.SceneGISEnvironmentEffects({ mode: "globe" });
assert.equal(globeEffects.mode, "globe");
assert.equal(globeEffects.world, undefined);
assert.equal(globeEffects.enabled, false);
assert.equal(globeEffects.showAtmosphere, true);
assert.equal(globeEffects.showAerialPerspective, true);
assert.equal(globeEffects.showHeightFog, true);
assert.equal(globeEffects.backgroundRadianceScale, 4.0);
assert.equal(globeEffects.aerialRadianceScale, 1.0);
assert.equal(globeEffects.surfaceRadianceScale, 10.0);
assert.equal(globeEffects.heightFogDensity, 0.000008);
assert.equal(globeEffects.heightFogHeightFalloff, 0.0002);
assert.equal(globeEffects.heightFogBaseHeight, 0.0);
assert.equal(globeEffects.heightFogStartDistance, 250.0);
assert.equal(globeEffects.heightFogMaximumOpacity, 0.7);
assert.equal(globeEffects.heightFogInscatteringScale, 0.35);
assert.equal(globeEffects.heightFogDirectionalInscatteringScale, 0.15);
assert.equal(globeEffects.heightFogDirectionalInscatteringExponent, 8.0);
assert.equal(globeEffects.showClouds, true);
assert.equal(globeEffects.showCloudShadows, true);
assert.equal(globeEffects.showCrepuscularRays, true);
assert.equal(globeEffects.showBloom, true);
assert.equal(globeEffects.showLensFlare, true);
assert.equal(globeEffects.showMoonlight, true);
assert.equal(globeEffects.showMoonShadows, true);
assert.equal(globeEffects.moonlightIntensity, 1.0);
assert.equal(globeEffects.bloomThreshold, 10.0);
assert.equal(globeEffects.bloomIntensity, 0.05);
assert.equal(globeEffects.lensFlareIntensity, 5.0);
assert.equal(globeEffects.cloudQuality, "high");
assert.equal(globeEffects.cloudPreset, "cumulus");
assert.equal(globeEffects.cloudCoverage, 0.3);
assert.equal(globeEffects.cloudDensity, 1.0);
assert.equal(globeEffects.cloudBaseHeight, 750.0);
assert.equal(globeEffects.cloudThickness, 4500.0);
assert.equal(globeEffects.cloudWindDirection, 0.785398);
assert.equal(globeEffects.cloudWindSpeed, 20.0);
assert.equal(globeEffects.cloudTime, 0.0);
assert.equal(globeEffects.cloudRadianceScale, 1.0);
assert.equal("radianceScale" in globeEffects, false);
globeEffects.backgroundRadianceScale = 2.0;
globeEffects.aerialRadianceScale = 0.5;
globeEffects.surfaceRadianceScale = 4.0;
globeEffects.showHeightFog = false;
globeEffects.heightFogDensity = 0.0001;
globeEffects.heightFogHeightFalloff = 0.0;
globeEffects.heightFogBaseHeight = 100.0;
globeEffects.heightFogStartDistance = 500.0;
globeEffects.heightFogMaximumOpacity = 0.5;
globeEffects.heightFogInscatteringScale = 0.7;
globeEffects.heightFogDirectionalInscatteringScale = 0.3;
globeEffects.heightFogDirectionalInscatteringExponent = 16.0;
globeEffects.showClouds = false;
globeEffects.showCloudShadows = false;
globeEffects.showCrepuscularRays = false;
globeEffects.showBloom = false;
globeEffects.showLensFlare = false;
globeEffects.showMoonlight = false;
globeEffects.showMoonShadows = false;
globeEffects.moonlightIntensity = 2.0;
globeEffects.bloomThreshold = 12.0;
globeEffects.bloomIntensity = 0.1;
globeEffects.lensFlareIntensity = 2.0;
globeEffects.cloudQuality = "high";
globeEffects.cloudPreset = "mixed";
globeEffects.cloudCoverage = 0.6;
globeEffects.cloudDensity = 0.002;
globeEffects.cloudBaseHeight = 2000.0;
globeEffects.cloudThickness = 6000.0;
globeEffects.cloudWindDirection = 1.0;
globeEffects.cloudWindSpeed = 40.0;
globeEffects.cloudTime = 120.0;
globeEffects.cloudRadianceScale = 2.0;
assert.equal(globeEffects.backgroundRadianceScale, 2.0);
assert.equal(globeEffects.aerialRadianceScale, 0.5);
assert.equal(globeEffects.surfaceRadianceScale, 4.0);
assert.equal(globeEffects.showHeightFog, false);
assert.equal(globeEffects.heightFogDensity, 0.0001);
assert.equal(globeEffects.heightFogHeightFalloff, 0.0);
assert.equal(globeEffects.heightFogBaseHeight, 100.0);
assert.equal(globeEffects.heightFogStartDistance, 500.0);
assert.equal(globeEffects.heightFogMaximumOpacity, 0.5);
assert.equal(globeEffects.heightFogInscatteringScale, 0.7);
assert.equal(globeEffects.heightFogDirectionalInscatteringScale, 0.3);
assert.equal(globeEffects.heightFogDirectionalInscatteringExponent, 16.0);
assert.equal(globeEffects.showClouds, false);
assert.equal(globeEffects.showCloudShadows, false);
assert.equal(globeEffects.showCrepuscularRays, false);
assert.equal(globeEffects.showBloom, false);
assert.equal(globeEffects.showLensFlare, false);
assert.equal(globeEffects.showMoonlight, false);
assert.equal(globeEffects.showMoonShadows, false);
assert.equal(globeEffects.moonlightIntensity, 2.0);
assert.equal(globeEffects.bloomThreshold, 12.0);
assert.equal(globeEffects.bloomIntensity, 0.1);
assert.equal(globeEffects.lensFlareIntensity, 2.0);
assert.equal(globeEffects.cloudQuality, "high");
assert.equal(globeEffects.cloudPreset, "mixed");
assert.equal(globeEffects.cloudCoverage, 0.6);
assert.equal(globeEffects.cloudDensity, 0.002);
assert.equal(globeEffects.cloudBaseHeight, 2000.0);
assert.equal(globeEffects.cloudThickness, 6000.0);
assert.equal(globeEffects.cloudWindDirection, 1.0);
assert.equal(globeEffects.cloudWindSpeed, 40.0);
assert.equal(globeEffects.cloudTime, 120.0);
assert.equal(globeEffects.cloudRadianceScale, 2.0);
assert.equal(globeEffects.ready, false);
assert.equal(typeof globeEffects.errorEvent.addEventListener, "function");
const planarEffects = new engine.SceneGISEnvironmentEffects({
  mode: "planar",
  world,
});
assert.equal(planarEffects.mode, "planar");
assert.equal(planarEffects.world, world);
const provider = {
  tilingScheme: world.tilingScheme,
  minimumLevel: 0,
  maximumLevel: 0,
  tileWidth: 1,
  tileHeight: 1,
  hasAlphaChannel: true,
  errorEvent: new engine.Event(),
  credit: undefined,
  requestImage: () => undefined,
};
const layer = new engine.SceneGISPlanarImageryLayer(provider);
assert.equal(layer.brightness, 1);
assert.equal(layer.contrast, 1);
assert.equal(layer.hue, 0);
assert.equal(layer.saturation, 1);
assert.equal(layer.gamma, 1);
assert.equal(layer.colorToAlpha, undefined);
assert.equal(layer.colorToAlphaThreshold, 0.004);
layer.brightness = 0.5;
assert.equal(layer.brightness, 0.5);
const target = new engine.Color(0.1, 0.2, 0.3, 0.9);
layer.colorToAlpha = target;
target.red = 0.9;
assert.equal(layer.colorToAlpha.red, 0.1);
const returnedTarget = layer.colorToAlpha;
returnedTarget.green = 0.9;
assert.equal(layer.colorToAlpha.green, 0.2);
  layer.destroy();
  assert.equal(layer.isDestroyed(), true);
  const sunInput = new engine.Cartesian3(1, 2, 3);
  const moonInput = new engine.Cartesian3(-1, 1, 0.5);
  const environment = new engine.SceneGISPlanarEnvironment({
    world,
    sunDirection: sunInput,
    moonDirection: moonInput,
  });
  assert.equal(environment.world, world);
  assert.equal(environment.enabled, true);
  assert.equal(environment.directionMode, "manual");
  assert.equal(environment.originLongitude, undefined);
  assert.equal(environment.originLatitude, undefined);
  assert.equal(environment.sunIntensity, 2);
  assert.equal(environment.showSun, false);
  assert.equal(environment.showMoon, false);
  assert.equal(environment.sunPixelSize, 48);
  assert.equal(environment.moonPixelSize, 36);
  assert.equal(environment.showAtmosphere, false);
  assert.equal(environment.atmosphereIntensity, 1);
  assert.equal(environment.atmosphereFadeHeight, 1000000);
  assert.equal(environment.skyBox, undefined);
  const zenithColor = environment.atmosphereZenithColor;
  environment.atmosphereZenithColor = new engine.Color(0.2, 0.3, 0.4, 0.5);
  zenithColor.red = 99;
  assert.equal(environment.atmosphereZenithColor.red, 0.2);
  const skyFaces = {
    positiveX: { width: 1, height: 1 },
    negativeX: { width: 1, height: 1 },
    positiveY: { width: 1, height: 1 },
    negativeY: { width: 1, height: 1 },
    positiveZ: { width: 1, height: 1 },
    negativeZ: { width: 1, height: 1 },
  };
  const planarSkyBox = new engine.SceneGISPlanarSkyBox({ sources: skyFaces });
  assert.notEqual(planarSkyBox.sources, skyFaces);
  assert.equal(planarSkyBox.sources.positiveX, skyFaces.positiveX);
  assert.equal(Object.isFrozen(planarSkyBox.sources), true);
  environment.skyBox = planarSkyBox;
  assert.equal(environment.skyBox, planarSkyBox);
  const installedMoonColor = environment.moonColor;
  environment.moonColor = new engine.Color(0.5, 0.6, 0.7, 0.8);
  installedMoonColor.red = 0;
  assert.equal(environment.moonColor.red, 0.5);
  environment.showSun = true;
  environment.showMoon = true;
  assert.equal(environment.showSun, true);
  assert.equal(environment.showMoon, true);
  assert.equal(environment.light instanceof engine.DirectionalLight, true);
  assert.equal(environment.light.direction.x, -environment.sunDirection.x);
  sunInput.x = 99;
  moonInput.y = 99;
  assert.notEqual(environment.sunDirection.x, 99);
  assert.notEqual(environment.moonDirection.y, 99);
  const exposedSun = environment.sunDirection;
  exposedSun.z = 99;
  assert.notEqual(environment.sunDirection.z, 99);
  const exposedEffectiveSun = environment.effectiveSunDirection;
  exposedEffectiveSun.z = 99;
  assert.notEqual(environment.effectiveSunDirection.z, 99);
  environment.originLongitude = 0;
  environment.originLatitude = 0;
  environment.directionMode = "astronomical";
  const astronomicalScene = {
    world,
    mode: engine.SceneMode.SCENE3D,
    light: new engine.DirectionalLight({ direction: engine.Cartesian3.UNIT_Z }),
    requestRender() {},
    isDestroyed: () => false,
  };
  const sunColor = new engine.Color(0.25, 0.5, 0.75, 1);
  environment.sunColor = sunColor;
  sunColor.red = 99;
  assert.equal(environment.sunColor.red, 0.25);
  environment.sunIntensity = 3;
  assert.equal(environment.light.intensity, 3);
  const hostElement = {};
  environment.connectedCallback(hostElement);
  assert.equal(world.environment, environment);
  environment.firstUpdate(
    astronomicalScene,
    engine.JulianDate.fromIso8601("2026-03-20T12:00:00Z"),
  );
  assert.equal(environment.effectiveSunDirection.z > 0.99, true);
  assert.equal(environment.effectiveMoonDirection.z > 0.9, true);
  assert.equal(
    environment.light.direction.x,
    -environment.effectiveSunDirection.x,
  );
  const material = new engine.Material({
  fabric: {
    type: "SceneGISInstalledOwnershipProbe",
    source: "czm_material czm_getMaterial(czm_materialInput materialInput) { return czm_getDefaultMaterial(materialInput); }",
  },
});
world.material = material;
assert.equal(world.material, material);
world.material = undefined;
assert.equal(world.material, undefined);
assert.equal(material.isDestroyed(), false);
world.material = material;
assert.equal(world.material, material);
  world.destroy();
  assert.equal(material.isDestroyed(), false);
  assert.equal(planarSkyBox.isDestroyed(), false);
  assert.equal(environment.light instanceof engine.DirectionalLight, true);
  environment.disconnectedCallback(hostElement);
  material.destroy();
  planarSkyBox.destroy();
  assert.equal(material.isDestroyed(), true);
  assert.equal(planarSkyBox.isDestroyed(), true);
`;
  }
  return `
const assert = require("node:assert/strict");
const root = require("cesium");
const publicSceneGIS = Object.keys(root).filter((name) => name.startsWith("SceneGIS") && !name.startsWith("_")).sort();
assert.equal(typeof root.Viewer, "function");
assert.deepEqual(publicSceneGIS, ${rootPublic});
for (const name of ${engineCallable}) assert.equal(typeof root[name], "function", name);
for (const name of ${engineNamespaces}) assert.equal(typeof root[name], "object", name);
for (const name of ${widgetPublic}) assert.equal(typeof root[name], "function", name);
for (const name of ${privatePublicSpellings}) assert.equal(root[name], undefined, name);
for (const name of ${softPrivateSymbols}) assert.notEqual(root[name], undefined, name);
for (const name of ${softPrivateWidgets}) assert.notEqual(root[name], undefined, name);
const effects = new root.SceneGISEnvironmentEffects({ mode: "globe" });
assert.equal(effects.mode, "globe");
assert.equal(effects.enabled, false);
assert.equal(effects.backgroundRadianceScale, 4.0);
assert.equal(effects.aerialRadianceScale, 1.0);
assert.equal(effects.surfaceRadianceScale, 10.0);
assert.equal(effects.showHeightFog, true);
assert.equal(effects.heightFogDensity, 0.000008);
assert.equal(effects.heightFogHeightFalloff, 0.0002);
assert.equal(effects.heightFogBaseHeight, 0.0);
assert.equal(effects.heightFogStartDistance, 250.0);
assert.equal(effects.heightFogMaximumOpacity, 0.7);
assert.equal(effects.heightFogInscatteringScale, 0.35);
assert.equal(effects.heightFogDirectionalInscatteringScale, 0.15);
assert.equal(effects.heightFogDirectionalInscatteringExponent, 8.0);
assert.equal(effects.showClouds, true);
assert.equal(effects.showCloudShadows, true);
assert.equal(effects.showCrepuscularRays, true);
assert.equal(effects.showBloom, true);
assert.equal(effects.showLensFlare, true);
assert.equal(effects.showMoonlight, true);
assert.equal(effects.showMoonShadows, true);
assert.equal(effects.moonlightIntensity, 1.0);
assert.equal(effects.bloomThreshold, 10.0);
assert.equal(effects.bloomIntensity, 0.05);
assert.equal(effects.lensFlareIntensity, 5.0);
assert.equal(effects.cloudQuality, "high");
assert.equal(effects.cloudPreset, "cumulus");
assert.equal(effects.cloudCoverage, 0.3);
assert.equal(effects.cloudDensity, 1.0);
assert.equal(effects.cloudBaseHeight, 750.0);
assert.equal(effects.cloudThickness, 4500.0);
assert.equal(effects.cloudWindDirection, 0.785398);
assert.equal(effects.cloudWindSpeed, 20.0);
assert.equal(effects.cloudTime, 0.0);
assert.equal(effects.cloudRadianceScale, 1.0);
assert.equal("radianceScale" in effects, false);
effects.backgroundRadianceScale = 2.0;
effects.aerialRadianceScale = 0.5;
effects.surfaceRadianceScale = 4.0;
effects.cloudQuality = "low";
effects.cloudPreset = "cirrus";
effects.cloudTime = 1.0;
assert.equal(effects.backgroundRadianceScale, 2.0);
assert.equal(effects.aerialRadianceScale, 0.5);
assert.equal(effects.surfaceRadianceScale, 4.0);
assert.equal(effects.cloudQuality, "low");
assert.equal(effects.cloudPreset, "cirrus");
assert.equal(effects.cloudTime, 1.0);
assert.equal(effects.ready, false);
`;
}

function verifyDocumentation(engineDirectory) {
  const documentation = path.join(repo, "Build/Documentation");
  for (const name of [...publicEngine, ...publicWidgets]) {
    assert.equal(
      fs.existsSync(path.join(documentation, `${name}.html`)),
      true,
      `${name} API documentation`,
    );
  }
  for (const name of [...nonPublicSpellings, ...softPrivateContentSymbols]) {
    assert.equal(
      fs.existsSync(path.join(documentation, `${name}.html`)),
      false,
    );
  }
  const effectsDocumentation = fs.readFileSync(
    path.join(documentation, "SceneGISEnvironmentEffects.html"),
    "utf8",
  );
  assert.match(
    effectsDocumentation,
    /<h4 class="name"\s+id="backgroundRadianceScale">/u,
  );
  assert.match(
    effectsDocumentation,
    /<h4 class="name"\s+id="aerialRadianceScale">/u,
  );
  for (const property of [
    "showHeightFog",
    "heightFogDensity",
    "heightFogHeightFalloff",
    "heightFogBaseHeight",
    "heightFogStartDistance",
    "heightFogMaximumOpacity",
    "heightFogInscatteringScale",
    "heightFogDirectionalInscatteringScale",
    "heightFogDirectionalInscatteringExponent",
    "showClouds",
    "cloudQuality",
    "cloudPreset",
    "cloudCoverage",
    "cloudDensity",
    "cloudBaseHeight",
    "cloudThickness",
    "cloudWindDirection",
    "cloudWindSpeed",
    "cloudTime",
    "cloudRadianceScale",
  ]) {
    assert.match(
      effectsDocumentation,
      new RegExp(`<h4 class="name"\\s+id="${property}">`, "u"),
    );
  }
  assert.doesNotMatch(
    effectsDocumentation,
    /<h4 class="name"\s+id="radianceScale">/u,
  );
  const viewerDocumentation = fs.readFileSync(
    path.join(documentation, "Viewer.html"),
    "utf8",
  );
  assert.match(viewerDocumentation, /<h4 class="name"\s+id="planarWorld">/u);
  assert.match(viewerDocumentation, /Viewer\.PlanarWorldOptions/u);
  assert.match(viewerDocumentation, /Viewer\.PlanarExtentOptions/u);
  assert.match(
    viewerDocumentation,
    /For a planar Viewer, the resolved target must be an Entity/u,
  );
  assert.match(viewerDocumentation, /supported planar profile/u);
  assert.match(viewerDocumentation, /<h4 class="name"\s+id="trackedEntity">/u);
  const cesiumWidgetDocumentation = fs.readFileSync(
    path.join(documentation, "CesiumWidget.html"),
    "utf8",
  );
  assert.match(
    cesiumWidgetDocumentation,
    /For a planar world, the resolved target must be an Entity/u,
  );
  assert.match(
    cesiumWidgetDocumentation,
    /<h4 class="name"\s+id="trackedEntity">/u,
  );
  const sceneDocumentation = fs.readFileSync(
    path.join(documentation, "Scene.html"),
    "utf8",
  );
  assert.match(
    sceneDocumentation,
    /sampleHeight is not supported with a non-Globe primary world/u,
  );
  assert.match(
    sceneDocumentation,
    /clampToHeightMostDetailed is not supported with a non-Globe primary world/u,
  );
  const cameraDocumentation = fs.readFileSync(
    path.join(documentation, "Camera.html"),
    "utf8",
  );
  assert.match(
    cameraDocumentation,
    /pickEllipsoid is not supported with a non-Globe primary world/u,
  );
  assert.match(
    cameraDocumentation,
    /computeViewRectangle is not supported with a non-Globe primary world/u,
  );
  const layerDocumentation = fs.readFileSync(
    path.join(documentation, "SceneGISPlanarImageryLayer.html"),
    "utf8",
  );
  for (const member of [
    "brightness",
    "contrast",
    "hue",
    "saturation",
    "gamma",
    "colorToAlpha",
    "colorToAlphaThreshold",
  ]) {
    assert.match(
      layerDocumentation,
      new RegExp(`<h4 class="name" id="${member}">`, "u"),
    );
  }
  const worldDocumentation = fs.readFileSync(
    path.join(documentation, "SceneGISPlanarWorld.html"),
    "utf8",
  );
  assert.match(worldDocumentation, /<h4 class="name" id="material">/u);
  assert.match(worldDocumentation, /<h4 class="name" id="environment">/u);
  const environmentDocumentation = fs.readFileSync(
    path.join(documentation, "SceneGISPlanarEnvironment.html"),
    "utf8",
  );
  for (const member of [
    "world",
    "light",
    "directionMode",
    "originLongitude",
    "originLatitude",
    "sunDirection",
    "moonDirection",
    "effectiveSunDirection",
    "effectiveMoonDirection",
    "sunColor",
    "sunIntensity",
    "showSun",
    "showMoon",
    "sunPixelSize",
    "moonPixelSize",
    "moonColor",
    "showAtmosphere",
    "atmosphereZenithColor",
    "atmosphereHorizonColor",
    "atmosphereIntensity",
    "atmosphereFadeHeight",
    "skyBox",
    "enabled",
  ]) {
    assert.match(
      environmentDocumentation,
      new RegExp(`<h4 class="name" id="${member}">`, "u"),
    );
  }
  const skyBoxDocumentation = fs.readFileSync(
    path.join(documentation, "SceneGISPlanarSkyBox.html"),
    "utf8",
  );
  for (const member of ["sources", "credit"]) {
    assert.match(
      skyBoxDocumentation,
      new RegExp(`<h4 class="name" id="${member}">`, "u"),
    );
  }
  for (const exceptionText of [
    "The direction mode is not",
    "An origin is not undefined or a finite value",
    "Astronomical mode does not define both origin longitude and origin latitude",
  ]) {
    assert.match(environmentDocumentation, new RegExp(exceptionText, "u"));
  }
  const environmentSource = fs.readFileSync(
    path.join(
      engineDirectory,
      "Source/SceneGIS/Scene/SceneGISPlanarEnvironment.js",
    ),
    "utf8",
  );
  for (const exceptionText of [
    'The assigned value is not <code>"manual"</code> or <code>"astronomical"</code>.',
    "Astronomical mode is selected without both origin longitude and origin latitude.",
    "The assigned value is neither undefined nor a finite number in <code>[-PI, PI]</code>.",
    "The assigned value is neither undefined nor a finite number in <code>[-PI/2, PI/2]</code>.",
    "The value is undefined while astronomical mode is active.",
  ]) {
    assert.ok(
      environmentSource.includes(exceptionText),
      `installed Environment source documents: ${exceptionText}`,
    );
  }
}

function classDeclaration(declarations, name) {
  const start = declarations.search(
    new RegExp(`^export class ${name}(?: implements [^{]+)? \\{`, "mu"),
  );
  assert.notEqual(start, -1, `${name} declaration start`);
  const nextClass = declarations.indexOf("\nexport class ", start + 1);
  return declarations.slice(start, nextClass === -1 ? undefined : nextClass);
}

function verifyStylingDeclarations(declarations) {
  const layer = classDeclaration(declarations, "SceneGISPlanarImageryLayer");
  for (const member of [
    "brightness",
    "contrast",
    "hue",
    "saturation",
    "gamma",
    "colorToAlphaThreshold",
  ]) {
    assert.match(layer, new RegExp(`\\n\\s*${member}: number;`, "u"));
  }
  assert.match(layer, /\n\s*colorToAlpha: Color \| undefined;/u);
  const world = classDeclaration(declarations, "SceneGISPlanarWorld");
  assert.match(world, /\n\s*material: Material \| undefined;/u);
  assert.match(
    world,
    /\n\s*clippingPlanes: ClippingPlaneCollection \| undefined;/u,
  );
  assert.match(
    world,
    /\n\s*clippingPolygons: ClippingPolygonCollection \| undefined;/u,
  );
  assert.match(
    world,
    /\n\s*readonly environment: SceneGISPlanarEnvironment \| undefined;/u,
  );
  const environment = classDeclaration(
    declarations,
    "SceneGISPlanarEnvironment",
  );
  assert.match(environment, /\n\s*readonly world: SceneGISPlanarWorld;/u);
  assert.match(environment, /\n\s*readonly light: DirectionalLight;/u);
  assert.match(environment, /\n\s*directionMode: "manual" \| "astronomical";/u);
  assert.match(environment, /\n\s*originLongitude: number \| undefined;/u);
  assert.match(environment, /\n\s*originLatitude: number \| undefined;/u);
  assert.match(environment, /\n\s*sunDirection: Cartesian3;/u);
  assert.match(environment, /\n\s*moonDirection: Cartesian3;/u);
  assert.match(
    environment,
    /\n\s*readonly effectiveSunDirection: Cartesian3;/u,
  );
  assert.match(
    environment,
    /\n\s*readonly effectiveMoonDirection: Cartesian3;/u,
  );
  assert.match(environment, /\n\s*sunColor: Color;/u);
  assert.match(environment, /\n\s*sunIntensity: number;/u);
  assert.match(environment, /\n\s*showSun: boolean;/u);
  assert.match(environment, /\n\s*showMoon: boolean;/u);
  assert.match(environment, /\n\s*sunPixelSize: number;/u);
  assert.match(environment, /\n\s*moonPixelSize: number;/u);
  assert.match(environment, /\n\s*moonColor: Color;/u);
  assert.match(environment, /\n\s*showAtmosphere: boolean;/u);
  assert.match(environment, /\n\s*atmosphereZenithColor: Color;/u);
  assert.match(environment, /\n\s*atmosphereHorizonColor: Color;/u);
  assert.match(environment, /\n\s*atmosphereIntensity: number;/u);
  assert.match(environment, /\n\s*atmosphereFadeHeight: number;/u);
  assert.match(environment, /\n\s*skyBox: SceneGISPlanarSkyBox \| undefined;/u);
  assert.match(environment, /\n\s*enabled: boolean;/u);
  const skyBox = classDeclaration(declarations, "SceneGISPlanarSkyBox");
  assert.match(skyBox, /\n\s*readonly sources: any;/u);
  assert.match(skyBox, /\n\s*readonly credit: Credit \| undefined;/u);
}

function verifyTrackingSources(engineDirectory, widgetsDirectory) {
  const cesiumWidgetSource = fs.readFileSync(
    path.join(engineDirectory, "Source/Widget/CesiumWidget.js"),
    "utf8",
  );
  assert.match(
    cesiumWidgetSource,
    /In a planar world, the value is not an Entity with a FIXED position/u,
  );
  const viewerSource = fs.readFileSync(
    path.join(widgetsDirectory, "Source/Viewer/Viewer.js"),
    "utf8",
  );
  assert.match(
    viewerSource,
    /In a planar Viewer, the value is not an Entity with a FIXED position/u,
  );
}

async function verify() {
  const engineArchive = pack("packages/engine");
  const widgetsArchive = pack("packages/widgets");
  const rootArchive = pack(".");
  assertArchive(engineArchive, [
    "package/index.js",
    "package/index.d.ts",
    "package/Source/Widget/CesiumWidget.js",
    "package/Source/SceneGIS/Scene/SceneGISEnvironmentEffects.js",
    terrainWorkerSource,
    terrainWorkerBuild,
    ...sceneGISShaderArchiveEntries,
    ...brunetonArchiveEntries(brunetonSourceArchiveRoot),
    ...planarEarthArchiveEntries(planarEarthSourceArchiveRoot),
    ...cloudCoreArchiveEntries(cloudCoreSourceArchiveRoot),
    ...moonArchiveEntries(moonSourceArchiveRoot),
    ...privateContentFiles,
  ]);
  assertArchive(widgetsArchive, [
    "package/index.js",
    "package/index.d.ts",
    "package/Source/Viewer/Viewer.js",
    ...privateWidgetFiles,
  ]);
  assertArchive(rootArchive, [
    "package/package.json",
    "package/Source/Cesium.js",
    "package/Source/Cesium.d.ts",
    "package/index.cjs",
    terrainWorkerRelease,
    ...brunetonArchiveEntries(brunetonReleaseArchiveRoot),
    ...planarEarthArchiveEntries(planarEarthReleaseArchiveRoot),
    ...cloudCoreArchiveEntries(cloudCoreReleaseArchiveRoot),
    ...moonArchiveEntries(moonReleaseArchiveRoot),
  ]);

  const nodeModules = path.join(temporaryRoot, "node_modules");
  fs.mkdirSync(nodeModules);
  linkLocalDependencies(nodeModules);
  const engineDirectory = path.join(nodeModules, "@cesium/engine");
  const widgetsDirectory = path.join(nodeModules, "@cesium/widgets");
  const rootDirectory = path.join(nodeModules, "cesium");
  extract(engineArchive, engineDirectory);
  extract(widgetsArchive, widgetsDirectory);
  extract(rootArchive, rootDirectory);
  verifyBrunetonDelivery(
    path.join(
      engineDirectory,
      "Source/Assets/SceneGIS/Environment/BrunetonEarth",
    ),
  );
  verifyPlanarEarthDelivery(
    path.join(
      engineDirectory,
      "Source/Assets/SceneGIS/Environment/PlanarEarth",
    ),
  );
  verifyCloudCoreDelivery(
    path.join(engineDirectory, "Source/Assets/SceneGIS/Environment/CloudCore"),
  );
  verifyMoonDelivery(
    path.join(engineDirectory, "Source/Assets/SceneGIS/Environment/Moon"),
  );
  verifyBrunetonDelivery(
    path.join(
      rootDirectory,
      "Build/Cesium/Assets/SceneGIS/Environment/BrunetonEarth",
    ),
  );
  verifyPlanarEarthDelivery(
    path.join(
      rootDirectory,
      "Build/Cesium/Assets/SceneGIS/Environment/PlanarEarth",
    ),
  );
  verifyCloudCoreDelivery(
    path.join(
      rootDirectory,
      "Build/Cesium/Assets/SceneGIS/Environment/CloudCore",
    ),
  );
  verifyMoonDelivery(
    path.join(rootDirectory, "Build/Cesium/Assets/SceneGIS/Environment/Moon"),
  );
  verifyTrackingSources(engineDirectory, widgetsDirectory);

  const esmConsumer = path.join(temporaryRoot, "consumer.mjs");
  const cjsConsumer = path.join(temporaryRoot, "consumer.cjs");
  fs.writeFileSync(esmConsumer, consumerSource("esm"));
  fs.writeFileSync(cjsConsumer, consumerSource("cjs"));
  runConsumer(esmConsumer);
  runConsumer(cjsConsumer);

  const engineDeclarations = assertDeclarations(
    path.join(engineDirectory, "index.d.ts"),
    publicEngine,
  );
  verifyStylingDeclarations(engineDeclarations);
  const widgetDeclarations = assertDeclarations(
    path.join(widgetsDirectory, "index.d.ts"),
    publicWidgets,
  );
  const rootDeclarations = assertDeclarations(
    path.join(rootDirectory, "Source/Cesium.d.ts"),
    [...publicEngine, ...publicWidgets],
  );
  for (const declarations of [engineDeclarations, rootDeclarations]) {
    assert.match(declarations, /backgroundRadianceScale\?: number;/u);
    assert.match(declarations, /backgroundRadianceScale: number;/u);
    assert.match(declarations, /aerialRadianceScale\?: number;/u);
    assert.match(declarations, /aerialRadianceScale: number;/u);
    assert.match(declarations, /showHeightFog\?: boolean;/u);
    assert.match(declarations, /showHeightFog: boolean;/u);
    assert.match(declarations, /showClouds\?: boolean;/u);
    assert.match(declarations, /showClouds: boolean;/u);
    assert.match(declarations, /showMoonlight\?: boolean;/u);
    assert.match(declarations, /showMoonlight: boolean;/u);
    assert.match(declarations, /showMoonShadows\?: boolean;/u);
    assert.match(declarations, /showMoonShadows: boolean;/u);
    assert.match(declarations, /moonlightIntensity\?: number;/u);
    assert.match(declarations, /moonlightIntensity: number;/u);
    assert.match(declarations, /cloudQuality\?: string;/u);
    assert.match(declarations, /cloudQuality: string;/u);
    assert.match(declarations, /cloudPreset\?: string;/u);
    assert.match(declarations, /cloudPreset: string;/u);
    for (const property of [
      "heightFogDensity",
      "heightFogHeightFalloff",
      "heightFogBaseHeight",
      "heightFogStartDistance",
      "heightFogMaximumOpacity",
      "heightFogInscatteringScale",
      "heightFogDirectionalInscatteringScale",
      "heightFogDirectionalInscatteringExponent",
    ]) {
      assert.match(declarations, new RegExp(`${property}\\?: number;`, "u"));
      assert.match(declarations, new RegExp(`${property}: number;`, "u"));
    }
    for (const property of [
      "cloudCoverage",
      "cloudDensity",
      "cloudBaseHeight",
      "cloudThickness",
      "cloudWindDirection",
      "cloudWindSpeed",
      "cloudTime",
      "cloudRadianceScale",
    ]) {
      assert.match(declarations, new RegExp(`${property}\\?: number;`, "u"));
      assert.match(declarations, new RegExp(`${property}: number;`, "u"));
    }
    assert.doesNotMatch(declarations, /\bradianceScale(?:\?|): number;/u);
  }
  verifyStylingDeclarations(rootDeclarations);
  for (const declarations of [widgetDeclarations, rootDeclarations]) {
    assert.match(declarations, /world\?: SceneGISPlanarWorld;/u);
    assert.match(declarations, /planarWorld\?: Viewer\.PlanarWorldOptions;/u);
    assert.match(declarations, /type PlanarExtentOptions = \{/u);
    assert.match(declarations, /type PlanarWorldOptions = \{/u);
    assert.match(
      declarations,
      /readonly planarWorld: SceneGISPlanarWorld \| undefined;/u,
    );
    assert.match(
      declarations,
      /readonly planarCameraController: SceneGISPlanarCameraController \| undefined;/u,
    );
  }
  verifyDocumentation(engineDirectory);

  const rootPackagePath = path.join(rootDirectory, "package.json");
  const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, "utf8"));
  rootPackage.exports["."].import = "./Source/MissingSceneGIS.js";
  fs.writeFileSync(rootPackagePath, JSON.stringify(rootPackage));
  runConsumer(esmConsumer, false);
  process.stdout.write(
    "SceneGIS installed delivery passed: 26/26 GLSL, 26/26 generated shader modules, exact Bruneton, PlanarEarth, generated CloudCore and pinned Globe/Moon reference assets/provenance in engine/root, bare ESM/CJS, A4R-A11 public runtime/types, existing SceneGIS runtime properties, private tar and soft-private delivery with public hiding, Viewer framing/tracking declarations and API, and broken-entry fixtures.\n",
  );
}

try {
  await verify();
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
