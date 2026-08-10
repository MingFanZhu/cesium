import * as Cesium from "cesium";

const OPENSTREETMAP_TILE_ENDPOINT =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TERRAIN_TILE_ENDPOINT =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/{z}/{y}/{x}";
const WEB_MERCATOR_LIMIT = 20037508.342789244;
const contentCenter = new Cesium.Cartesian3(12958000.0, 4853000.0, 0.0);

const world = new Cesium.SceneGISPlanarWorld({
  coordinateSystem: new Cesium.SceneGISPlanarCoordinateSystem({
    extent: new Cesium.SceneGISPlanarExtent({
      minimumX: -WEB_MERCATOR_LIMIT,
      minimumY: -WEB_MERCATOR_LIMIT,
      maximumX: WEB_MERCATOR_LIMIT,
      maximumY: WEB_MERCATOR_LIMIT,
    }),
    crs: "EPSG:3857",
  }),
  maximumLevel: 16,
  baseColor: Cesium.Color.fromCssColorString("#263238"),
});

const openStreetMapCredit = new Cesium.Credit(
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
  true,
);
world.imageryLayers.addImageryProvider(
  new Cesium.SceneGISPlanarUrlTemplateImageryProvider({
    url: OPENSTREETMAP_TILE_ENDPOINT,
    tilingScheme: world.tilingScheme,
    urlScheme: "xyz",
    tileWidth: 256,
    tileHeight: 256,
    maximumLevel: 16,
    credit: openStreetMapCredit,
  }),
);

const terrainProvider =
  new Cesium.SceneGISPlanarUrlTemplateHeightmapTerrainProvider({
    url: TERRAIN_TILE_ENDPOINT,
    tilingScheme: world.tilingScheme,
    urlScheme: "xyz",
    heightmapWidth: 257,
    heightmapHeight: 257,
    format: "lerc",
    minimumHeight: -450.0,
    maximumHeight: 8700.0,
    maximumLevel: 16,
    credit: new Cesium.Credit(
      '<a href="https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer" target="_blank">World Elevation services by Esri and listed contributors</a>',
      true,
    ),
  });
world.terrainProvider = terrainProvider;

const status = document.querySelector("#contentStatus");
terrainProvider.errorEvent.addEventListener((error) => {
  status.textContent =
    "Terrain is unavailable; content uses resident ancestors or the flat Z=0 fallback.";
  error.retry = false;
});

const viewer = new Cesium.Viewer("cesiumContainer", {
  world,
  skyBox: Cesium.SkyBox.createEarthSkyBox(),
});

const image = document.createElement("canvas");
image.width = 24;
image.height = 24;
const imageContext = image.getContext("2d");
imageContext.fillStyle = "#00ffff";
imageContext.fillRect(0, 0, 24, 24);
imageContext.fillStyle = "#003344";
imageContext.fillRect(6, 6, 12, 12);

const point = viewer.entities.add({
  id: "planar-point",
  name: "Absolute point",
  description: "A selectable Point with absolute planar Z.",
  position: new Cesium.Cartesian3(
    contentCenter.x - 450.0,
    contentCenter.y,
    120.0,
  ),
  point: {
    pixelSize: 18,
    color: Cesium.Color.RED,
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 2,
  },
});

viewer.entities.add({
  id: "planar-billboard",
  name: "Clamped billboard",
  description: "A local canvas Billboard clamped to resident planar terrain.",
  position: new Cesium.Cartesian3(
    contentCenter.x - 220.0,
    contentCenter.y,
    0.0,
  ),
  billboard: {
    image,
    width: 36,
    height: 36,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
  },
});

const label = viewer.entities.add({
  id: "planar-label",
  name: "Relative label",
  description: "A Label kept 80 meters above the resident planar surface.",
  position: new Cesium.Cartesian3(contentCenter.x, contentCenter.y, 80.0),
  label: {
    text: "SceneGIS planar content",
    font: "22px sans-serif",
    fillColor: Cesium.Color.YELLOW,
    showBackground: true,
    backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
    heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
  },
});

viewer.entities.add({
  id: "planar-model",
  name: "Relative local model",
  description: "A repository-local glTF Model with fixed planar orientation.",
  position: new Cesium.Cartesian3(
    contentCenter.x + 260.0,
    contentCenter.y,
    20.0,
  ),
  model: {
    uri: "../../SampleData/models/CesiumMan/Cesium_Man.glb",
    scale: 20.0,
    minimumPixelSize: 48,
    heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
  },
});

viewer.entities.add({
  id: "planar-polyline",
  name: "Clamped planar polyline",
  description:
    "A straight planar Polyline continuously draped over the current rendered terrain cover.",
  polyline: {
    positions: [
      new Cesium.Cartesian3(
        contentCenter.x - 500.0,
        contentCenter.y - 260.0,
        0.0,
      ),
      new Cesium.Cartesian3(contentCenter.x, contentCenter.y - 180.0, 0.0),
      new Cesium.Cartesian3(
        contentCenter.x + 500.0,
        contentCenter.y - 260.0,
        0.0,
      ),
    ],
    width: 8,
    material: Cesium.Color.CYAN,
    arcType: Cesium.ArcType.NONE,
    clampToGround: true,
  },
});

viewer.entities.add({
  id: "planar-polygon",
  name: "Extruded planar polygon",
  description: "A selectable planar Polygon with fill, outline, and extrusion.",
  position: new Cesium.Cartesian3(contentCenter.x, contentCenter.y, 20.0),
  polygon: {
    hierarchy: new Cesium.PolygonHierarchy([
      new Cesium.Cartesian3(
        contentCenter.x - 180.0,
        contentCenter.y + 180.0,
        0.0,
      ),
      new Cesium.Cartesian3(
        contentCenter.x + 180.0,
        contentCenter.y + 180.0,
        0.0,
      ),
      new Cesium.Cartesian3(
        contentCenter.x + 180.0,
        contentCenter.y + 500.0,
        0.0,
      ),
      new Cesium.Cartesian3(
        contentCenter.x - 180.0,
        contentCenter.y + 500.0,
        0.0,
      ),
    ]),
    height: 20.0,
    extrudedHeight: 0.0,
    heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
    extrudedHeightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    material: Cesium.Color.LIME.withAlpha(0.65),
    outline: true,
    outlineColor: Cesium.Color.WHITE,
    outlineWidth: 2,
  },
});

const solidCenter = new Cesium.Cartesian3(
  contentCenter.x - 900.0,
  contentCenter.y + 900.0,
  0.0,
);
viewer.entities.add({
  id: "planar-box",
  name: "Planar Box",
  position: new Cesium.Cartesian3(solidCenter.x, solidCenter.y, 90.0),
  box: {
    dimensions: new Cesium.Cartesian3(140.0, 180.0, 180.0),
    material: Cesium.Color.CORNFLOWERBLUE,
  },
});
viewer.entities.add({
  id: "planar-cylinder",
  name: "Planar Cylinder",
  position: new Cesium.Cartesian3(solidCenter.x + 260.0, solidCenter.y, 100.0),
  cylinder: {
    length: 200.0,
    topRadius: 60.0,
    bottomRadius: 90.0,
    slices: 24,
    material: Cesium.Color.ORANGE,
  },
});
viewer.entities.add({
  id: "planar-ellipsoid",
  name: "Planar Ellipsoid",
  position: new Cesium.Cartesian3(solidCenter.x + 520.0, solidCenter.y, 100.0),
  ellipsoid: {
    radii: new Cesium.Cartesian3(90.0, 120.0, 100.0),
    material: Cesium.Color.VIOLET,
  },
});

viewer.entities.add({
  id: "planar-plane",
  name: "Planar Plane",
  position: new Cesium.Cartesian3(
    contentCenter.x,
    contentCenter.y + 900.0,
    90.0,
  ),
  plane: {
    plane: new Cesium.Plane(Cesium.Cartesian3.UNIT_Z, 0.0),
    dimensions: new Cesium.Cartesian2(220.0, 140.0),
    material: Cesium.Color.SKYBLUE,
  },
});
viewer.entities.add({
  id: "planar-ellipse",
  name: "Planar Ellipse",
  position: new Cesium.Cartesian3(
    contentCenter.x + 330.0,
    contentCenter.y + 900.0,
    0.0,
  ),
  ellipse: {
    semiMajorAxis: 130.0,
    semiMinorAxis: 80.0,
    height: 70.0,
    rotation: Math.PI / 6.0,
    material: Cesium.Color.GOLD.withAlpha(0.75),
  },
});
viewer.entities.add({
  id: "planar-rectangle",
  name: "Planar Rectangle",
  rectangle: {
    coordinates: new Cesium.Rectangle(
      contentCenter.x + 520.0,
      contentCenter.y + 820.0,
      contentCenter.x + 760.0,
      contentCenter.y + 980.0,
    ),
    height: 70.0,
    rotation: Math.PI / 10.0,
    material: Cesium.Color.LIGHTGREEN.withAlpha(0.75),
  },
});

viewer.entities.add({
  id: "planar-corridor",
  name: "Planar Corridor",
  corridor: {
    positions: [
      new Cesium.Cartesian3(
        contentCenter.x - 900.0,
        contentCenter.y + 1450.0,
        0.0,
      ),
      new Cesium.Cartesian3(
        contentCenter.x - 650.0,
        contentCenter.y + 1600.0,
        0.0,
      ),
      new Cesium.Cartesian3(
        contentCenter.x - 400.0,
        contentCenter.y + 1450.0,
        0.0,
      ),
    ],
    width: 80.0,
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    material: Cesium.Color.DEEPSKYBLUE,
  },
});
viewer.entities.add({
  id: "planar-wall",
  name: "Planar Wall",
  wall: {
    positions: [
      new Cesium.Cartesian3(
        contentCenter.x - 250.0,
        contentCenter.y + 1450.0,
        100.0,
      ),
      new Cesium.Cartesian3(contentCenter.x, contentCenter.y + 1550.0, 180.0),
      new Cesium.Cartesian3(
        contentCenter.x + 250.0,
        contentCenter.y + 1450.0,
        120.0,
      ),
    ],
    material: Cesium.Color.CRIMSON.withAlpha(0.75),
  },
});
viewer.entities.add({
  id: "planar-polyline-volume",
  name: "Planar Polyline Volume",
  polylineVolume: {
    positions: [
      new Cesium.Cartesian3(
        contentCenter.x + 400.0,
        contentCenter.y + 1450.0,
        100.0,
      ),
      new Cesium.Cartesian3(
        contentCenter.x + 750.0,
        contentCenter.y + 1550.0,
        100.0,
      ),
    ],
    shape: [
      new Cesium.Cartesian2(-30.0, -30.0),
      new Cesium.Cartesian2(30.0, -30.0),
      new Cesium.Cartesian2(30.0, 30.0),
      new Cesium.Cartesian2(-30.0, 30.0),
    ],
    material: Cesium.Color.LIGHTSEAGREEN,
  },
});

const pathPositions = new Cesium.SampledPositionProperty();
pathPositions.addSample(
  Cesium.JulianDate.addSeconds(
    viewer.clock.currentTime,
    -60.0,
    new Cesium.JulianDate(),
  ),
  new Cesium.Cartesian3(
    contentCenter.x - 350.0,
    contentCenter.y + 1850.0,
    140.0,
  ),
);
pathPositions.addSample(
  Cesium.JulianDate.addSeconds(
    viewer.clock.currentTime,
    60.0,
    new Cesium.JulianDate(),
  ),
  new Cesium.Cartesian3(
    contentCenter.x + 350.0,
    contentCenter.y + 1850.0,
    180.0,
  ),
);
viewer.entities.add({
  id: "planar-path",
  name: "Fixed planar Path",
  position: pathPositions,
  path: {
    leadTime: 60.0,
    trailTime: 60.0,
    width: 6.0,
    material: Cesium.Color.WHITE,
  },
});

const directOrdinary = viewer.scene.primitives.add(
  new Cesium.SceneGISPlanarPrimitive({
    geometry: new Cesium.SceneGISPlanarPolygonGeometry({
      positions: [
        new Cesium.Cartesian3(
          contentCenter.x - 260.0,
          contentCenter.y + 2200.0,
          130.0,
        ),
        new Cesium.Cartesian3(
          contentCenter.x - 40.0,
          contentCenter.y + 2200.0,
          130.0,
        ),
        new Cesium.Cartesian3(
          contentCenter.x - 40.0,
          contentCenter.y + 2380.0,
          130.0,
        ),
        new Cesium.Cartesian3(
          contentCenter.x - 260.0,
          contentCenter.y + 2380.0,
          130.0,
        ),
      ],
    }),
    appearance: new Cesium.PerInstanceColorAppearance({ flat: true }),
    attributes: {
      color: Cesium.ColorGeometryInstanceAttribute.fromColor(Cesium.Color.BLUE),
    },
    id: "direct-planar-primitive",
  }),
);
const directGround = viewer.scene.primitives.add(
  new Cesium.SceneGISPlanarGroundPrimitive({
    world,
    geometry: new Cesium.SceneGISPlanarPolylineGeometry({
      positions: [
        new Cesium.Cartesian3(
          contentCenter.x + 80.0,
          contentCenter.y + 2280.0,
          0.0,
        ),
        new Cesium.Cartesian3(
          contentCenter.x + 520.0,
          contentCenter.y + 2280.0,
          0.0,
        ),
      ],
      width: 14.0,
    }),
    appearance: new Cesium.PolylineMaterialAppearance({
      material: Cesium.Material.fromType(Cesium.Material.ColorType, {
        color: Cesium.Color.MAGENTA,
      }),
    }),
    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
    id: "direct-planar-ground-primitive",
  }),
);
void directOrdinary;
void directGround;

function viewContent() {
  viewer.scene.camera.setView({
    destination: new Cesium.Cartesian3(
      contentCenter.x,
      contentCenter.y - 1500.0,
      1300.0,
    ),
    orientation: {
      direction: new Cesium.Cartesian3(0.0, 0.75, -0.6614378278),
      up: new Cesium.Cartesian3(0.0, 0.6614378278, 0.75),
    },
  });
}

function viewGroup(northOffset) {
  viewer.scene.camera.setView({
    destination: new Cesium.Cartesian3(
      contentCenter.x,
      contentCenter.y + northOffset - 1200.0,
      1100.0,
    ),
    orientation: {
      direction: new Cesium.Cartesian3(0.0, 0.75, -0.6614378278),
      up: new Cesium.Cartesian3(0.0, 0.6614378278, 0.75),
    },
  });
}

let dynamicStep = 0;
const dynamicToggle = document.querySelector("#dynamicToggle");
dynamicToggle.addEventListener("change", () => {
  if (!dynamicToggle.checked) {
    return;
  }
  dynamicStep = 0;
  point.position = new Cesium.Cartesian3(
    contentCenter.x - 450.0,
    contentCenter.y,
    120.0,
  );
  label.label.text = "Finite dynamic step 0/120";
  status.textContent = "Started a finite 120-step dynamic run.";
});
viewer.scene.preUpdate.addEventListener(() => {
  if (!dynamicToggle.checked) {
    return;
  }
  dynamicStep++;
  const offset = Math.sin(dynamicStep * 0.08) * 80.0;
  point.position = new Cesium.Cartesian3(
    contentCenter.x - 450.0,
    contentCenter.y + offset,
    120.0,
  );
  label.label.text = `Finite dynamic step ${dynamicStep}/120`;
  if (dynamicStep >= 120) {
    dynamicToggle.checked = false;
    status.textContent = "Finite dynamic run completed and stopped.";
  }
});

const batch = new Cesium.CustomDataSource("representative-batch");
let batchDesiredPresent = false;
let batchSyncPromise;

function populateBatch() {
  if (batch.entities.values.length !== 0) {
    return;
  }
  for (let i = 0; i < 32; ++i) {
    batch.entities.add({
      id: `batch-point-${i}`,
      position: new Cesium.Cartesian3(
        contentCenter.x - 620.0 + (i % 8) * 55.0,
        contentCenter.y + 650.0 + Math.floor(i / 8) * 55.0,
        30.0,
      ),
      point: { pixelSize: 7, color: Cesium.Color.ORANGE },
    });
  }
}

async function synchronizeBatch() {
  try {
    while (viewer.dataSources.contains(batch) !== batchDesiredPresent) {
      if (batchDesiredPresent) {
        populateBatch();
        status.textContent = "Adding the representative batch...";
        await viewer.dataSources.add(batch);
        if (batchDesiredPresent) {
          status.textContent =
            "Added a representative 32-Point CustomDataSource batch.";
        }
      } else {
        status.textContent = "Removing the representative batch...";
        viewer.dataSources.remove(batch, false);
        batch.entities.removeAll();
        status.textContent =
          "Removed the representative batch and released its visualizers.";
      }
    }
  } catch (error) {
    batchDesiredPresent = viewer.dataSources.contains(batch);
    if (!batchDesiredPresent) {
      batch.entities.removeAll();
    }
    status.textContent = `Batch operation failed: ${error.message}`;
  }
}

function startBatchSync() {
  if (batchSyncPromise !== undefined) {
    return;
  }
  batchSyncPromise = Promise.resolve()
    .then(synchronizeBatch)
    .finally(() => {
      batchSyncPromise = undefined;
      if (viewer.dataSources.contains(batch) !== batchDesiredPresent) {
        startBatchSync();
      }
    });
}

function requestBatchState(present) {
  batchDesiredPresent = present;
  startBatchSync();
}

document.querySelector("#contentView").addEventListener("click", viewContent);
document
  .querySelector("#solidView")
  .addEventListener("click", () => viewGroup(900.0));
document
  .querySelector("#routeView")
  .addEventListener("click", () => viewGroup(1550.0));
document
  .querySelector("#directView")
  .addEventListener("click", () => viewGroup(2280.0));
document.querySelector("#homeView").addEventListener("click", () => {
  viewer.planarCameraController.viewHome(viewer.scene);
});
document.querySelector("#addBatch").addEventListener("click", () => {
  requestBatchState(true);
});
document.querySelector("#removeBatch").addEventListener("click", () => {
  requestBatchState(false);
});

viewContent();
