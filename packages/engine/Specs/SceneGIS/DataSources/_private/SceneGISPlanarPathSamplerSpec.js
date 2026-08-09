import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import JulianDate from "../../../../Source/Core/JulianDate.js";
import ReferenceFrame from "../../../../Source/Core/ReferenceFrame.js";
import SampledPositionProperty from "../../../../Source/DataSources/SampledPositionProperty.js";
import SceneGISPlanarPathSampler from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarPathSampler.js";

describe("SceneGIS/DataSources/SceneGISPlanarPathSampler", function () {
  it("samples FIXED positions into a reusable result", function () {
    const start = JulianDate.fromIso8601("2026-08-10T00:00:00Z");
    const stop = JulianDate.addSeconds(start, 120, new JulianDate());
    const property = new SampledPositionProperty(ReferenceFrame.FIXED);
    property.addSample(start, Cartesian3.ZERO);
    property.addSample(stop, new Cartesian3(120, 0, 3));
    const result = [];
    expect(
      SceneGISPlanarPathSampler.sample(
        property,
        start,
        stop,
        start,
        60,
        result,
      ),
    ).toBe(result);
    expect(result.length).toBe(3);
    expect(result[2]).toEqual(new Cartesian3(120, 0, 3));
  });

  it("rejects non-FIXED frame and invalid intervals before sampling", function () {
    const start = JulianDate.fromIso8601("2026-08-10T00:00:00Z");
    const property = new SampledPositionProperty(ReferenceFrame.INERTIAL);
    expect(function () {
      SceneGISPlanarPathSampler.sample(property, start, start, start, 60, []);
    }).toThrowDeveloperError();
  });
});
