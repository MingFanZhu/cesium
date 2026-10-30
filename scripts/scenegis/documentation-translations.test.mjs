import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";
import translations from "../docs-i18n/doclets.cjs";

const root = new URL("../../Build/SceneGIS/Documentation/", import.meta.url);
const load = async (filename) =>
  JSON.parse(await readFile(new URL(filename, root), "utf8"));
const metadata = await load("api-doclets.json");
const report = await load("translation-report.json");
const source = await load("translation-source.json");
const lookup = new Map(metadata.doclets.map((doclet) => [doclet.id, doclet]));
const roots = new Set([
  "Scene",
  "Camera",
  "Viewer",
  "CesiumWidget",
  "Globe",
  "ImageryLayer",
  "ImageryLayerCollection",
  "Cesium3DTileset",
  "Cesium3DTileFeature",
  "Cesium3DTileStyle",
  "Primitive",
  "PrimitiveCollection",
  "GroundPrimitive",
  "Entity",
  "EntityCollection",
  "GeoJsonDataSource",
  "CustomDataSource",
  "DataSourceCollection",
  "Cartesian2",
  "Cartesian3",
  "Cartesian4",
  "Cartographic",
  "Rectangle",
  "Ellipsoid",
  "Matrix2",
  "Matrix3",
  "Matrix4",
  "Quaternion",
  "HeadingPitchRoll",
  "Transforms",
  "Color",
  "BoundingSphere",
  "BoundingRectangle",
  "OrientedBoundingBox",
  "Ray",
  "Plane",
  "IntersectionTests",
  "module:Math",
  "Resource",
  "IonResource",
  "Request",
  "RequestScheduler",
  "RequestType",
  "RequestState",
  "Event",
  "EventHelper",
  "Clock",
  "ClockViewModel",
  "ClockRange",
  "ClockStep",
  "JulianDate",
  "GregorianDate",
  "LeapSecond",
  "TimeStandard",
  "TimeInterval",
  "TimeIntervalCollection",
  "MapProjection",
  "GeographicProjection",
  "WebMercatorProjection",
  "TilingScheme",
  "GeographicTilingScheme",
  "WebMercatorTilingScheme",
  "Model",
  "ModelFeature",
  "ModelNode",
  "ModelAnimation",
  "ModelAnimationCollection",
  "ModelAnimationLoop",
  "Billboard",
  "BillboardCollection",
  "Label",
  "LabelCollection",
  "LabelStyle",
  "HorizontalOrigin",
  "VerticalOrigin",
  "PointPrimitive",
  "PointPrimitiveCollection",
  "Polyline",
  "PolylineCollection",
  "Appearance",
  "Material",
  "MaterialAppearance",
  "EllipsoidSurfaceAppearance",
  "PerInstanceColorAppearance",
  "PolylineMaterialAppearance",
  "PolylineColorAppearance",
  "DebugAppearance",
  "ClassificationPrimitive",
  "GroundPolylinePrimitive",
  "ClippingPlane",
  "ClippingPlaneCollection",
  "ClippingPolygon",
  "ClippingPolygonCollection",
  "PostProcessStage",
  "PostProcessStageCollection",
  "PostProcessStageComposite",
  "PostProcessStageLibrary",
  "PostProcessStageSampleMode",
  "Tonemapper",
  "CustomShader",
  "CustomShaderMode",
  "CustomShaderTranslucencyMode",
  "LightingModel",
  "UniformType",
  "VaryingType",
  "TextureUniform",
  "UniformSpecifier",
  "Atmosphere",
  "SkyAtmosphere",
  "Fog",
  "SkyBox",
  "Sun",
  "SunLight",
  "Moon",
  "DirectionalLight",
  "Light",
  "DynamicAtmosphereLightingType",
  "DynamicEnvironmentMapManager",
  "ImageBasedLighting",
  "GlobeTranslucency",
  "ShadowMap",
  "ShadowMode",
  "PointCloudShading",
  "TimeDynamicPointCloud",
  "ParticleSystem",
  "Particle",
  "ParticleBurst",
  "ParticleEmitter",
  "BoxEmitter",
  "CircleEmitter",
  "ConeEmitter",
  "SphereEmitter",
  "BlendOption",
  "ClassificationType",
  "Cesium3DTileColorBlendMode",
  "ColorBlendMode",
  "HeightReference",
  "DistanceDisplayCondition",
  "NearFarScalar",
  "CloudCollection",
  "CloudType",
  "CumulusCloud",
  "BillboardGraphics",
  "BillboardVisualizer",
  "BoxGeometryUpdater",
  "BoxGraphics",
  "CallbackPositionProperty",
  "CallbackProperty",
  "Cesium3DTilesetGraphics",
  "Cesium3DTilesetVisualizer",
  "CheckerboardMaterialProperty",
  "ColorMaterialProperty",
  "CompositeEntityCollection",
  "CompositeMaterialProperty",
  "CompositePositionProperty",
  "CompositeProperty",
  "ConstantPositionProperty",
  "ConstantProperty",
  "CorridorGeometryUpdater",
  "CorridorGraphics",
  "CylinderGeometryUpdater",
  "CylinderGraphics",
  "CzmlDataSource",
  "DataSource",
  "DataSourceClock",
  "DataSourceDisplay",
  "EllipseGeometryUpdater",
  "EllipseGraphics",
  "EllipsoidGeometryUpdater",
  "EllipsoidGraphics",
  "EntityCluster",
  "EntityView",
  "ExtrapolationType",
  "GeometryUpdater",
  "GeometryVisualizer",
  "GpxDataSource",
  "GridMaterialProperty",
  "GroundGeometryUpdater",
  "ImageMaterialProperty",
  "KmlCamera",
  "KmlDataSource",
  "KmlLookAt",
  "KmlTour",
  "KmlTourFlyTo",
  "KmlTourWait",
  "LabelGraphics",
  "LabelVisualizer",
  "MaterialProperty",
  "ModelGraphics",
  "ModelVisualizer",
  "NodeTransformationProperty",
  "PathGraphics",
  "PathVisualizer",
  "PlaneGeometryUpdater",
  "PlaneGraphics",
  "PointGraphics",
  "PointVisualizer",
  "PolygonGeometryUpdater",
  "PolygonGraphics",
  "PolylineArrowMaterialProperty",
  "PolylineDashMaterialProperty",
  "PolylineGeometryUpdater",
  "PolylineGlowMaterialProperty",
  "PolylineGraphics",
  "PolylineOutlineMaterialProperty",
  "PolylineVisualizer",
  "PolylineVolumeGeometryUpdater",
  "PolylineVolumeGraphics",
  "PositionProperty",
  "PositionPropertyArray",
  "Property",
  "PropertyArray",
  "PropertyBag",
  "RectangleGeometryUpdater",
  "RectangleGraphics",
  "ReferenceFrame",
  "ReferenceProperty",
  "SampledPositionProperty",
  "SampledProperty",
  "StripeMaterialProperty",
  "StripeOrientation",
  "TimeIntervalCollectionPositionProperty",
  "TimeIntervalCollectionProperty",
  "TrackingReferenceFrame",
  "VelocityOrientationProperty",
  "VelocityVectorProperty",
  "Visualizer",
  "WallGeometryUpdater",
  "WallGraphics",
  "exportKml",
  "exportKmlModelCallback",
  "exportKmlResultKml",
  "exportKmlResultKmz",
  "ImageryProvider",
  "Terrain",
  "TerrainProvider",
  "TerrainData",
  "HeightmapEncoding",
  "ArcGisMapServerImageryProvider",
  "ArcGISTiledElevationTerrainProvider",
  "Azure2DImageryProvider",
  "BingMapsImageryProvider",
  "Cesium3DTilesTerrainData",
  "Cesium3DTilesTerrainProvider",
  "CesiumTerrainProvider",
  "createWorldImageryAsync",
  "createWorldTerrainAsync",
  "CustomHeightmapTerrainProvider",
  "EllipsoidTerrainProvider",
  "Google2DImageryProvider",
  "GoogleEarthEnterpriseImageryProvider",
  "GoogleEarthEnterpriseTerrainData",
  "GoogleEarthEnterpriseTerrainProvider",
  "GridImageryProvider",
  "HeightmapTerrainData",
  "IonImageryProvider",
  "MapboxImageryProvider",
  "MapboxStyleImageryProvider",
  "OpenStreetMapImageryProvider",
  "QuantizedMeshTerrainData",
  "sampleTerrain",
  "sampleTerrainMostDetailed",
  "SingleTileImageryProvider",
  "TileCoordinatesImageryProvider",
  "TileMapServiceImageryProvider",
  "UrlTemplateImageryProvider",
  "VRTheWorldTerrainProvider",
  "WebMapServiceImageryProvider",
  "WebMapTileServiceImageryProvider",
]);

test("reviewed native API roots have complete source-bound prose translations", () => {
  const selected = report.units.filter((unit) =>
    roots.has(unit.id.split(/[.#~]/, 1)[0]),
  );
  assert.ok(selected.length > 1400);
  const visited = new Set();
  for (const unit of selected) {
    visited.add(unit.id.split(/[.#~]/, 1)[0]);
    assert.equal(unit.status, "translated", `${unit.id} ${unit.field}`);
  }
  assert.deepEqual(visited, roots);
  assert.equal(report.counts.stale, 0);
  assert.equal(report.counts.unused, 0);
});

test("foundation prose preserves storage order, homogeneous coordinates and verified bounds", () => {
  const matrix = lookup.get("Matrix4").classdesc;
  assert.match(matrix, /列主序/);
  assert.match(matrix, /行主序/);
  assert.match(lookup.get("Matrix4.multiplyByPoint").description, /分量为 1/);
  assert.match(
    lookup.get("Matrix4.multiplyByPointAsVector").description,
    /分量为零/,
  );
  assert.match(
    lookup.get("Matrix4.inverseTransformation").description,
    /不会验证/,
  );
  assert.match(lookup.get("BoundingSphere#volume").description, /体积/);
  const random = lookup.get("Color.fromRandom");
  for (const component of ["Red", "Green", "Blue", "Alpha"]) {
    assert.match(
      random.params.find((p) => p.name === `options.minimum${component}`)
        .description,
      /最小值/,
    );
    assert.match(
      random.params.find((p) => p.name === `options.maximum${component}`)
        .description,
      /最大值/,
    );
  }
  assert.match(
    lookup.get("module:Math.clampToLatitudeRange").description,
    /Math.PI\/2<\/code>\]/,
  );
  assert.match(
    lookup.get("Transforms.headingPitchRollToFixedFrame").description,
    /向上轴负向旋转/,
  );
});

test("loading and time prose preserves scheduling, context, units and interval contracts", () => {
  assert.match(
    lookup.get("Resource#fetch").returns[0].description,
    /返回 undefined/,
  );
  assert.match(lookup.get("Resource#fetch").description, /CORS/);
  assert.match(
    lookup.get("Resource#setTemplateValues").description,
    /新值覆盖已有同名值/,
  );
  assert.match(
    lookup.get("Resource#setTemplateValues").description,
    /useAsDefault/,
  );
  assert.match(lookup.get("Terrain#ready").description, /地形提供者/);
  assert.match(lookup.get("ImageryLayer#ready").description, /影像提供者/);
  assert.match(
    lookup.get("TerrainProvider.getRegularGridIndices").description,
    /4,294,967,296/,
  );
  assert.match(
    lookup.get("TerrainProvider.getRegularGridIndices").returns[0].description,
    /顶点数量，而非缓冲区字节数/,
  );
  assert.match(lookup.get("JulianDate").classdesc, /国际原子时/);
  assert.match(lookup.get("JulianDate.equalsEpsilon").description, /小于等于/);
  assert.match(lookup.get("ClockStep.TICK_DEPENDENT").description, /固定步长/);
  assert.match(
    lookup.get("TimeIntervalCollection#addInterval").description,
    /新区间的数据优先/,
  );
  assert.match(
    lookup.get("sampleTerrainMostDetailed").returns[0].description,
    /availability.*undefined.*拒绝/,
  );
  const childMask = (id) =>
    lookup.get(id).params.find((p) => p.name === "options.childTileMask")
      .description;
  assert.match(
    childMask("GoogleEarthEnterpriseTerrainData"),
    /<td>2<\/td><td>4<\/td><td>东北<\/td>/,
  );
  assert.match(
    childMask("QuantizedMeshTerrainData"),
    /<td>2<\/td><td>4<\/td><td>西北<\/td>/,
  );
});

test("rendering prose preserves sizing, ownership, clipping and verified shader behavior", () => {
  assert.match(
    lookup.get("Billboard#sizeInMeters").description,
    /true.*使用米.*使用像素/,
  );
  assert.match(lookup.get("Billboard#pixelOffset").description, /左上角/);
  assert.match(
    lookup.get("Model#readyEvent").description,
    /所有纹理加载完成.*之前/,
  );
  assert.match(
    lookup.get("ModelNode#matrix").description,
    /重新赋值.*个别元素不会生效/,
  );
  assert.match(
    lookup.get("CustomShader").description,
    /应用程序负责调用此方法/,
  );
  assert.match(
    lookup.get("ImageBasedLighting").description,
    /否则应用程序负责/,
  );
  assert.match(
    lookup.get("TextureUniform").params.find((p) => p.name === "options.repeat")
      .description,
    /false.*限制到边缘/,
  );
  assert.match(
    lookup.get("ClippingPlaneCollection#unionClippingRegions").description,
    /任意平面外侧.*全部平面外侧/,
  );
  assert.match(
    lookup.get("ClippingPolygonCollection#inverse").description,
    /全部多边形外侧.*任意多边形内部/,
  );
  assert.match(
    lookup.get("EllipsoidSurfaceAppearance#aboveGround").description,
    /默认不启用背面剔除/,
  );
  assert.match(
    lookup.get("DebugAppearance").description,
    /映射到 \[0.0, 1.0\]/,
  );
  assert.match(
    lookup.get("PostProcessStageLibrary.createBrightnessStage").description,
    /亮度.*RGB/s,
  );
  assert.match(
    lookup.get("ParticleSystem#updateCallback").description,
    /回调函数.*单位为秒/,
  );
  const asyncOption = (id) =>
    lookup.get(id).params.find((p) => p.name === "options.asynchronous")
      .description;
  assert.match(
    asyncOption("ClassificationPrimitive"),
    /不要求预先初始化地形高度/,
  );
  assert.match(
    asyncOption("GroundPolylinePrimitive"),
    /必须先调用 initializeTerrainHeights/,
  );
});

test("entity data prose preserves evaluation, frames, events and reusable resources", () => {
  assert.match(
    lookup.get("CallbackProperty.Callback").description,
    /返回属性值/,
  );
  assert.match(
    lookup.get("Resource.RetryCallback").description,
    /资源加载失败/,
  );
  assert.match(
    lookup.get("Cesium3DTilesetGraphics#uri").description,
    /3D Tiles 瓦片集/,
  );
  assert.match(lookup.get("ModelGraphics#uri").description, /glTF 资源/);
  assert.match(
    lookup.get("CompositeProperty#definitionChanged").description,
    /区间集合改变.*Property.*定义改变/,
  );
  assert.match(
    lookup.get("ConstantProperty#definitionChanged").description,
    /setValue/,
  );
  assert.match(
    lookup.get("TimeIntervalCollectionProperty#definitionChanged").description,
    /时间区间集合改变/,
  );
  assert.match(
    lookup.get("PropertyBag#getValue").params.find((p) => p.name === "result")
      .description,
    /不属于此 PropertyBag 的属性保持原样/,
  );
  assert.match(
    lookup
      .get("SampledPositionProperty#addSamplesPackedArray")
      .params.find((p) => p.name === "epoch").description,
    /历元的秒偏移/,
  );
  assert.match(
    lookup.get("SampledPositionProperty#backwardExtrapolationDuration")
      .description,
    /0 表示无限外推/,
  );
  assert.match(lookup.get("EntityCluster#destroy").description, /可再次使用/);
  assert.match(
    lookup.get("GeometryUpdater#hasConstantFill").description,
    /不随模拟时间变化/,
  );
  assert.doesNotMatch(
    lookup.get("GeometryUpdater#classificationTypeProperty").description,
    /设置/,
  );
  assert.match(
    lookup
      .get("EllipsoidGeometryUpdater#createFillGeometryInstance")
      .params.find((p) => p.name === "skipModelMatrix").description,
    /跳过/,
  );
  assert.match(
    lookup.get("CzmlDataSource.PlanarOptions").description,
    /单位为米.*X 向东.*拒绝地理位置/s,
  );
  assert.ok(lookup.get("LabelGraphics#text").description.includes("'\\n'"));
  assert.match(lookup.get("exportKml").description, /并非一一对应/);
});

test("spatial units, ownership, boundary conditions and callback limits reach metadata", () => {
  assert.match(lookup.get("Camera#heading").description, /单位为弧度/);
  assert.match(
    lookup.get("Camera#flyTo").params.find((p) => p.name === "options.duration")
      .description,
    /单位为秒/,
  );
  for (const id of ["Camera#lookAt", "Viewer#flyTo", "Viewer#zoomTo"]) {
    assert.match(
      lookup.get(id).description,
      /正值位于平面下方，负值位于平面上方/,
    );
  }
  assert.match(
    lookup
      .get("Viewer.ConstructorOptions")
      .properties.find((p) => p.name === "dataSources").description,
    /归调用者所有.*Viewer 销毁时不会销毁此集合/,
  );
  assert.match(
    lookup.get("Scene#clampToHeight").description,
    /仅对当前视图中渲染的地球瓦片和 3D Tiles/,
  );
  assert.match(
    lookup.get("Cesium3DTileset#tileVisible").description,
    /不要在事件监听器中创建或修改/,
  );
  const cache = lookup.get("Cesium3DTileset#cacheBytes").description;
  for (const literal of [
    "500000",
    "600000",
    "100000",
    "maximumCacheOverflowBytes",
  ]) {
    assert.ok(cache.includes(literal), literal);
  }
  assert.match(
    lookup.get("GeoJsonDataSource.crsLinkHrefs").description,
    /优先.*href.*再查询 crsLinkTypes/,
  );
  assert.match(
    lookup.get("GeoJsonDataSource.PlanarOptions").description,
    /不允许更改世界或投影回调/,
  );
});

test("example code embedded by malformed upstream prose parsing remains verbatim", () => {
  const original = source.units.find(
    (unit) =>
      unit.id === "ImageryLayer.fromWorldImagery" &&
      unit.field === "returns/0/description",
  );
  const catalog = translations.readCatalog(
    "Documentation/i18n/zh-CN/api",
    "zh-CN",
  );
  const translated = catalog.entries.find(
    (entry) =>
      entry.id === original.id &&
      entry.field === original.field &&
      entry.sourceHash === original.sourceHash,
  );
  const start = original.source.indexOf("* @example");
  assert.ok(start >= 0);
  assert.equal(
    translated.text.slice(translated.text.indexOf("* @example")),
    original.source.slice(start),
  );
  assert.ok(translated.text.startsWith("创建的影像图层。"));
});
