import {
  _SceneGISPlanarPolygonVisualizer as PolygonVisualizer,
  _SceneGISPlanarAreaVisualizer as AreaVisualizer,
  _SceneGISPlanarSolidVisualizer as SolidVisualizer,
  _SceneGISPlanarRouteVisualizer as RouteVisualizer,
  ArcType,
  CallbackProperty,
  Cartesian2,
  Cartesian3,
  CheckerboardMaterialProperty,
  Color,
  EntityCollection,
  HeightReference,
  ImageMaterialProperty,
  JulianDate,
  Material,
  MaterialAppearance,
  PolygonHierarchy,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "../../../index.js";
import createScene from "../../../../../Specs/createScene.js";
import createCanvas from "../../../../../Specs/createCanvas.js";

describe("SceneGIS/DataSources/SceneGISPlanarFillMaterials", function () {
  let scene, world, entities, visualizer;
  const time = JulianDate.fromIso8601("2026-10-21T04:00:00Z");
  const ring = [
    [-20, -20],
    [20, -20],
    [20, 20],
    [-20, 20],
  ].map(([x, y]) => new Cartesian3(x, y, 5));
  const cases = [
    [
      "polygon",
      PolygonVisualizer,
      {
        hierarchy: new PolygonHierarchy(ring),
        arcType: ArcType.NONE,
        perPositionHeight: true,
        stRotation: 0.4,
      },
    ],
    [
      "ellipse",
      AreaVisualizer,
      { semiMajorAxis: 20, semiMinorAxis: 10, height: 5, stRotation: 0.4 },
    ],
    ["box", SolidVisualizer, { dimensions: new Cartesian3(20, 20, 10) }],
    [
      "wall",
      RouteVisualizer,
      { positions: [new Cartesian3(-20, 0, 10), new Cartesian3(20, 0, 10)] },
    ],
  ];
  beforeEach(function () {
    scene = createScene({ scene3DOnly: true, canvas: createCanvas(64, 64) });
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -100,
          minimumY: -100,
          maximumX: 100,
          maximumY: 100,
        }),
      }),
      maximumLevel: 0,
    });
    scene._initializeWorld(world);
    scene.environmentEffects.enabled = false;
    entities = new EntityCollection();
    scene.camera.setView({
      destination: new Cartesian3(0, -60, 60),
      orientation: {
        direction: Cartesian3.normalize(
          new Cartesian3(0, 60, -60),
          new Cartesian3(),
        ),
        up: Cartesian3.normalize(new Cartesian3(0, 1, 1), new Cartesian3()),
      },
    });
    scene.camera.frustum.near = 0.1;
  });
  afterEach(function () {
    visualizer?.destroy();
    scene.destroyForSpecs();
  });
  function owner(entity, name) {
    const item = visualizer._items.get(entity.id);
    return name === "polygon" ? item.owner : item.owners[name];
  }
  cases.forEach(function ([name, Type, options]) {
    it(`updates ${name} native materials without rebuilding and releases replaced/removed resources`, function () {
      let tint = Color.RED;
      const property = new CheckerboardMaterialProperty({
        evenColor: new CallbackProperty(() => tint, false),
        oddColor: Color.BLUE,
      });
      const entity = entities.add({
        position: new Cartesian3(0, 0, 10),
        [name]: { ...options, material: property },
      });
      visualizer = new Type(world, scene, entities);
      visualizer.update(time);
      scene.renderForSpecs();
      const first = owner(entity, name);
      const primitive = first.fillPrimitive;
      const material = primitive.appearance.material;
      expect(primitive.appearance).toBeInstanceOf(MaterialAppearance);
      const va = primitive._current._va[0];
      tint = Color.GREEN;
      visualizer.update(time);
      scene.renderForSpecs();
      expect(owner(entity, name)).toBe(first);
      expect(primitive._current._va[0]).toBe(va);
      expect(material.uniforms.lightColor).toEqual(Color.GREEN);
      const image = document.createElement("canvas");
      image.width = image.height = 2;
      entity[name].material = new ImageMaterialProperty({
        image,
        repeat: new Cartesian2(2, 3),
        transparent: true,
      });
      visualizer.update(time);
      scene.renderForSpecs();
      const replacement = owner(entity, name);
      expect(replacement).not.toBe(first);
      expect(material.isDestroyed()).toBeTrue();
      expect(
        replacement.fillPrimitive.appearance.material.uniforms.repeat,
      ).toEqual(new Cartesian2(2, 3));
      const imageMaterial = replacement.fillPrimitive.appearance.material;
      entities.remove(entity);
      visualizer.update(time);
      expect(imageMaterial.isDestroyed()).toBeTrue();
    });
  });
  it("keeps ground polygon holes, rotation and the previous owner after failed material evaluation", function () {
    const property = new CheckerboardMaterialProperty();
    const entity = entities.add({
      polygon: {
        hierarchy: new PolygonHierarchy(ring, [
          new PolygonHierarchy(
            [
              [-5, -5],
              [-5, 5],
              [5, 5],
              [5, -5],
            ].map(([x, y]) => new Cartesian3(x, y, 0)),
          ),
        ]),
        arcType: ArcType.NONE,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        stRotation: 0.7,
        material: property,
      },
    });
    visualizer = new PolygonVisualizer(world, scene, entities);
    visualizer.update(time);
    scene.renderForSpecs();
    const previous = owner(entity, "polygon");
    expect(previous.fillPrimitive.geometry.stRotation).toBe(0.7);
    scene.camera.setView({
      destination: new Cartesian3(0, 0, 60),
      orientation: {
        direction: new Cartesian3(0, 0, -1),
        up: Cartesian3.UNIT_Y,
      },
    });
    scene.renderForSpecs();
    expect(scene.pick(new Cartesian2(32, 32))?.id).not.toBe(entity);
    const bad = new ImageMaterialProperty();
    entity.polygon.material = bad;
    spyOn(bad, "getValue").and.throwError("material evaluation failed");
    const created = [];
    const fromType = Material.fromType;
    spyOn(Material, "fromType").and.callFake(function (...args) {
      const m = fromType(...args);
      created.push(m);
      return m;
    });
    expect(() => visualizer.update(time)).toThrowError(
      "material evaluation failed",
    );
    expect(owner(entity, "polygon")).toBe(previous);
    expect(previous.fillPrimitive.isDestroyed()).toBeFalse();
    expect(created.length).toBe(1);
    expect(created[0].isDestroyed()).toBeTrue();
  });
});
