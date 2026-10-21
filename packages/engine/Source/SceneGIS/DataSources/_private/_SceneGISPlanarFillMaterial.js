import ColorMaterialProperty from "../../../DataSources/ColorMaterialProperty.js";
import MaterialProperty from "../../../DataSources/MaterialProperty.js";
import Material from "../../../Scene/Material.js";
import MaterialAppearance from "../../../Scene/MaterialAppearance.js";
import PerInstanceColorAppearance from "../../../Scene/PerInstanceColorAppearance.js";

/** Captures the native MaterialProperty type without allocating GPU resources. @private */
export function getPlanarFillMaterial(graphic, time) {
  const property = graphic._material;
  if (property === undefined || property instanceof ColorMaterialProperty) {
    return undefined;
  }
  return { property, time, type: property.getType(time) ?? Material.ColorType };
}

/** Creates an adapter-owned native material, or preserves the color fast path. @private */
export function createPlanarFillAppearance(owner, state, options) {
  const descriptor = state.material;
  if (descriptor === undefined) {
    return new PerInstanceColorAppearance(options);
  }
  const material = owner.ownMaterial(Material.fromType(descriptor.type));
  MaterialProperty.getValue(descriptor.time, descriptor.property, material);
  return new MaterialAppearance({
    ...options,
    materialSupport: MaterialAppearance.MaterialSupport.ALL,
    material,
  });
}

/** Same-type changes update uniforms while the owner retains its geometry. @private */
export function updatePlanarFillMaterial(owner, state) {
  if (state.material !== undefined && owner.fillPrimitive !== undefined) {
    MaterialProperty.getValue(
      state.material.time,
      state.material.property,
      owner.fillPrimitive.appearance.material,
    );
  }
}

/** @private */
const SceneGISPlanarFillMaterial = {
  getPlanarFillMaterial,
  createPlanarFillAppearance,
  updatePlanarFillMaterial,
};
export default SceneGISPlanarFillMaterial;
