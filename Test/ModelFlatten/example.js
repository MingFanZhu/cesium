/* global window, document, URLSearchParams, location */
const C = await import("/Build/CesiumUnminified/index.js");
const params = new URLSearchParams(location.search);
const planar = params.get("world") === "planar";
const grid = params.get("sample") === "grid";
const frame = planar
  ? C.Matrix4.fromTranslation(new C.Cartesian3(13000000, 4000000, 0))
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(-75.596, 40.038),
    );
const world = planar
  ? new C.SceneGISPlanarWorld({
      coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
        extent: new C.SceneGISPlanarExtent({
          minimumX: 12995000,
          minimumY: 3995000,
          maximumX: 13005000,
          maximumY: 4005000,
        }),
      }),
      maximumLevel: 0,
      baseColor: C.Color.fromCssColorString("#434a52"),
    })
  : undefined;
const viewer = new C.Viewer("map", {
  ...(world
    ? { world }
    : { baseLayer: false, baseLayerPicker: false, geocoder: false }),
  animation: false,
  timeline: false,
  fullscreenButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  homeButton: false,
});
const scene = viewer.scene;
scene.environmentEffects.enabled = false;
if (world) {
  world.show = false;
} else {
  scene.globe.show = false;
}
scene.backgroundColor = C.Color.fromCssColorString("#263440");
const direction = C.Matrix4.multiplyByPointAsVector(
  frame,
  new C.Cartesian3(0.3, 0.4, -1),
  new C.Cartesian3(),
);
scene.light = new C.DirectionalLight({ direction });
viewer.clock.shouldAnimate = false;
const errors = [];
scene.renderError.addEventListener(function () {
  const e = arguments[1];
  errors.push(String(e));
  document.getElementById("error").textContent = String(e);
});
const outline = scene.primitives.add(new C.PolylineCollection());
let flatten,
  tileset,
  disposed = false;
let rings;
function polygon() {
  const size = +document.getElementById("size").value;
  const cx = +document.getElementById("centerX").value;
  const cy = +document.getElementById("centerY").value;
  const shape = document.getElementById("shape").value;
  const ring = (array) =>
    array.map(([x, y]) => new C.Cartesian3(cx + x * size, cy + y * size, 0));
  const outer =
    shape === "concave"
      ? ring([
          [-1, -1],
          [1, -1],
          [1, -1 / 7],
          [1 / 7, -1 / 7],
          [1 / 7, 1],
          [-1, 1],
        ])
      : ring([
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]);
  const holes =
    shape === "rectangle"
      ? []
      : [
          ring([
            [-5 / 7, -3 / 7],
            [-2 / 7, -3 / 7],
            [-2 / 7, 0],
            [-5 / 7, 0],
          ]),
        ];
  rings = [outer, ...holes];
  return new C.PolygonHierarchy(
    outer,
    holes.map((h) => new C.PolygonHierarchy(h)),
  );
}
function drawOutline() {
  outline.removeAll();
  const z = flatten.height + 0.1;
  for (const ring of rings) {
    outline.add({
      positions: [...ring, ring[0]].map((p) =>
        C.Matrix4.multiplyByPoint(
          frame,
          new C.Cartesian3(p.x, p.y, z),
          new C.Cartesian3(),
        ),
      ),
      width: 2,
      material: C.Material.fromType("Color", { color: C.Color.YELLOW }),
    });
  }
  outline.show = document.getElementById("outline").checked;
}
function replaceRange() {
  const next = new C.SceneGISModelFlatten({
    polygonHierarchy: polygon(),
    modelMatrix: frame,
    height: +document.getElementById("height").value,
    enabled: document.getElementById("enabled").checked,
  });
  const previous = flatten;
  flatten = next;
  if (tileset) {
    tileset.customShader = flatten;
  }
  previous?.destroy();
  drawOutline();
  document.getElementById("sizeValue").textContent =
    `${document.getElementById("size").value} 米`;
}
function home(top = false) {
  const center = C.Matrix4.multiplyByPoint(
    frame,
    new C.Cartesian3(0, 0, 20),
    new C.Cartesian3(),
  );
  viewer.camera.viewBoundingSphere(
    new C.BoundingSphere(center, grid ? 145 : 350),
    new C.HeadingPitchRange(0.25, top ? -Math.PI / 2 : -0.65, grid ? 440 : 850),
  );
  viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
}
replaceRange();
home();
const api = {
  C,
  viewer,
  frame,
  errors,
  ready: false,
  get flatten() {
    return flatten;
  },
  get tileset() {
    return tileset;
  },
  replaceRange,
  home,
  dispose() {
    if (disposed) {
      return;
    }
    disposed = true;
    if (tileset) {
      scene.primitives.remove(tileset);
    }
    flatten.destroy();
    viewer.destroy();
  },
};
window.flattenExample = api;
document.getElementById("enabled").onchange = (e) => {
  flatten.enabled = e.target.checked;
};
document.getElementById("height").oninput = (e) => {
  flatten.height = +e.target.value;
  document.getElementById("heightValue").textContent = `${flatten.height} 米`;
  drawOutline();
};
for (const id of ["shape", "size", "centerX", "centerY"]) {
  document.getElementById(id).onchange = replaceRange;
}
document.getElementById("outline").onchange = drawOutline;
document.getElementById("environment").onchange = (e) => {
  scene.environmentEffects.enabled = e.target.checked;
};
document.getElementById("coarse").onchange = (e) => {
  if (tileset) {
    tileset.maximumScreenSpaceError = e.target.checked ? 1000 : 8;
  }
};
document.getElementById("home").onclick = () => home();
document.getElementById("top").onclick = () => home(true);
window.addEventListener("pagehide", (e) => {
  if (!e.persisted) {
    api.dispose();
  }
});
try {
  const loaded = await C.Cesium3DTileset.fromUrl(
    grid
      ? "/Test/ModelFlatten/data/tileset.json"
      : "/Test/Rendering/data/tileset.json",
    { modelMatrix: frame, customShader: flatten, maximumScreenSpaceError: 8 },
  );
  if (disposed) {
    loaded.destroy();
  } else {
    loaded.customShader = flatten;
    tileset = scene.primitives.add(loaded);
    tileset.tileFailed.addEventListener((e) => {
      errors.push(e.message);
      document.getElementById("error").textContent = e.message;
    });
    api.ready = true;
    document.getElementById("status").textContent =
      `${planar ? "平面" : "球面"} · ${grid ? "确定性双层网格" : "AGI HQ 倾斜摄影（本地）"}`;
  }
} catch (e) {
  errors.push(String(e));
  document.getElementById("error").textContent = String(e);
}
