/* global window, document */
/* eslint no-unused-vars: ["error", { vars: "all", args: "none" }] */
window.CESIUM_BASE_URL = "/Build/CesiumUnminified/";
const C = await import("/Build/CesiumUnminified/index.js");
const $ = (id) => document.getElementById(id);
const center = 20000000;
const point = (x, y, z = 0) => new C.Cartesian3(center + x, center + y, z);
const world = new C.SceneGISPlanarWorld({
  coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
    crs: "EPSG:3857",
    extent: new C.SceneGISPlanarExtent({
      minimumX: center - 1200,
      minimumY: center - 1200,
      maximumX: center + 1200,
      maximumY: center + 1200,
    }),
  }),
  maximumLevel: 0,
  baseColor: C.Color.fromCssColorString("#233747"),
});
const viewer = new C.Viewer("view", {
  world,
  animation: true,
  timeline: true,
  fullscreenButton: false,
});
viewer.scene.environmentEffects.enabled = false;
viewer.scene.highDynamicRange = false;
viewer.scene.light = new C.DirectionalLight({
  direction: new C.Cartesian3(0, 0, -1),
});
const epoch = C.JulianDate.fromIso8601("2026-10-22T04:00:00Z");
viewer.clock.currentTime = epoch.clone();
viewer.clock.multiplier = 1;
viewer.clock.shouldAnimate = true;
const provider = {
  tilingScheme: world.tilingScheme,
  minimumHeight: 0,
  maximumHeight: 12,
  maximumLevel: 0,
  errorEvent: new C.Event(),
  getLevelMaximumGeometricError: () => 1,
  getTileDataAvailable: () => true,
  loadTileDataAvailability: () => undefined,
  requestTileGeometry: () =>
    Promise.resolve(
      new C.SceneGISPlanarHeightmapTerrainData({
        width: 33,
        height: 33,
        buffer: Float32Array.from(
          { length: 1089 },
          (_, i) =>
            6 +
            6 * Math.sin((i % 33) * 0.8) * Math.cos(Math.floor(i / 33) * 0.8),
        ),
      }),
    ),
};
world.terrainProvider = provider;
const fabric = {
  type: "PlanarPolylineFlowExample",
  uniforms: { color: C.Color.WHITE.clone(), seconds: 0 },
  source: `czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material m = czm_getDefaultMaterial(materialInput);
    float phase = fract(materialInput.st.s * 8.0 - seconds * 0.6);
    float pulse = smoothstep(0.0, 0.18, phase) * (1.0 - smoothstep(0.45, 0.9, phase));
    float edge = smoothstep(0.0, 0.15, materialInput.st.t) * smoothstep(0.0, 0.15, 1.0-materialInput.st.t);
    m.diffuse = color.rgb * (0.2 + 0.8 * pulse);
    m.alpha = color.a * edge;
    return m;
  }`,
};
// Register this example's Fabric type through native Material construction.
new C.Material({ fabric }).destroy();
const state = { reads: 0, rebuilds: 0, shown: true };
function color(result) {
  C.Color.fromCssColorString($("color").value, result);
  result.alpha = Number($("alpha").value);
  return result;
}
function type(effect) {
  return effect === "flow"
    ? fabric.type
    : effect === "arrow"
      ? C.Material.PolylineArrowType
      : C.Material.PolylineDashType;
}
function property(effect) {
  const tint = new C.CallbackProperty((time, result) => {
    state.reads++;
    return color(result ?? new C.Color());
  }, false);
  if (effect === "arrow") {
    return new C.PolylineArrowMaterialProperty(tint);
  }
  if (effect === "dash") {
    return new C.PolylineDashMaterialProperty({
      color: tint,
      dashLength: 24,
      dashPattern: 255,
    });
  }
  const value = {
    isConstant: false,
    definitionChanged: new C.Event(),
    getType: () => fabric.type,
    getValue(time, result = {}) {
      state.reads++;
      result.color = color(result.color ?? new C.Color());
      result.seconds = C.JulianDate.secondsDifference(time, epoch);
      return result;
    },
    equals: (other) => other === value,
  };
  return value;
}
let entities = [],
  primitives = [],
  materials = [];
const tracks = [
  { name: "普通 Entity", ground: false, effect: "arrow", x: 20, y: 145 },
  { name: "贴地 Entity", ground: true, effect: "arrow", x: 250, y: 145 },
  {
    name: "普通 Primitive",
    ground: false,
    effect: "dash",
    x: 20,
    y: 0,
    primitive: true,
  },
  {
    name: "贴地 Primitive",
    ground: true,
    effect: "dash",
    x: 250,
    y: 0,
    primitive: true,
  },
  {
    name: "普通闭合 Entity",
    ground: false,
    effect: "flow",
    x: 20,
    y: -155,
    closed: true,
  },
  {
    name: "贴地闭合 Entity",
    ground: true,
    effect: "flow",
    x: 250,
    y: -155,
    closed: true,
  },
];
function positions(track) {
  const route = track.closed
    ? [
        [-65, -35],
        [65, -35],
        [65, 35],
        [-65, 35],
        [-65, -35],
      ]
    : [
        [-75, -20],
        [-45, -20],
        [0, 20],
        [75, 20],
      ];
  return route.map(([x, y]) =>
    point(
      track.x + x,
      track.y + y + Number($("offset").value),
      track.ground ? 0 : 25,
    ),
  );
}
function selectedEffect(track) {
  return $("effect").value === "mixed" ? track.effect : $("effect").value;
}
function clear() {
  for (const entity of entities) {
    viewer.entities.remove(entity);
  }
  for (const primitive of primitives) {
    viewer.scene.primitives.remove(primitive);
  }
  for (const value of materials) {
    value.destroy();
  }
  entities = [];
  primitives = [];
  materials = [];
}
function rebuild() {
  clear();
  for (const track of tracks) {
    const effect = selectedEffect(track);
    if (track.primitive) {
      const value = C.Material.fromType(type(effect));
      materials.push(value);
      primitives.push(
        viewer.scene.primitives.add(
          new (track.ground
            ? C.SceneGISPlanarGroundPrimitive
            : C.SceneGISPlanarPrimitive)({
            ...(track.ground ? { world } : {}),
            geometry: new C.SceneGISPlanarPolylineGeometry({
              positions: positions(track),
              width: Number($("width").value),
            }),
            appearance: new C.PolylineMaterialAppearance({ material: value }),
            id: track.name,
            show: state.shown,
          }),
        ),
      );
    } else {
      entities.push(
        viewer.entities.add({
          id: track.name,
          show: state.shown,
          polyline: {
            positions: positions(track),
            width: Number($("width").value),
            clampToGround: track.ground,
            arcType: C.ArcType.NONE,
            material: property(effect),
          },
        }),
      );
    }
  }
  state.rebuilds++;
}
function updatePositions() {
  let e = 0,
    p = 0;
  for (const track of tracks) {
    if (track.primitive) {
      primitives[p++].geometry = new C.SceneGISPlanarPolylineGeometry({
        positions: positions(track),
        width: Number($("width").value),
      });
    } else {
      const entity = entities[e++];
      entity.polyline.positions = positions(track);
      entity.polyline.width = Number($("width").value);
    }
  }
}
function home() {
  const angle = C.Math.toRadians(Number($("pitch").value)),
    distance = 800;
  viewer.camera.setView({
    destination: point(
      40,
      -distance * Math.cos(angle),
      distance * Math.sin(angle),
    ),
    orientation: {
      direction: new C.Cartesian3(0, Math.cos(angle), -Math.sin(angle)),
      up: new C.Cartesian3(0, Math.sin(angle), Math.cos(angle)),
    },
  });
}
$("rebuild").onclick = rebuild;
$("effect").onchange = rebuild;
$("width").oninput = updatePositions;
$("offset").oninput = updatePositions;
$("pitch").oninput = home;
$("home").onclick = home;
$("freeze").onchange = () => {
  viewer.clock.shouldAnimate = !$("freeze").checked;
};
$("terrain").onchange = () => {
  world.terrainProvider = $("terrain").checked ? provider : undefined;
};
$("toggle").onclick = () => {
  state.shown = !state.shown;
  for (const object of [...entities, ...primitives]) {
    object.show = state.shown;
  }
};
const tick = viewer.scene.preUpdate.addEventListener(() => {
  for (const value of materials) {
    value.uniforms.color = color(value.uniforms.color);
    if (value.type === fabric.type) {
      value.uniforms.seconds = C.JulianDate.secondsDifference(
        viewer.clock.currentTime,
        epoch,
      );
    }
    if (value.type === C.Material.PolylineDashType) {
      value.uniforms.dashLength = 24;
      value.uniforms.dashPattern = 255;
    }
  }
});
const stats = viewer.scene.postRender.addEventListener(() => {
  $("status").textContent =
    `属性读取 ${state.reads} 次 · 重建 ${state.rebuilds} 次\n仿真秒 ${C.JulianDate.secondsDifference(viewer.clock.currentTime, epoch).toFixed(2)} · 地形 ${world.tilesLoaded ? "就绪" : "加载中"}`;
});
const error = viewer.scene.renderError.addEventListener((scene, cause) => {
  $("error").textContent = cause.message;
});
const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction((event) => {
  const hit = viewer.scene.pick(event.position);
  $("picked").textContent = hit
    ? `拾取：${hit.id?.id ?? hit.id}`
    : "未拾取线条";
}, C.ScreenSpaceEventType.LEFT_CLICK);
function destroy() {
  if (viewer.isDestroyed()) {
    return;
  }
  tick();
  stats();
  error();
  handler.destroy();
  clear();
  viewer.destroy();
  if (!world.isDestroyed()) {
    world.destroy();
  }
}
rebuild();
home();
window.example = {
  viewer,
  world,
  state,
  epoch,
  point,
  home,
  rebuild,
  destroy,
  get entities() {
    return entities;
  },
  get primitives() {
    return primitives;
  },
  get materials() {
    return materials;
  },
};
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    destroy();
  }
});
