/* global document, window */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

async function main() {
  const origin = 13000000;
  const viewer = new C.Viewer("map", {
    planarWorld: {
      extent: {
        minimumX: origin - 180,
        minimumY: origin - 180,
        maximumX: origin + 180,
        maximumY: origin + 180,
      },
      maximumLevel: 0,
      baseColor: C.Color.fromCssColorString("#708579"),
    },
    animation: false,
    timeline: false,
    homeButton: false,
    fullscreenButton: false,
  });
  const gui = new GUI({ container: document.getElementById("controls") });
  exposeExample(viewer, gui);
  const point = (x, y, z = 0) => new C.Cartesian3(origin + x, origin + y, z);
  const matrix = (x) => C.Matrix4.fromTranslation(point(x, 0, 20));
  const url = "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf";
  const model = viewer.scene.primitives.add(
    await C.Model.fromGltfAsync({
      url,
      modelMatrix: matrix(-28),
      scale: 40,
      color: C.Color.fromCssColorString("#5dd6d2"),
      colorBlendMode: C.ColorBlendMode.REPLACE,
    }),
  );
  const tileTransform = C.Matrix4.multiplyByUniformScale(
    matrix(28),
    40,
    new C.Matrix4(),
  );
  const tileset = viewer.scene.primitives.add(
    await C.Cesium3DTileset.fromUrl(
      `data:application/json,${encodeURIComponent(
        JSON.stringify({
          asset: { version: "1.1" },
          geometricError: 1000,
          root: {
            boundingVolume: { box: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] },
            geometricError: 0,
            content: { uri: new window.URL(url, window.location.href).href },
          },
        }),
      )}`,
      { modelMatrix: tileTransform },
    ),
  );
  tileset.style = new C.Cesium3DTileStyle({ color: "color('#edbd74')" });
  const settings = {
    enabled: true,
    inverse: false,
    secondRegion: true,
    regionOffset: 0,
    modelOffset: 0,
    terrain: false,
    overhead() {
      viewer.camera.setView({
        destination: point(0, 0, 190),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      });
    },
    perspective() {
      viewer.camera.setView({
        destination: point(0, -135, 150),
        orientation: {
          direction: new C.Cartesian3(0, 0.72, -0.69),
          up: new C.Cartesian3(0, 0.69, 0.72),
        },
      });
    },
  };
  const polygon = (center, x, y) =>
    new C.ClippingPolygon({
      positions: [
        [-6, -6],
        [6, -6],
        [6, 6],
        [-6, 6],
      ].map(([dx, dy]) => point(center + x + dx, y + dy)),
    });
  const groups = [-28, 28].map((center) => [
    polygon(center, -9, -8),
    polygon(center, 9, 8),
  ]);
  const collections = groups.map(
    (polygons) => new C.ClippingPolygonCollection({ polygons }),
  );
  model.clippingPolygons = collections[0];
  tileset.clippingPolygons = collections[1];
  viewer.planarWorld.clippingPolygons = new C.ClippingPolygonCollection({
    polygons: groups
      .flat()
      .map((p) => new C.ClippingPolygon({ positions: p.positions })),
    enabled: false,
  });
  function update() {
    collections.forEach((collection, i) => {
      collection.enabled = settings.enabled;
      collection.inverse = settings.inverse;
      const second = groups[i][1];
      if (settings.secondRegion && !collection.contains(second)) {
        collection.add(second);
      }
      if (!settings.secondRegion && collection.contains(second)) {
        collection.remove(second);
      }
      const center = i === 0 ? -28 : 28;
      groups[i].forEach((p, j) => {
        const fresh = polygon(
          center + settings.regionOffset,
          j === 0 ? -9 : 9,
          j === 0 ? -8 : 8,
        );
        p.positions.forEach((position, k) =>
          C.Cartesian3.clone(fresh.positions[k], position),
        );
      });
    });
    model.modelMatrix = matrix(-28 + settings.modelOffset);
    tileset.modelMatrix = C.Matrix4.multiplyByUniformScale(
      matrix(28 + settings.modelOffset),
      40,
      new C.Matrix4(),
    );
    viewer.planarWorld.clippingPolygons.enabled = settings.terrain;
    viewer.scene.requestRender();
  }
  gui.add(settings, "enabled").name("启用模型裁剪").onChange(update);
  gui.add(settings, "inverse").name("反向保留区域").onChange(update);
  gui.add(settings, "secondRegion").name("第二个区域").onChange(update);
  gui
    .add(settings, "regionOffset", -20, 20, 0.1)
    .name("裁剪范围偏移 / 米")
    .onChange(update);
  gui
    .add(settings, "modelOffset", -12, 12, 0.1)
    .name("模型位置偏移 / 米")
    .onChange(update);
  gui.add(settings, "terrain").name("独立裁剪地形").onChange(update);
  gui.add(settings, "overhead").name("俯视");
  gui.add(settings, "perspective").name("斜视");
  settings.perspective();
  Object.assign(window.example, { model, tileset, collections, settings });
  document.getElementById("status").textContent =
    "本地模型已就绪 · 世界坐标偏移 1300 万米";
}

main().catch((error) => {
  document.getElementById("error").textContent = error.stack ?? error.message;
});
