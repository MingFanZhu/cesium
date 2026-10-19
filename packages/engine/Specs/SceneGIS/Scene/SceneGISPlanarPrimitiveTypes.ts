import {
  BoundingSphere,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  PerInstanceColorAppearance,
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarPrimitive,
  SceneGISPlanarGroundPrimitive,
  SceneGISPlanarWorld,
  ShowGeometryInstanceAttribute,
} from "cesium";
import {
  SceneGISPlanarPrimitive as EnginePrimitive,
  SceneGISPlanarGroundPrimitive as EngineGroundPrimitive,
} from "@cesium/engine";

const geometry = new SceneGISPlanarPolygonGeometry({
  positions: [Cartesian3.ZERO, Cartesian3.UNIT_X, Cartesian3.UNIT_Y],
});
const instances: SceneGISPlanarPrimitive.GeometryInstanceOptions[] = [
  {
    geometry,
    id: "business",
    attributes: {
      color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
      show: new ShowGeometryInstanceAttribute(true),
    },
  },
];
const primitive = new SceneGISPlanarPrimitive({
  geometryInstances: instances,
  appearance: new PerInstanceColorAppearance({ flat: true }),
});
const bounds: BoundingSphere = primitive.getBoundingSphere(
  new BoundingSphere(),
  "business",
);
primitive.getGeometryInstanceAttributes("business").show = new Uint8Array([0]);
const engine: EnginePrimitive = primitive;
void [bounds, engine];

declare const world: SceneGISPlanarWorld;
const groundInstances: SceneGISPlanarGroundPrimitive.GeometryInstanceOptions[] =
  [{ geometry, id: "area", attributes: instances[0].attributes }];
const ground = new SceneGISPlanarGroundPrimitive({
  world,
  geometryInstances: groundInstances,
  appearance: new PerInstanceColorAppearance({ flat: true }),
});
ground.getGeometryInstanceAttributes("area").color =
  ColorGeometryInstanceAttribute.toValue(Color.BLUE);
const groundBounds: BoundingSphere = ground.getBoundingSphere(
  new BoundingSphere(),
  "area",
);
const engineGround: EngineGroundPrimitive = ground;
void [groundBounds, engineGround];
