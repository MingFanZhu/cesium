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
scene.backgroundColor = C.Color.fromCssColorString("#233044");
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-03-20T14:00:00Z");
viewer.clock.shouldAnimate = false;
const center = C.Cartesian3.fromDegrees(0, 51, 100);
const frame = C.Transforms.eastNorthUpToFixedFrame(center);
const point = (x, y, z) =>
  C.Matrix4.multiplyByPoint(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const vector = (x, y, z) =>
  C.Matrix4.multiplyByPointAsVector(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const home = () => {
  scene.camera.lookAt(point(0, 1, 1), new C.HeadingPitchRange(0.15, -0.65, 36));
  scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
};
home();
scene.light = new C.DirectionalLight({
  direction: vector(0.5, 0.3, -1),
  intensity: 1.5,
});
scene.shadowMap.enabled = true;
scene.shadowMap.maximumDistance = 100;
scene.shadowMap.size = 2048;
scene.shadowMap.darkness = 0;
const deferred = scene._sceneGISDeferred;
const taa = new C.SceneGISTemporalAntialiasing({ scene, enabled: true });
scene.postProcessStages.ambientOcclusion.enabled = true;
const lights = new C.SceneGISLightCollection({ scene });
lights.add(
  new C.SceneGISPointLight({
    position: point(-3, -3, 5),
    color: C.Color.ORANGE,
    intensity: 30,
    range: 14,
  }),
);
lights.add(
  new C.SceneGISPointLight({
    position: point(5, 4, 4),
    color: C.Color.CYAN,
    intensity: 20,
    range: 12,
  }),
);
const weather = new C.SceneGISSurfaceWeather({ scene });
const primitiveMaterials = [];
function addBox(name, x, y, z, dimensions, appearance, color) {
  return scene.primitives.add(
    new C.Primitive({
      asynchronous: false,
      shadows: C.ShadowMode.ENABLED,
      geometryInstances: new C.GeometryInstance({
        id: name,
        geometry: C.BoxGeometry.fromDimensions({
          dimensions,
          vertexFormat: appearance.vertexFormat,
        }),
        modelMatrix: C.Matrix4.multiplyByTranslation(
          frame,
          new C.Cartesian3(x, y, z),
          new C.Matrix4(),
        ),
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(
            color ?? C.Color.WHITE,
          ),
        },
      }),
      appearance,
    }),
  );
}
addBox(
  "普通图元地板",
  0,
  1,
  -0.25,
  new C.Cartesian3(24, 19, 0.5),
  new C.PerInstanceColorAppearance({ translucent: false, closed: true }),
  new C.Color(0.35, 0.39, 0.42),
);
for (const [index, support] of ["BASIC", "TEXTURED", "ALL"].entries()) {
  const material = new C.Material({
    fabric: {
      type: "DeferredExampleSurface",
      uniforms: {
        color: C.Color.fromCssColorString(
          ["#cf714b", "#5cbd85", "#dabd58"][index],
        ),
      },
      source: `czm_material czm_getMaterial(czm_materialInput i) {
      czm_material m=czm_getDefaultMaterial(i); m.diffuse=color.rgb; m.alpha=color.a;
      m.specular=0.5; m.shininess=48.0; m.emission=vec3(0.01); return m;
    }`,
    },
    translucent: false,
  });
  primitiveMaterials.push(material);
  addBox(
    `Primitive ${support}`,
    -6,
    -4 + index * 5,
    1.5,
    new C.Cartesian3(3, 3, 3),
    new C.MaterialAppearance({
      material,
      materialSupport: C.MaterialAppearance.MaterialSupport[support],
      translucent: false,
      closed: true,
    }),
  );
}
const boxEntity = viewer.entities.add({
  name: "Entity 方块",
  position: point(1, -4, 1.5),
  box: {
    dimensions: new C.Cartesian3(3, 3, 3),
    material: C.Color.CYAN,
    shadows: C.ShadowMode.ENABLED,
  },
});
const cylinder = viewer.entities.add({
  name: "Entity 圆柱",
  position: point(5, 1, 2),
  cylinder: {
    length: 4,
    topRadius: 1.5,
    bottomRadius: 1.5,
    material: C.Color.CYAN,
    shadows: C.ShadowMode.ENABLED,
  },
});
const polygon = viewer.entities.add({
  name: "Entity 挤出面",
  polygon: {
    hierarchy: new C.PolygonHierarchy([
      point(1, 5, 0),
      point(5, 5, 0),
      point(4, 8, 0),
      point(1, 8, 0),
    ]),
    perPositionHeight: true,
    extrudedHeight: 104,
    material: C.Color.CYAN,
    shadows: C.ShadowMode.ENABLED,
  },
});
viewer.entities.add({
  name: "原生线",
  polyline: {
    positions: [point(-10, -7, 0.2), point(9, -7, 0.2), point(9, 9, 0.2)],
    width: 3,
    material: C.Color.YELLOW,
  },
});
viewer.entities.add({
  name: "原生点与标注",
  position: point(9, 9, 1),
  point: { color: C.Color.ORANGE, pixelSize: 12 },
  label: {
    text: "Entity 点 / 标注",
    font: "16px sans-serif",
    pixelOffset: new C.Cartesian2(0, -22),
  },
});
const ibl = new C.ImageBasedLighting({
  imageBasedLightingFactor: new C.Cartesian2(0.5, 0),
});
let model,
  disposed = false;
const errors = [];
const byId = (id) => document.getElementById(id);
const reset = () => taa.reset();
const entities = [boxEntity, cylinder, polygon];
function applyColor() {
  const color = C.Color[byId("color").value].withAlpha(
    byId("translucent").checked ? 0.4 : 1,
  );
  boxEntity.box.material = color;
  cylinder.cylinder.material = color;
  polygon.polygon.material = color;
  reset();
}
byId("color").onchange = byId("translucent").onchange = applyColor;
byId("show").onchange = () => {
  entities.forEach((entity) => {
    entity.show = byId("show").checked;
  });
  reset();
};
byId("animate").onchange = () => {
  const epoch = C.JulianDate.clone(viewer.clock.currentTime);
  boxEntity.box.dimensions = byId("animate").checked
    ? new C.CallbackProperty(
        (time) =>
          new C.Cartesian3(
            3,
            3,
            3 + Math.sin(C.JulianDate.secondsDifference(time, epoch)) * 1.5,
          ),
        false,
      )
    : new C.Cartesian3(3, 3, 3);
  viewer.clock.shouldAnimate = byId("animate").checked;
  reset();
};
for (const [id, effect] of Object.entries({
  taa,
  ao: scene.postProcessStages.ambientOcclusion,
  shadows: scene.shadowMap,
})) {
  byId(id).onchange = () => {
    effect.enabled = byId(id).checked;
    reset();
  };
}
byId("lights").onchange = () => {
  lights.show = byId("lights").checked;
  reset();
};
byId("weather").onchange = () => {
  weather.enabled = byId("weather").value !== "dry";
  weather.wetness = byId("weather").value === "wet" ? 1 : 0;
  weather.snowCoverage = byId("weather").value === "snow" ? 1 : 0;
  reset();
};
byId("home").onclick = () => {
  home();
  reset();
};
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(({ position }) => {
  const hit = scene.pick(position);
  byId("picked").textContent = hit
    ? `已选：${hit.id?.name ?? hit.id ?? "本地 glTF 模型"}`
    : "未选中物体";
}, C.ScreenSpaceEventType.LEFT_CLICK);
scene.renderError.addEventListener((...args) => {
  const error = args[1];
  errors.push(error.message);
  byId("error").textContent = error.message;
});
scene.postRender.addEventListener(() => {
  byId("stats").textContent = deferred.ready
    ? `${deferred.drawCount} 次材质 · ${deferred.lightDrawCount} 次光照 · ${(deferred.byteLength / 1048576).toFixed(1)} MiB`
    : "等待场景材质…";
});
window.example = {
  viewer,
  deferred,
  taa,
  lights,
  weather,
  errors,
  boxEntity,
  entities,
  point,
  home,
  get model() {
    return model;
  },
};
window.addEventListener("pagehide", (event) => {
  if (!event.persisted && !disposed) {
    disposed = true;
    handler.destroy();
    viewer.destroy();
    ibl.destroy();
    primitiveMaterials.forEach((material) => material.destroy());
  }
});
try {
  const loaded = await C.Model.fromGltfAsync({
    url: "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
    modelMatrix: C.Matrix4.multiplyByUniformScale(
      C.Matrix4.multiplyByTranslation(
        frame,
        new C.Cartesian3(0, 1, 1.5),
        new C.Matrix4(),
      ),
      3,
      new C.Matrix4(),
    ),
    color: C.Color.CORNFLOWERBLUE,
    imageBasedLighting: ibl,
    shadows: C.ShadowMode.ENABLED,
  });
  if (disposed) {
    loaded.destroy();
  } else {
    model = scene.primitives.add(loaded);
  }
} catch (error) {
  if (!disposed) {
    errors.push(error.message);
    byId("error").textContent = error.message;
  }
}
