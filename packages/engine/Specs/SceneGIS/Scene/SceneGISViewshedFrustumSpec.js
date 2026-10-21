import FrustumGuide from "../../../Source/SceneGIS/Scene/_private/_SceneGISViewshedFrustum.js";

describe("SceneGIS/Scene/SceneGISViewshedFrustum", function () {
  it("bounds the angular cone by radial distance and the near plane", function () {
    for (const near of [0.5, 60, 95]) {
      const state = {
        near,
        distance: 100,
        horizontal: Math.PI / 2,
        vertical: Math.PI / 3,
      };
      const guide = new FrustumGuide(state);
      try {
        const geometry = guide._primitive.geometryInstances.geometry;
        const values = geometry.attributes.position.values;
        expect(values.length).toBeGreaterThan(0);
        expect(values.length % 6).toBe(0);
        for (let i = 0; i < values.length; i += 3) {
          const x = values[i];
          const y = values[i + 1];
          const z = -values[i + 2];
          const radius = Math.hypot(x, y, z);
          const h = Math.abs(x) - z * Math.tan(state.horizontal / 2);
          const v = Math.abs(y) - z * Math.tan(state.vertical / 2);
          expect(radius).toBeLessThanOrEqual(1 + 1e-12);
          expect(z).toBeGreaterThanOrEqual(near / 100 - 1e-12);
          expect(h).toBeLessThanOrEqual(1e-12);
          expect(v).toBeLessThanOrEqual(1e-12);
          // Every endpoint belongs to an intersection of boundary surfaces.
          const boundaries = [radius - 1, z - near / 100, h, v];
          expect(
            boundaries.filter((d) => Math.abs(d) < 1e-12).length,
          ).toBeGreaterThanOrEqual(2);
        }
      } finally {
        guide.destroy();
      }
    }
  });
});
