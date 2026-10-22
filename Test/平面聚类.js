/* global window, document, performance */
/* eslint no-unused-vars: ["error", { vars: "all", args: "none" }] */
window.CESIUM_BASE_URL = "/Build/CesiumUnminified/";
const C = await import("/Build/CesiumUnminified/index.js");
const $ = (id) => document.getElementById(id);
const origin = new C.Cartesian3(13000000, 4000000, 0);
const position = (x, y, z = 10) =>
  new C.Cartesian3(origin.x + x, origin.y + y, z);
const viewer = new C.Viewer("view", {
  planarWorld: {
    extent: {
      minimumX: origin.x - 3000,
      minimumY: origin.y - 3000,
      maximumX: origin.x + 3000,
      maximumY: origin.y + 3000,
    },
    maximumLevel: 0,
    baseColor: C.Color.fromCssColorString("#233747"),
  },
  animation: true,
  timeline: true,
  fullscreenButton: false,
});
const world = viewer.planarWorld;
viewer.scene.environmentEffects.enabled = false;
const epoch = C.JulianDate.fromIso8601("2026-10-22T04:00:00Z");
viewer.clock.currentTime = epoch.clone();
viewer.clock.shouldAnimate = false;
const state = { offset: 0, reads: 0, events: 0 };
const source = new C.CustomDataSource("平面聚类验收");
source.clustering.enabled = true;
source.clustering.pixelRange = 65;
source.clustering.minimumClusterSize = 3;
const image = document.createElement("canvas");
image.width = image.height = 32;
const ctx = image.getContext("2d");
ctx.fillStyle = "#fcbd55";
ctx.beginPath();
ctx.moveTo(16, 1);
ctx.lineTo(31, 16);
ctx.lineTo(16, 31);
ctx.lineTo(1, 16);
ctx.closePath();
ctx.fill();
const groups = [];
for (let group = 0; group < 12; ++group) {
  const list = [];
  for (let i = 0; i < 24; ++i) {
    const x = ((group % 4) - 1.5) * 480 + ((i % 6) - 2.5) * 22;
    const y =
      (Math.floor(group / 4) - 1) * 500 + (Math.floor(i / 6) - 1.5) * 22;
    const options = {
      id: `group-${group}-${i}`,
      name: `组 ${group + 1} · 对象 ${i + 1}`,
      position: position(x, y),
    };
    if (group === 0) {
      options.position = new C.CallbackPositionProperty((time, result) => {
        state.reads++;
        const motion = $("animate").checked
          ? 100 * Math.sin(C.JulianDate.secondsDifference(time, epoch))
          : 0;
        return C.Cartesian3.clone(
          position(x + state.offset + motion, y),
          result,
        );
      }, false);
    }
    if (group % 3 === 0) {
      options.point = {
        pixelSize: 10,
        color: C.Color.CYAN,
        outlineColor: C.Color.WHITE,
        outlineWidth: 1,
      };
    } else if (group % 3 === 1) {
      options.billboard = { image, width: 18, height: 18 };
    } else {
      options.label = {
        text: `${i + 1}`,
        font: "14px sans-serif",
        fillColor: C.Color.WHITE,
        outlineColor: C.Color.BLACK,
        outlineWidth: 2,
        style: C.LabelStyle.FILL_AND_OUTLINE,
      };
    }
    list.push(source.entities.add(options));
  }
  groups.push(list);
}
const removeStyle = source.clustering.clusterEvent.addEventListener(
  (ids, cluster) => {
    state.events++;
    cluster.point.show = true;
    cluster.point.pixelSize = 44;
    cluster.point.color = C.Color.fromCssColorString("#168eac");
    cluster.point.outlineColor = C.Color.fromCssColorString("#8beaff");
    cluster.point.outlineWidth = 2;
    cluster.point.id = ids;
    cluster.label.font = "bold 17px sans-serif";
    cluster.label.fillColor = C.Color.WHITE;
    cluster.label.horizontalOrigin = C.HorizontalOrigin.CENTER;
    cluster.label.verticalOrigin = C.VerticalOrigin.CENTER;
    cluster.label.eyeOffset = new C.Cartesian3(0, 0, -1);
    cluster.label.text = String(ids.length);
  },
);
await viewer.dataSources.add(source);
function home() {
  viewer.camera.lookAt(
    position(-200, 0, 0),
    new C.HeadingPitchRange(0, -Math.PI / 2, 2300),
  );
  viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
}
home();
$("home").onclick = home;
$("enabled").onchange = () => {
  source.clustering.enabled = $("enabled").checked;
};
$("range").oninput = () => {
  source.clustering.pixelRange = Number($("range").value);
  $("rangeValue").textContent = $("range").value;
};
$("minimum").onchange = () => {
  source.clustering.minimumClusterSize = Number($("minimum").value);
};
for (const name of ["points", "billboards", "labels"]) {
  $(name).onchange = () => {
    source.clustering[`cluster${name[0].toUpperCase()}${name.slice(1)}`] =
      $(name).checked;
  };
}
$("show").onchange = () => {
  source.show = $("show").checked;
};
$("offset").oninput = () => {
  state.offset = Number($("offset").value);
};
$("animate").onchange = () => {
  viewer.clock.shouldAnimate = $("animate").checked;
};
$("ortho").onchange = () => {
  if ($("ortho").checked) {
    viewer.camera.switchToOrthographicFrustum();
  } else {
    viewer.camera.switchToPerspectiveFrustum();
  }
};
async function readd() {
  viewer.dataSources.remove(source);
  await viewer.dataSources.add(source);
}
$("readd").onclick = readd;
const handler = new C.ScreenSpaceEventHandler(viewer.canvas);
function members(p) {
  const id = viewer.scene.pick(p)?.id;
  return Array.isArray(id) ? id : id instanceof C.Entity ? [id] : [];
}
handler.setInputAction(({ position: p }) => {
  const ids = members(p);
  $("picked").textContent = ids.length
    ? `拾取 ${ids.length} 个对象\n${ids
        .slice(0, 4)
        .map((e) => e.name)
        .join("\n")}${ids.length > 4 ? "\n…" : ""}`
    : "未命中对象";
}, C.ScreenSpaceEventType.LEFT_CLICK);
handler.setInputAction(({ position: p }) => {
  const ids = members(p);
  if (ids.length) {
    viewer.zoomTo(ids, new C.HeadingPitchRange(0, -Math.PI / 2, 0));
  }
}, C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
let lastStatus = 0;
const removeRender = viewer.scene.postRender.addEventListener(() => {
  if (performance.now() - lastStatus < 250) {
    return;
  }
  lastStatus = performance.now();
  $("status").textContent =
    `对象 ${source.entities.values.length} · 聚类 ${source.clustering._clusterLabelCollection?.length ?? 0}\n时间 ${viewer.clock.shouldAnimate ? "运行" : "冻结"} · ${$("ortho").checked ? "正交" : "透视"}`;
});
const removeError = viewer.scene.renderError.addEventListener(
  (scene, error) => {
    $("error").textContent = error.stack ?? String(error);
  },
);
function destroy() {
  if (viewer.isDestroyed()) {
    return;
  }
  handler.destroy();
  removeRender();
  removeError();
  removeStyle();
  viewer.destroy();
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    destroy();
  }
});
window.example = {
  viewer,
  world,
  source,
  groups,
  state,
  position,
  home,
  readd,
  destroy,
};
