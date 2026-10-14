/* global document, window */
import * as C from "/Build/CesiumUnminified/index.js";

const byId = (id) => document.getElementById(id);
const mode =
  new window.URL(window.location.href).searchParams.get("world") ?? "planar";
const planar = mode === "planar";
byId("world").value = mode;
const planarWorld = planar
  ? new C.SceneGISPlanarWorld({
      coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
        crs: "EPSG:3857",
        extent: new C.SceneGISPlanarExtent({
          minimumX: -512,
          minimumY: -512,
          maximumX: 512,
          maximumY: 512,
        }),
      }),
      maximumLevel: 0,
      enableLighting: true,
    })
  : undefined;
const viewer = new C.Viewer("map", {
  world: planarWorld,
  baseLayer: planar ? undefined : false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  selectionIndicator: false,
  infoBox: false,
  scene3DOnly: true,
  skyBox: false,
  skyAtmosphere: false,
});
const scene = viewer.scene;
scene.rethrowRenderErrors = true;
scene.highDynamicRange = true;
scene.backgroundColor = C.Color.fromCssColorString("#142d42");
scene.postProcessStages.fxaa.enabled = false;
const world = scene.world;
world.baseColor = C.Color.fromCssColorString("#536776");
if (!planar) {
  world.depthTestAgainstTerrain = true;
}
const effects = scene.environmentEffects;
effects.enabled = false;
viewer.clock.shouldAnimate = false;
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-03-20T04:00:00Z");
const half = 20037508.342789244;
const scheme = planar
  ? world.tilingScheme
  : new C.SceneGISPlanarTilingScheme({
      coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
        crs: "EPSG:3857",
        extent: new C.SceneGISPlanarExtent({
          minimumX: -half,
          minimumY: -half,
          maximumX: half,
          maximumY: half,
        }),
      }),
    });
const level = planar ? 0 : 14;
const tileX = planar ? 0 : 8801;
const tileY = planar ? 0 : 5373;
const bounds = scheme.tileXYToExtent(tileX, tileY, level);
const center = new C.Cartesian3(
  (bounds.minimumX + bounds.maximumX) / 2,
  (bounds.minimumY + bounds.maximumY) / 2,
  0,
);
const projection = new C.WebMercatorProjection();
const cartographic = projection.unproject(center);
const origin = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude),
    );
const scale = planar ? 1 : Math.cos(cartographic.latitude);
const target = planar
  ? C.Cartesian3.ZERO
  : C.Cartesian3.fromRadians(cartographic.longitude, cartographic.latitude);
scene.camera.lookAt(target, new C.HeadingPitchRange(0, -0.85, 1050 * scale));
scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
scene.camera.frustum.near = 1;

function feature(id, type, points) {
  const coordinates = points.flatMap(([x, y]) => [
    2048 + (x / bounds.width) * 4096,
    2048 - (y / bounds.height) * 4096,
  ]);
  return {
    id,
    type,
    properties: { kind: id },
    geometry: {
      parts: [new Float64Array(coordinates)],
      polygonStarts: type === 3 ? new Uint32Array([0]) : new Uint32Array(),
    },
  };
}
function rectangle(id, x, y, width, height) {
  return feature(id, 3, [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
  ]);
}
const features = [
  rectangle("red", -240, -150, 420, 300),
  feature("circle", 1, [[-20, 20]]),
  rectangle("green", -70, -90, 220, 210),
  rectangle("pattern", -340, -140, 80, 280),
  rectangle("tower", 230, -60, 100, 120),
  feature("road", 2, [
    [-300, -190],
    [-100, -155],
    [120, -180],
    [320, -150],
  ]),
  feature("label", 1, [[-20, 190]]),
];
class LocalSource extends C.SceneGISVectorTileSource {
  requestTile(x, y) {
    return Promise.resolve({
      layers: [
        {
          name: "data",
          version: 2,
          extent: 4096,
          features: x === tileX && y === tileY ? features : [],
        },
      ],
    });
  }
}
const tileUrl = "/Test/vector-tiles/public-fixture.pbf?z={z}&x={x}&y={y}";
const source = new LocalSource({
  url: tileUrl,
  tilingScheme: scheme,
  minimumLevel: level,
  maximumLevel: level,
});
const background = scene.primitives.add(
  new C.SceneGISVectorTileLayer({
    scene,
    show: false,
    style: {
      version: 8,
      sources: {},
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#d89550", "background-opacity": 0.5 },
        },
      ],
    },
  }),
);
byId("background").addEventListener("change", () => {
  background.show = byId("background").checked;
  scene.requestRender();
});
const layer = scene.primitives.add(
  new C.SceneGISVectorTileLayer({
    scene,
    tilingScheme: scheme,
    sources: { local: source },
    style: {
      version: 8,
      glyphs:
        "/Test/vector-tiles/symbol-assets/{range}.pbf?fontstack={fontstack}",
      sprite: "/Test/vector-tiles/pattern-sprite",
      sources: {
        local: {
          type: "vector",
          tiles: [tileUrl],
          minzoom: level,
          maxzoom: level,
        },
      },
      layers: [
        {
          id: "red",
          type: "fill",
          paint: { "fill-color": "#f3403a", "fill-opacity": 0.65 },
        },
        {
          id: "circle",
          type: "circle",
          paint: {
            "circle-color": "#258eff",
            "circle-radius": 48,
            "circle-opacity": 0.7,
          },
        },
        {
          id: "green",
          type: "fill",
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "#ffe24a",
              "#49cf6a",
            ],
            "fill-opacity": 0.65,
          },
        },
        { id: "pattern", type: "fill", paint: { "fill-pattern": "grid" } },
        {
          id: "tower",
          type: "fill-extrusion",
          paint: {
            "fill-extrusion-color": "#f4ac48",
            "fill-extrusion-height": 130 * scale,
          },
        },
        {
          id: "road",
          type: "line",
          paint: { "line-color": "#fff3b0", "line-width": 12 },
        },
        {
          id: "label",
          type: "symbol",
          layout: {
            "text-field": "VECTOR",
            "text-size": 28,
            "text-allow-overlap": true,
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#142438",
            "text-halo-width": 2,
          },
        },
      ].map((item) => ({
        ...item,
        source: "local",
        "source-layer": "data",
        filter: ["==", ["get", "kind"], item.id],
      })),
    },
  }),
);
const errors = [];
layer.errorEvent.addEventListener((event) => {
  errors.push(event.error.message);
  byId("error").textContent = errors.join("\n");
});
const ssr = new C.SceneGISScreenSpaceReflections({ scene, enabled: false });
const water = scene.primitives.add(
  new C.SceneGISWaterSurface({
    show: false,
    polygonHierarchy: new C.PolygonHierarchy(
      [
        [-210, -130],
        [140, -130],
        [140, 110],
        [-210, 110],
      ].map(([x, y]) => new C.Cartesian3(x * scale, y * scale, 0)),
    ),
    modelMatrix: C.Matrix4.multiplyByTranslation(
      origin,
      new C.Cartesian3(0, 0, 45 * scale),
      new C.Matrix4(),
    ),
    waveAmplitude: 0,
    flowSpeed: 0,
    foamIntensity: 0,
  }),
);
byId("water").addEventListener("change", () => {
  water.show = byId("water").checked;
  scene.requestRender();
});
const ssil = new C.SceneGISScreenSpaceIndirectLighting({
  scene,
  enabled: false,
});
const light = new C.DirectionalLight({ direction: new C.Cartesian3(0, 0, -1) });
scene.light = light;
function updateLight() {
  const azimuth = C.Math.toRadians(Number(byId("azimuth").value));
  const local = C.Cartesian3.normalize(
    new C.Cartesian3(Math.sin(azimuth), Math.cos(azimuth), -0.6),
    new C.Cartesian3(),
  );
  C.Matrix4.multiplyByPointAsVector(origin, local, light.direction);
  scene.requestRender();
}
updateLight();
byId("azimuth").addEventListener("input", updateLight);
byId("physical").addEventListener("change", () => {
  effects.enabled = byId("physical").checked;
});
byId("world").addEventListener("change", () => {
  const url = new window.URL(window.location.href);
  url.searchParams.set("world", byId("world").value);
  window.location.href = url.href;
});
for (const id of ["surface", "opacity"]) {
  byId(id).addEventListener("input", () => {
    const value = Number(byId(id).value);
    byId(`${id}-value`).value = value;
    if (id === "opacity") {
      layer.opacity = value;
    } else if (planar) {
      world.opacity = value;
    } else {
      world.translucency.enabled = value < 1;
      world.translucency.frontFaceAlpha = value;
      world.translucency.backFaceAlpha = 0;
    }
    scene.requestRender();
  });
}
byId("selected").addEventListener("change", () =>
  layer.setFeatureState(
    { source: "local", sourceLayer: "data", id: "green" },
    { selected: byId("selected").checked },
  ),
);
byId("screens").addEventListener("change", () => {
  const enabled = byId("screens").checked;
  scene.postProcessStages.ambientOcclusion.enabled = enabled;
  ssr.enabled = ssil.enabled = enabled;
});
byId("hdr").addEventListener("change", () => {
  scene.highDynamicRange = byId("hdr").checked;
  byId("screens").disabled = !scene.highDynamicRange;
  if (!scene.highDynamicRange) {
    byId("screens").checked = false;
    scene.postProcessStages.ambientOcclusion.enabled = false;
    ssr.enabled = ssil.enabled = false;
  }
});
byId("frusta").addEventListener("change", () => {
  scene.logarithmicDepthBuffer = !byId("frusta").checked;
  scene.farToNearRatio = byId("frusta").checked ? 2 : 1000;
});
byId("terrain").addEventListener("change", () => {
  const enabled = byId("terrain").checked;
  if (!planar) {
    scene.terrainProvider = enabled
      ? new C.CustomHeightmapTerrainProvider({
          width: 16,
          height: 16,
          callback: () => new Float32Array(256).fill(35 * scale),
        })
      : new C.EllipsoidTerrainProvider();
    return;
  }
  world.terrainProvider = enabled
    ? {
        tilingScheme: scheme,
        minimumHeight: 0,
        maximumHeight: 70,
        maximumLevel: 0,
        errorEvent: new C.Event(),
        getLevelMaximumGeometricError: () => 1,
        getTileDataAvailable: () => true,
        loadTileDataAvailability: () => undefined,
        requestTileGeometry: () =>
          Promise.resolve(
            new C.SceneGISPlanarHeightmapTerrainData({
              width: 3,
              height: 3,
              buffer: new Float32Array([0, 35, 70, 0, 35, 70, 0, 35, 70]),
            }),
          ),
      }
    : undefined;
});
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction((event) => {
  const picked = scene.pick(event.position);
  byId("picked").textContent =
    picked?.primitive === layer
      ? `选中：${picked.id.styleLayer} / ${picked.id.featureId}`
      : "未选中矢量";
}, C.ScreenSpaceEventType.LEFT_CLICK);
scene.postRender.addEventListener(() => {
  byId("status").textContent =
    layer.ready && layer.tilesLoaded ? "本地数据已就绪" : "加载本地数据…";
});
window.example = {
  viewer,
  scene,
  world,
  layer,
  effects,
  ssr,
  ssil,
  errors,
  water,
  background,
  terrainHeight: 35 * scale,
};
window.addEventListener("pagehide", (event) => {
  if (event.persisted || viewer.isDestroyed()) {
    return;
  }
  handler.destroy();
  ssr.destroy();
  ssil.destroy();
  viewer.destroy();
});
