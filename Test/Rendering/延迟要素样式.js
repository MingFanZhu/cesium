/* global window, document */
import * as C from "/Build/CesiumUnminified/index.js";

const viewer = new C.Viewer("map", {
  globe: false,
  skyBox: false,
  skyAtmosphere: false,
  baseLayer: false,
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
});
const scene = viewer.scene;
scene.highDynamicRange = true;
scene.fog.enabled = false;
scene.sun = scene.moon = undefined;
scene.backgroundColor = C.Color.fromCssColorString("#273746");
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-03-20T14:00:00Z");
viewer.clock.shouldAnimate = false;
const center = C.Cartesian3.fromRadians(-1.31968, 0.698874);
const frame = C.Transforms.eastNorthUpToFixedFrame(center);
scene.camera.lookAt(center, new C.HeadingPitchRange(0.5, -0.65, 180));
scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
scene.light = new C.DirectionalLight({
  direction: C.Cartesian3.clone(scene.camera.directionWC),
  intensity: 2,
});
const ibl = new C.ImageBasedLighting({
  sphericalHarmonicCoefficients: [
    new C.Cartesian3(0.4, 0.4, 0.4),
    ...Array.from({ length: 8 }, () => new C.Cartesian3()),
  ],
});
scene.primitives.add(
  new C.Primitive({
    asynchronous: false,
    geometryInstances: new C.GeometryInstance({
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(240, 240, 1),
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      modelMatrix: C.Matrix4.multiplyByTranslation(
        frame,
        new C.Cartesian3(0, 0, -1),
        new C.Matrix4(),
      ),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          new C.Color(0.35, 0.35, 0.35, 1),
        ),
      },
    }),
    appearance: new C.PerInstanceColorAppearance({ translucent: false }),
  }),
);
const renderer = scene._sceneGISDeferred;
const ssr = new C.SceneGISScreenSpaceReflections({ scene, enabled: true });
const ssil = new C.SceneGISScreenSpaceIndirectLighting({ scene });
const taa = new C.SceneGISTemporalAntialiasing({ scene, enabled: true });
scene.postProcessStages.ambientOcclusion.enabled = true;
const byId = (id) => document.getElementById(id);
const errors = [];
scene.renderError.addEventListener((...args) => {
  const error = args[1];
  errors.push(error.message);
  byId("error").textContent = error.message;
});
let tileset,
  picked,
  disposed = false;
function resetHistory() {
  taa.reset();
  ssr.reset();
}
function applyStyle() {
  if (!tileset) {
    return;
  }
  const expressions = {
    height: {
      conditions: [
        ["${Height} >= 10", "color('orange')"],
        ["true", "color('cyan')"],
      ],
    },
    white: "color('white')",
    cyan: "color('cyan')",
    alpha: {
      conditions: [
        ["${Height} >= 10", "color('orange', 0.4)"],
        ["true", "color('cyan')"],
      ],
    },
  };
  tileset.style = new C.Cesium3DTileStyle({
    color: expressions[byId("style").value],
    show: true,
  });
  tileset.colorBlendMode = C.Cesium3DTileColorBlendMode[byId("mode").value];
  tileset.colorBlendAmount = 0.5;
  resetHistory();
}
byId("mode").onchange = byId("style").onchange = applyStyle;
byId("restore").onclick = applyStyle;
byId("show").onchange = () => {
  if (tileset) {
    tileset.show = byId("show").checked;
  }
  resetHistory();
};
for (const [id, effect] of Object.entries({
  deferred: renderer,
  ao: scene.postProcessStages.ambientOcclusion,
  ssr,
  ssil,
  taa,
})) {
  byId(id).onchange = () => {
    effect.enabled = byId(id).checked;
    resetHistory();
  };
}
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(({ position }) => {
  const result = scene.pick(position);
  picked = result instanceof C.Cesium3DTileFeature ? result : undefined;
  byId("paint").disabled = byId("hide").disabled = !picked;
  byId("picked").textContent = picked
    ? `要素 ${picked.featureId} · 高度 ${Number(picked.getProperty("Height")).toFixed(2)} 米`
    : "尚未选择要素";
}, C.ScreenSpaceEventType.LEFT_CLICK);
byId("paint").onclick = () => {
  if (picked) {
    picked.color = C.Color.RED;
    resetHistory();
  }
};
byId("hide").onclick = () => {
  if (picked) {
    picked.show = false;
    resetHistory();
  }
};
scene.postRender.addEventListener(() => {
  byId("stats").textContent = renderer.ready
    ? `${renderer._style ? 5 : 4} 张材质附件 · ${renderer.drawCount} 次材质绘制 · ${renderer.lightDrawCount} 次光照 · ${(renderer.byteLength / 1048576).toFixed(1)} MiB`
    : "等待场景材质…";
});
window.example = {
  viewer,
  deferred: renderer,
  ssr,
  ssil,
  taa,
  errors,
  applyStyle,
};
window.example.loading = C.Cesium3DTileset.fromUrl(
  "/Specs/Data/Cesium3DTiles/Batched/BatchedWithBatchTable/tileset.json",
  { imageBasedLighting: ibl, environmentMapOptions: { enabled: false } },
)
  .then((value) => {
    if (disposed) {
      value.destroy();
      return;
    }
    tileset = scene.primitives.add(value);
    window.example.tileset = tileset;
    applyStyle();
  })
  .catch((error) => {
    errors.push(error.message);
    byId("error").textContent = error.message;
  });
window.addEventListener("pagehide", (event) => {
  if (!event.persisted && !disposed) {
    disposed = true;
    handler.destroy();
    if (!viewer.isDestroyed()) {
      viewer.destroy();
    }
    ibl.destroy();
  }
});
