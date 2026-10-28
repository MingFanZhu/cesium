import { expect } from "@playwright/test";

export default async function checkWaterAppearance(page, preset) {
  const selector = page.getByRole("combobox", {
    name: "水体预设",
    exact: true,
  });
  await expect(selector).toHaveValue(preset);
  await selector.selectOption({ label: "清水" });
  const result = await page.evaluate(() => {
    const e = window.example;
    const controls = e.gui.controllersRecursive();
    const initial = { ...e.appearance.state };
    for (const [key, value] of Object.entries({
      transmissionColor: "#80b0d0",
      colorDistance: 4,
      scatteringColor: "#ffffff",
      turbidity: 0.2,
      anisotropy: 0.25,
      roughness: 0.18,
      foamWidth: 0.45,
      foamIntensity: 0.3,
    })) {
      controls.find((c) => c.property === key).setValue(value);
    }
    const surfaces = () => e.waters ?? [e.river];
    const read = () =>
      surfaces().map((s) => ({
        absorption: { ...s.absorption },
        scattering: { ...s.scattering },
        g: s.scatteringAnisotropy,
        roughness: s.roughness,
        foamWidth: s.foamWidth,
        foamIntensity: s.foamIntensity,
      }));
    const edited = read();
    // The river recreates its primitive when changing water level or attaching wind.
    if (e.rebuild) {
      e.rebuild();
    }
    const rebuilt = read();
    const custom = e.appearance.state.preset;
    Object.assign(e.appearance.state, initial);
    e.appearance.apply();
    controls.forEach((c) => c.updateDisplay());
    return { edited, rebuilt, custom };
  });
  expect(result.custom).toBe("自定义");
  expect(result.rebuilt).toEqual(result.edited);
  expect(result.edited.length).toBeGreaterThan(0);
  for (const value of result.edited) {
    expect(value.absorption.x).toBeCloseTo(
      -Math.log(((128 / 255 + 0.055) / 1.055) ** 2.4) / 4,
      8,
    );
    expect(value.scattering).toEqual({ x: 0.2, y: 0.2, z: 0.2 });
    expect(value.g).toBe(0.25);
    expect(value.roughness).toBe(0.18);
    expect(value.foamWidth).toBe(0.45);
    expect(value.foamIntensity).toBe(0.3);
  }
  await selector.selectOption({ label: preset });
  await page.waitForFunction(() => {
    const e = window.example;
    return (
      (e.waters ?? [e.river]).every((s) => s.ready) &&
      e.viewer.scene.frameState._sceneGISWater?.foamMaterial?.texture
    );
  });
}
