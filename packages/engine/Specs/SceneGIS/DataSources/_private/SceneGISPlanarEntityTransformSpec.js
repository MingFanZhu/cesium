import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import Matrix4 from "../../../../Source/Core/Matrix4.js";
import Quaternion from "../../../../Source/Core/Quaternion.js";
import SceneGISPlanarEntityTransform from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarEntityTransform.js";

describe("SceneGIS/DataSources/_private/SceneGISPlanarEntityTransform", function () {
  it("uses fixed planar translation and a robust normalized quaternion", function () {
    const position = new Cartesian3(20000000, -20000000, 30);
    const orientation = new Quaternion(0, 0, 10, 10);
    const matrix = SceneGISPlanarEntityTransform.computeMatrix(
      position,
      orientation,
      new Matrix4(),
    );
    expect(Matrix4.getTranslation(matrix, new Cartesian3())).toEqual(position);
    const rotation = SceneGISPlanarEntityTransform.computeRotation(
      orientation,
      new Matrix4(),
    );
    expect(rotation[12]).toBe(0);
    expect(rotation[0]).toBeCloseTo(0, 14);
  });

  it("rejects invalid orientation without changing the result", function () {
    const result = Matrix4.clone(Matrix4.IDENTITY);
    expect(function () {
      SceneGISPlanarEntityTransform.computeRotation(
        new Quaternion(0, 0, 0, 0),
        result,
      );
    }).toThrowDeveloperError();
    expect(result).toEqual(Matrix4.IDENTITY);
  });
});
