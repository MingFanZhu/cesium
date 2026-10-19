import {
  BoundingSphere,
  Cartesian3,
  Color,
  ColorGeometryInstanceAttribute,
  PerInstanceColorAppearance,
  SceneGISPlanarPolygonGeometry,
  SceneGISPlanarPrimitive,
  ShowGeometryInstanceAttribute,
} from "cesium";
import { SceneGISPlanarPrimitive as EnginePrimitive } from "@cesium/engine";

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
