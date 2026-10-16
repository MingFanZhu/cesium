/* global document, window */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";

export default function start(globe) {
  const half = 20037508.342789244;
  const extent = {
    minimumX: -half,
    minimumY: -half,
    maximumX: half,
    maximumY: half,
  };
  const viewer = new C.Viewer("map", {
    ...(globe
      ? { baseLayer: false, scene3DOnly: true }
      : { planarWorld: { extent, crs: "EPSG:3857", maximumLevel: 18 } }),
    skyBox: false,
    skyAtmosphere: false,
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false,
    fullscreenButton: false,
    projectionPicker: false,
  });
  const scene = viewer.scene;
  // Keep this local style fixture independent of clock-driven physical lighting.
  scene.environmentEffects.enabled = false;
  scene.gamma = 1;
  scene.debugShowFramesPerSecond = true;
  scene.fog.enabled = false;
  if (globe) {
    scene.globe.showGroundAtmosphere = false;
  }
  const scheme = globe
    ? new C.SceneGISPlanarTilingScheme({
        coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
          crs: "EPSG:3857",
          extent: new C.SceneGISPlanarExtent(extent),
        }),
      })
    : viewer.planarWorld.tilingScheme;
  const bounds = scheme.tileXYToExtent(17603, 10746, 15);
  const center = new C.Cartesian3(
    (bounds.minimumX + bounds.maximumX) / 2,
    (bounds.minimumY + bounds.maximumY) / 2,
    0,
  );
  const source = "fixture";
  const style = {
    version: 8,
    sprite: "/Test/vector-tiles/pattern-sprite",
    glyphs:
      "/Test/vector-tiles/symbol-assets/{range}.pbf?fontstack={fontstack}",
    sources: {
      fixture: {
        type: "vector",
        tiles: ["/Test/vector-tiles/enhancements.pbf?z={z}&x={x}&y={y}"],
        // The synthetic tile repeats at every level so zooming out can coarsen.
        minzoom: 0,
        maxzoom: 15,
      },
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-pattern": "grid" },
      },
      {
        id: "water",
        type: "fill",
        source,
        "source-layer": "water",
        paint: {
          "fill-pattern": "water",
          "fill-opacity": ["coalesce", ["global-state", "waterOpacity"], 0.6],
        },
      },
      {
        id: "selection",
        type: "fill",
        source,
        "source-layer": "water",
        paint: {
          "fill-color": "#ffbd35",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.55,
            0,
          ],
        },
      },
      {
        id: "road",
        type: "line",
        source,
        "source-layer": "transportation",
        paint: {
          "line-pattern": "arrow",
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            40,
            24,
          ],
        },
      },
      {
        id: "building",
        type: "fill-extrusion",
        source,
        "source-layer": "building",
        paint: {
          "fill-extrusion-pattern": "windows",
          "fill-extrusion-height": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            120,
            80,
          ],
        },
      },
      {
        id: "poi-anchor",
        type: "circle",
        source,
        "source-layer": "labels",
        paint: { "circle-radius": 4, "circle-color": "#df5338" },
      },
      {
        id: "poi",
        type: "symbol",
        source,
        "source-layer": "labels",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["SceneGIS Test Noto Subset"],
          "text-size": 18,
          "text-variable-anchor": ["top", "bottom", "left", "right"],
          "text-radial-offset": 2.4,
          "text-justify": "auto",
          "icon-image": "shield",
          "icon-text-fit": "both",
          "icon-text-fit-padding": [4, 6, 4, 6],
        },
        paint: {
          "text-color": "#132a39",
          "text-halo-color": "white",
          "text-halo-width": 1.5,
        },
      },
    ],
  };
  const layer = scene.primitives.add(
    new C.SceneGISVectorTileLayer({ scene, tilingScheme: scheme, style }),
  );
  const status = document.getElementById("status");
  layer.errorEvent.addEventListener(({ error }) => {
    status.textContent = error.message;
  });
  function view(tilt) {
    const angle = tilt ? Math.PI / 4 : Math.PI / 2;
    if (globe) {
      const p = new C.WebMercatorProjection().unproject(center);
      scene.camera.lookAt(
        C.Cartesian3.fromRadians(p.longitude, p.latitude),
        new C.HeadingPitchRange(0, -angle, 850),
      );
      scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
    } else {
      scene.camera.setView({
        destination: new C.Cartesian3(
          center.x,
          center.y - 1000 * Math.cos(angle),
          1000 * Math.sin(angle),
        ),
        orientation: {
          direction: new C.Cartesian3(0, Math.cos(angle), -Math.sin(angle)),
          up: new C.Cartesian3(0, Math.sin(angle), Math.cos(angle)),
        },
      });
    }
  }
  let selected;
  const options = {
    opacity: 1,
    waterOpacity: 0.6,
    clear: () => {
      if (selected) {
        layer.removeFeatureState(selected, "selected");
      }
      selected = undefined;
    },
    top: () => view(false),
    tilt: () => view(true),
  };
  const gui = new GUI({ title: "样式增强" });
  gui
    .add(options, "opacity", 0, 1, 0.05)
    .name("矢量不透明度")
    .onChange((value) => {
      layer.opacity = value;
    });
  gui.add(options, "top").name("俯视");
  gui
    .add(options, "waterOpacity", 0, 1, 0.05)
    .name("水面透明度 · 全局状态")
    .onChange((value) => layer.setGlobalStateProperty("waterOpacity", value));
  gui.add(options, "clear").name("清除选中");
  gui.add(options, "tilt").name("倾斜");
  const ruleFolder = gui.addFolder("动态绘制规则");
  const rules = {
    lineWidth: 24,
    buildingHeight: 80,
    textSize: 18,
    waterVisible: true,
    labelsVisible: true,
    reset: () => {
      layer.setPaintProperty(
        "road",
        "line-width",
        style.layers[3].paint["line-width"],
      );
      layer.setPaintProperty(
        "building",
        "fill-extrusion-height",
        style.layers[4].paint["fill-extrusion-height"],
      );
      layer.setLayoutProperty(
        "poi",
        "text-size",
        style.layers[6].layout["text-size"],
      );
      layer.setLayoutProperty("water", "visibility", null);
      layer.setFilter("poi", null);
      Object.assign(rules, {
        lineWidth: 24,
        buildingHeight: 80,
        textSize: 18,
        waterVisible: true,
        labelsVisible: true,
      });
      for (const controller of ruleFolder.controllers) {
        controller.updateDisplay();
      }
      status.textContent = "已恢复初始绘制规则，选中状态保留";
    },
    export: () => {
      const blob = new window.Blob(
        [JSON.stringify(layer.getStyle(), null, 2)],
        {
          type: "application/json",
        },
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "vector-style.json";
      link.click();
      window.URL.revokeObjectURL(url);
      status.textContent = "已导出当前样式；临时选中状态不在样式内";
    },
  };
  ruleFolder
    .add(rules, "lineWidth", 1, 60, 1)
    .name("道路宽度")
    .onChange((value) => layer.setPaintProperty("road", "line-width", value));
  ruleFolder
    .add(rules, "buildingHeight", 0, 200, 5)
    .name("建筑高度")
    .onChange((value) =>
      layer.setPaintProperty("building", "fill-extrusion-height", value),
    );
  ruleFolder
    .add(rules, "textSize", 10, 36, 1)
    .name("标注字号")
    .onChange((value) => layer.setLayoutProperty("poi", "text-size", value));
  ruleFolder
    .add(rules, "waterVisible")
    .name("显示水面")
    .onChange((value) =>
      layer.setLayoutProperty("water", "visibility", value ? null : "none"),
    );
  ruleFolder
    .add(rules, "labelsVisible")
    .name("显示标注")
    .onChange((value) =>
      layer.setFilter("poi", value ? null : ["==", ["id"], ""]),
    );
  ruleFolder.add(rules, "reset").name("恢复初始规则");
  ruleFolder.add(rules, "export").name("导出当前样式");
  const handler = new C.ScreenSpaceEventHandler(scene.canvas);
  handler.setInputAction(({ position }) => {
    const picked = scene.pick(position);
    options.clear();
    if (picked?.primitive === layer && picked.id.featureId !== undefined) {
      selected = {
        source: picked.id.source,
        sourceLayer: picked.id.sourceLayer,
        id: picked.id.featureId,
      };
      layer.setFeatureState(selected, { selected: true });
    }
    status.textContent =
      picked?.primitive === layer
        ? `${picked.id.styleLayer} / ${picked.id.featureId}`
        : "未拾取要素";
  }, C.ScreenSpaceEventType.LEFT_CLICK);
  view(true);
  window.vectorEnhancements = { viewer, layer, gui };
  window.addEventListener("pagehide", (event) => {
    if (event.persisted || viewer.isDestroyed()) {
      return;
    }
    handler.destroy();
    gui.destroy();
    viewer.destroy();
  });
}
