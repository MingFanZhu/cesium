import { SceneGISWorld } from "../../../index.js";

describe("SceneGIS/Scene/SceneGISWorld", function () {
  it("cannot be instantiated directly", function () {
    expect(function () {
      return new SceneGISWorld();
    }).toThrowDeveloperError();
  });

  it("requires lifecycle methods to be implemented", function () {
    const world = Object.create(SceneGISWorld.prototype);
    const frameState = {};

    expect(function () {
      world.update(frameState);
    }).toThrowDeveloperError();
    expect(function () {
      world.beginFrame(frameState);
    }).toThrowDeveloperError();
    expect(function () {
      world.render(frameState);
    }).toThrowDeveloperError();
    expect(function () {
      world.endFrame(frameState);
    }).toThrowDeveloperError();
    expect(function () {
      world.isDestroyed();
    }).toThrowDeveloperError();
    expect(function () {
      world.destroy();
    }).toThrowDeveloperError();
  });
});
