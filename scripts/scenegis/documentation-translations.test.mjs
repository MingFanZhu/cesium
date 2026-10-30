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
  "ArcType",
  "Axis",
  "AxisAlignedBoundingBox",
  "BoxGeometry",
  "BoxOutlineGeometry",
  "CatmullRomSpline",
  "CircleGeometry",
  "CircleOutlineGeometry",
  "ColorGeometryInstanceAttribute",
  "ComponentDatatype",
  "ConstantSpline",
  "CoplanarPolygonGeometry",
  "CoplanarPolygonOutlineGeometry",
  "CornerType",
  "CorridorGeometry",
  "CorridorOutlineGeometry",
  "CubicRealPolynomial",
  "CullingVolume",
  "CylinderGeometry",
  "CylinderOutlineGeometry",
  "DirectionUp",
  "DistanceDisplayConditionGeometryInstanceAttribute",
  "EasingFunction",
  "EllipseGeometry",
  "EllipseOutlineGeometry",
  "EllipsoidGeodesic",
  "EllipsoidGeometry",
  "EllipsoidOutlineGeometry",
  "EllipsoidRhumbLine",
  "EllipsoidTangentPlane",
  "FrustumGeometry",
  "FrustumOutlineGeometry",
  "GeoJsonGeometry",
  "Geometry",
  "GeometryAttribute",
  "GeometryAttributes",
  "GeometryFactory",
  "GeometryInstance",
  "GeometryInstanceAttribute",
  "GeometryPipeline",
  "GroundPolylineGeometry",
  "HeadingPitchRange",
  "HeadingPitchRollValues",
  "HermitePolynomialApproximation",
  "HermiteSpline",
  "HilbertOrder",
  "I3SGeometry",
  "IndexDatatype",
  "InterpolationAlgorithm",
  "Intersect",
  "Intersections2D",
  "Interval",
  "LagrangePolynomialApproximation",
  "LinearApproximation",
  "LinearSpline",
  "MorphWeightSpline",
  "Occluder",
  "OrthographicFrustum",
  "OrthographicOffCenterFrustum",
  "Packable",
  "PackableForInterpolation",
  "PerspectiveFrustum",
  "PerspectiveOffCenterFrustum",
  "PlaneGeometry",
  "PlaneOutlineGeometry",
  "PolygonGeometry",
  "PolygonOutlineGeometry",
  "PolylineGeometry",
  "PolylineVolumeGeometry",
  "PolylineVolumeOutlineGeometry",
  "PrimitiveType",
  "QuadraticRealPolynomial",
  "QuarticRealPolynomial",
  "QuaternionSpline",
  "RectangleGeometry",
  "RectangleOutlineGeometry",
  "Rotation",
  "ShowGeometryInstanceAttribute",
  "SimplePolylineGeometry",
  "SphereGeometry",
  "SphereOutlineGeometry",
  "Spherical",
  "Spline",
  "SteppedSpline",
  "Stereographic",
  "TranslationRotationScale",
  "TridiagonalSystemSolver",
  "VertexColorInfo",
  "VertexFormat",
  "Visibility",
  "WallGeometry",
  "WallOutlineGeometry",
  "WindingOrder",
  "barycentricCoordinates",
  "pointInsideTriangle",
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
  "Animation",
  "AnimationViewModel",
  "BaseLayerPicker",
  "BaseLayerPickerViewModel",
  "CameraEventAggregator",
  "CameraEventType",
  "Cesium3DTilesInspector",
  "Cesium3DTilesInspectorViewModel",
  "CesiumInspector",
  "CesiumInspectorViewModel",
  "Command",
  "Controller",
  "ControllerHost",
  "createCommand",
  "Fullscreen",
  "FullscreenButton",
  "FullscreenButtonViewModel",
  "Geocoder",
  "GeocoderViewModel",
  "HomeButton",
  "HomeButtonViewModel",
  "HybridScreenSpacePanCameraController",
  "I3sBslExplorerViewModel",
  "I3SBuildingSceneLayerExplorer",
  "InfoBox",
  "InfoBoxViewModel",
  "KeyboardEventModifier",
  "MapMode2D",
  "MouseButton",
  "NavigationHelpButton",
  "NavigationHelpButtonViewModel",
  "PerformanceWatchdog",
  "PerformanceWatchdogViewModel",
  "ProjectionPicker",
  "ProjectionPickerViewModel",
  "ProviderViewModel",
  "SceneMode",
  "SceneModePicker",
  "SceneModePickerViewModel",
  "SceneSnapResult",
  "SceneTransforms",
  "ScreenSpaceCameraController",
  "ScreenSpaceElevatorCameraController",
  "ScreenSpaceEventHandler",
  "ScreenSpaceEventType",
  "ScreenSpaceInputBindings",
  "ScreenSpaceMapCameraController",
  "ScreenSpaceTiltOrbitCameraController",
  "ScreenSpaceZoomCameraController",
  "SelectionIndicator",
  "SelectionIndicatorViewModel",
  "SvgPathBindingHandler",
  "Timeline",
  "ToggleButtonViewModel",
  "VideoSynchronizer",
  "viewerCesium3DTilesInspectorMixin",
  "viewerCesiumInspectorMixin",
  "viewerDragDropMixin",
  "viewerPerformanceWatchdogMixin",
  "viewerVoxelInspectorMixin",
  "VoxelInspector",
  "VoxelInspectorViewModel",
  "VRButton",
  "VRButtonViewModel",
  "SceneGISModelFlatten",
  "SceneGISRainLensStage",
  "SceneGISSnowLensStage",
  "SceneGISVideoProjection",
  "SceneGISViewshed",
  "AssociativeArray",
  "binarySearch",
  "binarySearchComparator",
  "buildModuleUrl",
  "Check",
  "clone",
  "combine",
  "createGuid",
  "defined",
  "destroyObject",
  "DeveloperError",
  "FeatureDetection",
  "formatError",
  "FrameRateMonitor",
  "Frozen",
  "getAbsoluteUri",
  "getBaseUri",
  "getExtensionFromUri",
  "getFilenameFromUri",
  "getImagePixels",
  "getTimestamp",
  "isLeapYear",
  "Iso8601",
  "mergeSort",
  "mergeSortComparator",
  "objectToQuery",
  "PinBuilder",
  "Proxy",
  "queryToObject",
  "Queue",
  "removeExtension",
  "RequestErrorEvent",
  "RuntimeError",
  "srgbToLinear",
  "subdivideArray",
  "TaskProcessor",
  "TrustedServers",
  "TypedArray",
  "TypedArrayConstructor",
  "writeTextToCanvas",
  "BlendEquation",
  "BlendFunction",
  "BlendingState",
  "CullFace",
  "DepthFunction",
  "StencilFunction",
  "StencilOperation",
  "TextureMagnificationFilter",
  "TextureMinificationFilter",
  "PixelDatatype",
  "PixelFormat",
  "WebGLConstants",
  "WebGLOptions",
  "ContextOptions",
  "CompressedTextureBuffer",
  "AnchorPointDirect",
  "AnchorPointIndirect",
  "CorrelationGroup",
  "ComponentReaderCallback",
  "ComponentsReaderCallback",
  "GltfGpmLocal",
  "MetadataClass",
  "MetadataClassProperty",
  "MetadataComponentType",
  "MetadataEnum",
  "MetadataEnumValue",
  "MetadataSchema",
  "MetadataType",
  "MetadataValue",
  "PickedMetadataInfo",
  "Spdcf",
  "StorageType",
  "ArcGisBaseMapType",
  "ArcGisMapService",
  "BingMapsGeocoderService",
  "BingMapsStyle",
  "CartographicGeocoderService",
  "createGooglePhotorealistic3DTileset",
  "createOsmBuildingsAsync",
  "createWorldBathymetryAsync",
  "DefaultProxy",
  "DiscardEmptyTileImagePolicy",
  "DiscardMissingTileImagePolicy",
  "GeocoderService",
  "GeocodeType",
  "GetFeatureInfoFormat",
  "GoogleEarthEnterpriseMapsProvider",
  "GoogleEarthEnterpriseMetadata",
  "GoogleGeocoderService",
  "GoogleMaps",
  "ImageryLayerFeatureInfo",
  "ImageryTypes",
  "Ion",
  "IonGeocodeProviderType",
  "IonGeocoderService",
  "IonWorldImageryStyle",
  "ITwinData",
  "ITwinPlatform",
  "MVTDataProvider",
  "NeverTileDiscardPolicy",
  "OpenCageGeocoderService",
  "PeliasGeocoderService",
  "TileAvailability",
  "TileDiscardPolicy",
  "TileProviderError",
  "TimeDynamicImagery",
  "UrlTemplate3DTilesDataProvider",
  "BufferPoint",
  "BufferPointCollection",
  "BufferPointMaterial",
  "BufferPointMaterialOptions",
  "BufferPointOptions",
  "BufferPolygon",
  "BufferPolygonCollection",
  "BufferPolygonMaterial",
  "BufferPolygonMaterialOptions",
  "BufferPolygonOptions",
  "BufferPolyline",
  "BufferPolylineCollection",
  "BufferPolylineMaterial",
  "BufferPolylineMaterialOptions",
  "BufferPolylineOptions",
  "BufferPrimitive",
  "BufferPrimitiveCollection",
  "BufferPrimitiveMaterial",
  "BufferPrimitiveMaterialOptions",
  "BufferPrimitiveOptions",
  "Cesium3DTile",
  "Cesium3DTileContent",
  "Cesium3DTilePointFeature",
  "Cesium3DTilesVoxelProvider",
  "ConditionsExpression",
  "createElevationBandMaterial",
  "createElevationBandMaterialBand",
  "createElevationBandMaterialEntry",
  "createTangentSpaceDebugPrimitive",
  "Credit",
  "CreditDisplay",
  "CubeMapPanorama",
  "DebugCameraPrimitive",
  "DebugModelMatrixPrimitive",
  "EdgeDisplayMode",
  "EquirectangularPanorama",
  "Expression",
  "GaussianSplat3DTileContent",
  "GeoJson",
  "GeoJsonFeature",
  "GeoJsonFeatureCollection",
  "GeoJsonPosition",
  "GeoJsonPrimitive",
  "GoogleStreetViewCubeMapPanoramaProvider",
  "I3SDataProvider",
  "I3SFeature",
  "I3SField",
  "I3SLayer",
  "I3SNode",
  "I3SStatistics",
  "I3SSublayer",
  "I3SSymbology",
  "Panorama",
  "PanoramaProvider",
  "PathMode",
  "PolygonHierarchy",
  "SensorVolumePortionToDisplay",
  "Simon1994PlanetaryPositions",
  "SplitDirection",
  "StyleExpression",
  "ViewportQuad",
  "VoxelCell",
  "VoxelContent",
  "VoxelPrimitive",
  "VoxelProvider",
  "VoxelShapeType",
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

test("geometric prose preserves packing, winding, parameter time and verified limits", () => {
  assert.match(
    lookup
      .get("CatmullRomSpline")
      .params.find((p) => p.name === "options.times").description,
    /无单位.*与时钟时间没有关联/,
  );
  assert.match(
    lookup
      .get("GroundPolylineGeometry")
      .params.find((p) => p.name === "options.granularity").description,
    /单位为米.*零表示不插值/,
  );
  assert.match(
    lookup
      .get("CircleGeometry")
      .params.find((p) => p.name === "options.granularity").description,
    /单位为弧度/,
  );
  assert.match(
    lookup.get("Geometry#attributes").description,
    /分量数量沿用源属性/,
  );
  assert.match(
    lookup.get("GeometryPipeline.computeNormal").description,
    /逆时针绕序/,
  );
  assert.match(
    lookup.get("ComponentDatatype.DOUBLE").description,
    /WebGL 不支持此类型/,
  );
  assert.match(lookup.get("BoxGeometry").description, /最小和最大坐标/);
  assert.match(
    lookup.get("EllipsoidRhumbLine").exceptions[0].description,
    /对跖位置/,
  );
  assert.match(
    lookup.get("HeadingPitchRange").description,
    /正值位于平面下方，负值位于平面上方/,
  );
  assert.match(lookup.get("QuaternionSpline").description, /不保证.*连续性/);
  assert.match(
    lookup.get("HermiteSpline.createC1").description,
    /入切向量与出切向量相同/,
  );
  assert.match(lookup.get("RectangleGraphics#rotation").description, /逆时针/);
  assert.match(
    lookup.get("Occluder.computeOccludeePoint").returns[0].description,
    /Cartesian3.*undefined/,
  );
  assert.match(
    lookup.get("Intersections2D.clipTriangleAtAxisAlignedThreshold").returns[0]
      .description,
    /-1.*三个数/,
  );
});

test("widget input prose preserves cancellation, controller units and native inheritance", () => {
  assert.match(
    lookup.get("Command#beforeExecute").description,
    /设为 true.*阻止/,
  );
  assert.match(
    lookup.get("Command#beforeExecute").description,
    /类数组 arguments/,
  );
  assert.match(
    lookup
      .get("ControllerHost#registerController")
      .params.find((p) => p.name === "priority").description,
    /最先更新.*之后更新/,
  );
  assert.match(
    lookup.get("GeocoderViewModel#searchText").description,
    /经纬度单位为度.*高度单位为米/,
  );
  assert.match(
    lookup.get("ScreenSpaceEventHandler.mouseEmulationIgnoreMilliseconds")
      .description,
    /毫秒.*模拟产生的鼠标事件/,
  );
  assert.match(
    lookup.get("ScreenSpaceElevatorCameraController#panSpeed").description,
    /像素尺寸换算为米.*系数/,
  );
  assert.match(
    lookup.get("ScreenSpaceTiltOrbitCameraController#maximumOrbitVelocity")
      .description,
    /弧度\/秒/,
  );
  assert.match(
    lookup.get("ScreenSpaceZoomCameraController#maximumZoomVelocity")
      .description,
    /米\/秒/,
  );
  assert.match(
    lookup.get("VideoSynchronizer#tolerance").description,
    /单位为秒.*同步精度/,
  );
  assert.match(
    lookup.get("BaseLayerPicker").description,
    /直接创建时.*初始为空.*Viewer 默认/s,
  );
  assert.match(
    lookup.get("viewerDragDropMixin").description,
    /CZML 等受支持文件/,
  );
  for (const [id, parent] of [
    ["SceneGISModelFlatten#uniforms", "CustomShader#uniforms"],
    ["SceneGISRainLensStage#uniforms", "PostProcessStage#uniforms"],
    ["SceneGISSnowLensStage#ready", "PostProcessStage#ready"],
    ["SceneGISVideoProjection#enabled", "PostProcessStage#enabled"],
    ["SceneGISViewshed#textureScale", "PostProcessStage#textureScale"],
  ]) {
    const inherited = lookup.get(id);
    assert.equal(inherited.sourceLocale, "en-US");
    assert.equal(inherited.inherits, parent);
    assert.equal(inherited.description, lookup.get(parent).description);
    assert.ok(inherited.i18n.translatedFields.includes("description"));
  }
  assert.equal(lookup.get("SceneGISModelFlatten").sourceLocale, "zh-CN");
});

test("utility prose preserves task backpressure, live arrays and render formulas", () => {
  assert.match(
    lookup.get("AssociativeArray#values").description,
    /实时数组.*不应直接修改/,
  );
  assert.match(lookup.get("binarySearch").returns[0].description, /按位取反/);
  assert.match(lookup.get("combine").description, /第一个对象的值/);
  assert.match(
    lookup.get("formatError").params.find((p) => p.name === "object")
      .description,
    /错误对象/,
  );
  assert.match(lookup.get("getTimestamp").description, /毫秒.*基准时刻未指定/);
  assert.match(
    lookup.get("TaskProcessor#scheduleTask").description,
    /已达到.*立即返回 undefined/,
  );
  assert.match(
    lookup
      .get("TaskProcessor#scheduleTask")
      .params.find((p) => p.name === "transferableObjects").description,
    /转移.*而非复制/,
  );
  assert.match(lookup.get("FrameRateMonitor#unpause").description, /相同次数/);
  assert.match(
    lookup.get("FrameRateMonitor#minimumFrameRateAfterWarmup").description,
    /本身不执行/,
  );
  assert.match(
    lookup.get("StencilFunction.GREATER").description,
    /参考值大于.*模板值/,
  );
  assert.match(
    lookup.get("StencilOperation.DECREMENT_WRAP").description,
    /回绕至无符号字节最大值/,
  );
  assert.match(
    lookup.get("BlendingState.PRE_MULTIPLIED_ALPHA_BLEND").description,
    /<code>source \+ destination\(1 - source.alpha\)<\/code>/,
  );
  assert.match(
    lookup.get("TextureMinificationFilter.LINEAR_MIPMAP_LINEAR").description,
    /相邻两个 mip.*线性插值.*要求纹理具有 mipmap/s,
  );
});

test("metadata and provider prose preserves storage units, bounds and retry contracts", () => {
  assert.match(
    lookup.get("CorrelationGroup#rotationThetas").description,
    /毫弧度/,
  );
  assert.match(
    lookup.get("AnchorPointDirect#position").description,
    /单位为米.*椭球高/,
  );
  assert.match(
    lookup.get("MetadataClassProperty#gpuBytesPerElement").description,
    /字节数.*64 位.*32 位/s,
  );
  assert.match(lookup.get("MetadataType.MAT3").description, /列主序/);
  assert.equal(
    lookup.get("MetadataComponentType.UINT64").description,
    "64 位无符号整数。",
  );
  assert.equal(
    lookup
      .get("MetadataComponentType")
      .properties.find((p) => p.name === "UINT64").description,
    "64 位无符号整数。",
  );
  assert.match(
    lookup.get("MetadataValue").description,
    /bigint.*INT64.*UINT64/s,
  );
  assert.match(
    lookup.get("GltfGpmLocal").description,
    /StorageType.Indirect.*anchorPointsIndirect.*StorageType.Direct.*covarianceDirect/s,
  );
  assert.match(lookup.get("Spdcf#alpha").description, /\[0, 1\)/);
  assert.match(lookup.get("Spdcf#T").description, /\(0, \+inf\)/);
  assert.match(
    lookup.get("TileAvailability#computeChildMaskForTile").description,
    /<td>1<\/td><td>西南<\/td>/,
  );
  assert.match(
    lookup.get("TileAvailability#computeBestAvailableLevelOverRectangle")
      .description,
    /所有位置均可用/,
  );
  assert.match(
    lookup.get("TileProviderError#retry").description,
    /最后一个监听器/,
  );
  assert.match(
    lookup.get("ITwinPlatform.defaultShareKey").description,
    /优先于/,
  );
  assert.match(
    lookup
      .get("ITwinData.loadGeospatialFeatures")
      .params.find((p) => p.name === "options.limit").description,
    /1～10,000.*包含两端/,
  );
  assert.match(
    lookup.get("createGooglePhotorealistic3DTileset").description,
    /实际配置名称.*onlyUsingWithGoogleGeocoder/,
  );
  assert.match(
    lookup
      .get("MVTDataProvider.fromUrl")
      .params.find((p) => p.name === "options.extent").description,
    /单位为弧度/,
  );
});

test("all current native prose has a reviewed Chinese catalog record", () => {
  assert.equal(report.counts.total, source.units.length);
  assert.equal(report.counts.translated, report.counts.total);
  assert.equal(report.counts.missing, 0);
  assert.equal(report.counts.stale, 0);
  assert.equal(report.counts.unused, 0);
  const catalog = translations.readCatalog(
    "Documentation/i18n/zh-CN/api",
    "zh-CN",
  );
  for (const entry of catalog.entries) {
    if (!/[\u3400-\u9fff]/.test(entry.text)) {
      // Pure numeric/formula descriptions are language neutral and stay literal.
      assert.ok(entry.id.startsWith("module:Math."), entry.id);
      assert.match(entry.text, /^(?:[\d\s.*\/+-]|pi)+$/);
      const original = source.units.find(
        (unit) =>
          unit.id === entry.id &&
          unit.field === entry.field &&
          unit.sourceHash === entry.sourceHash,
      );
      assert.equal(entry.text, original.source);
    }
    assert.ok(
      !entry.text.includes("__EXAMPLE__") && !entry.text.includes("__JSON__"),
    );
  }
});

test("reference and demo guidance reaches metadata without changing literal references", () => {
  assert.match(lookup.get("CornerType").demo[0], /展示了.*三种转角类型/);
  assert.match(lookup.get("ImageryLayer").see[0], /从异步影像提供者创建图层/);
  assert.match(lookup.get("Camera").demo[2], /相机教程/);
  assert.equal(lookup.get("AxisAlignedBoundingBox").see[0], "BoundingSphere");
  const original = source.units.find(
    (unit) => unit.id === "CornerType" && unit.field === "demo/0",
  );
  assert.match(original.source, /demonstrates the three corner types/);
  assert.ok(lookup.get("CornerType").i18n.translatedFields.includes("demo/0"));
  assert.ok(lookup.get("ImageryLayer").i18n.translatedFields.includes("see/0"));
  assert.ok(
    !source.units.some(
      (unit) =>
        unit.id === "Cesium3DTilesTerrainProvider" && unit.field === "see/2",
    ),
  );
});

test("specialized prose preserves buffer updates, voxel layout and geoid conversion", () => {
  assert.match(
    lookup.get("BufferPolygon#getPositions").description,
    /不会触发渲染更新.*setPositions/,
  );
  assert.match(
    lookup.get("BufferPrimitiveCollection#sort").description,
    /旧索引到新索引/,
  );
  assert.match(
    lookup
      .get("BufferPrimitiveMaterial.unpack")
      .params.find((p) => p.name === "byteOffset").description,
    /字节偏移/,
  );
  assert.match(
    lookup
      .get("BufferPrimitiveMaterial.unpack")
      .params.find((p) => p.name === "view").description,
    /DataView/,
  );
  assert.match(
    lookup.get("BufferPointMaterial").classdesc,
    /再次调用 setMaterial/,
  );
  assert.match(
    lookup.get("VoxelContent#metadata").description,
    /X 索引变化最快/,
  );
  assert.match(
    lookup.get("VoxelPrimitive#dimensions").description,
    /不含填充体素/,
  );
  assert.match(
    lookup.get("VoxelPrimitive#inputDimensions").description,
    /包含填充体素/,
  );
  assert.match(
    lookup.get("VoxelPrimitive#screenSpaceError").description,
    /单位为像素/,
  );
  assert.match(lookup.get("VoxelPrimitive#stepSize").description, /步长倍率/);
  assert.match(
    lookup.get("VoxelPrimitive#tileLoad").description,
    /不要在监听器中创建或修改/,
  );
  assert.match(
    lookup.get("I3SDataProvider#geoidTiledTerrainProvider").description,
    /正高转换为椭球高/,
  );
  assert.match(
    lookup.get("PanoramaProvider").description,
    /在全景中显示的影像/,
  );
  assert.doesNotMatch(lookup.get("PanoramaProvider").description, /椭球表面/);
  assert.match(
    lookup.get("Cesium3DTilePointFeature#labelOutlineWidth").description,
    /应用于标注/,
  );
  assert.match(
    lookup.get("ConditionsExpression#evaluateColor").description,
    /没有匹配条件时返回 undefined/,
  );
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
