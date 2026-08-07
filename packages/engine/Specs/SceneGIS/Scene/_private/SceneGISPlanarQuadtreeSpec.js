import {
  Cartesian3,
  Cartesian4,
  CullingVolume,
  Intersect,
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
  PerspectiveFrustum,
  PerspectiveOffCenterFrustum,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
} from "../../../../index.js";
import SceneGISPlanarQuadtree from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarQuadtree.js";

describe("SceneGIS/Scene/SceneGISPlanarQuadtree", function () {
  function createQuadtree() {
    const coordinateSystem = new SceneGISPlanarCoordinateSystem({
      extent: new SceneGISPlanarExtent({
        minimumX: -128.0,
        minimumY: -128.0,
        maximumX: 128.0,
        maximumY: 128.0,
      }),
    });
    return new SceneGISPlanarQuadtree(
      new SceneGISPlanarTilingScheme({ coordinateSystem }),
    );
  }

  function createFrameState(options = {}) {
    return {
      frameNumber: options.frameNumber ?? 1,
      context: { drawingBufferHeight: options.height ?? 256 },
      pixelRatio: options.pixelRatio ?? 1.0,
      camera: {
        positionWC: options.position ?? new Cartesian3(0.0, 0.0, 256.0),
        frustum: options.frustum ?? { sseDenominator: 1.0 },
      },
      cullingVolume: {
        computeVisibility:
          options.computeVisibility ?? (() => Intersect.INSIDE),
      },
    };
  }

  it("uses the northwest child order and has no ancestor overlap", function () {
    const quadtree = createQuadtree();
    const frameState = createFrameState({ position: new Cartesian3(0, 0, 0) });
    quadtree.beginFrame(frameState.frameNumber);

    const selected = quadtree.selectTiles(frameState, 1, 0.5);

    expect(selected.map((tile) => tile.key)).toEqual([
      "1/0/0",
      "1/1/0",
      "1/0/1",
      "1/1/1",
    ]);
    expect(selected.some((tile) => tile.key === "0/0/0")).toBe(false);
  });

  it("keeps the parent until all four direct children are renderable", function () {
    const quadtree = createQuadtree();
    const frameState = createFrameState({ position: new Cartesian3(0, 0, 0) });
    quadtree.beginFrame(frameState.frameNumber);
    quadtree.selectTiles(frameState, 1, 0.5);
    const renderable = new Set(["0/0/0", "1/0/0", "1/1/0", "1/0/1"]);

    expect(
      quadtree
        .resolveRenderTiles((tile) => renderable.has(tile.key))
        .map((tile) => tile.key),
    ).toEqual(["0/0/0"]);

    renderable.add("1/1/1");
    expect(
      quadtree
        .resolveRenderTiles((tile) => renderable.has(tile.key))
        .map((tile) => tile.key),
    ).toEqual(["1/0/0", "1/1/0", "1/0/1", "1/1/1"]);
  });

  it("culls before computing screen-space error", function () {
    const quadtree = createQuadtree();
    const frameState = createFrameState({
      computeVisibility: () => Intersect.OUTSIDE,
    });
    quadtree.beginFrame(frameState.frameNumber);

    expect(quadtree.selectTiles(frameState, 4, 1.0)).toEqual([]);
    expect(quadtree._debug.culled).toBe(1);
    expect(quadtree._debug.sseComputations).toBe(0);
  });

  it("uses exact closed-rectangle distance and honors equality", function () {
    const quadtree = createQuadtree();
    const frameState = createFrameState({
      position: new Cartesian3(256, 0, 0),
    });
    quadtree.beginFrame(frameState.frameNumber);

    const selected = quadtree.selectTiles(frameState, 2, 2.0);

    expect(selected.map((tile) => tile.key)).toEqual(["0/0/0"]);

    frameState.frameNumber = 2;
    frameState.camera.positionWC.x = 255.0;
    quadtree.beginFrame(frameState.frameNumber);
    expect(quadtree.selectTiles(frameState, 1, 2.0).length).toBe(4);
  });

  it("uses three-dimensional closed bounds and provider geometric errors", function () {
    const quadtree = createQuadtree();
    quadtree.setHeightRange(-50.0, 100.0);
    const frameState = createFrameState({
      position: new Cartesian3(256.0, 0.0, -100.0),
    });
    quadtree.beginFrame(1);
    const nominal = quadtree.selectTiles(frameState, 1, 2.0);
    expect(nominal.map((tile) => tile.key)).toEqual(["0/0/0"]);
    expect(nominal[0].minimumHeight).toBe(-50.0);
    expect(nominal[0].maximumHeight).toBe(100.0);

    quadtree.beginFrame(2);
    const terrain = quadtree.selectTiles(frameState, 1, 2.0, [1000.0, 500.0]);
    expect(terrain.length).toBe(4);
    expect(terrain.every((tile) => tile.level === 1)).toBe(true);
  });

  it("applies pixel ratio and bounds zero-distance refinement", function () {
    const quadtree = createQuadtree();
    const frameState = createFrameState({
      position: new Cartesian3(256, 0, 0),
      pixelRatio: 2.0,
    });
    quadtree.beginFrame(1);
    expect(quadtree.selectTiles(frameState, 2, 1.0)[0].level).toBe(0);

    frameState.frameNumber = 2;
    frameState.camera.positionWC = new Cartesian3(0, 0, 0);
    quadtree.beginFrame(2);
    const selected = quadtree.selectTiles(frameState, 2, 1.0);
    expect(selected.length).toBe(16);
    expect(selected.every((tile) => tile.level === 2)).toBe(true);
  });

  it("orthographic refinement is independent of camera distance", function () {
    const frustum = new OrthographicOffCenterFrustum();
    frustum.left = -64.0;
    frustum.right = 64.0;
    frustum.bottom = -64.0;
    frustum.top = 64.0;
    frustum.near = 1.0;
    frustum.far = 10000.0;
    const quadtree = createQuadtree();
    const near = createFrameState({
      frustum,
      position: new Cartesian3(0, 0, 10),
    });
    quadtree.beginFrame(near.frameNumber);
    const nearKeys = quadtree.selectTiles(near, 2, 1.0).map((tile) => tile.key);

    const far = createFrameState({
      frameNumber: 2,
      frustum,
      position: new Cartesian3(0, 0, 1000),
    });
    quadtree.beginFrame(far.frameNumber);
    const farKeys = quadtree.selectTiles(far, 2, 1.0).map((tile) => tile.key);

    expect(farKeys).toEqual(nearKeys);
  });

  it("refines a real PerspectiveFrustum by camera distance", function () {
    const frustum = new PerspectiveFrustum({
      fov: Math.PI / 3.0,
      aspectRatio: 1.0,
      near: 1.0,
      far: 2.0e8,
    });
    const quadtree = createQuadtree();
    const far = createFrameState({
      frustum,
      position: new Cartesian3(0.0, 0.0, 1.0e8),
    });
    quadtree.beginFrame(1);
    const farKeys = quadtree.selectTiles(far, 3, 2.0).map((tile) => tile.key);

    const near = createFrameState({
      frameNumber: 2,
      frustum,
      position: new Cartesian3(0.0, 0.0, 64.0),
    });
    quadtree.beginFrame(2);
    const nearLevels = quadtree
      .selectTiles(near, 3, 2.0)
      .map((tile) => tile.level);

    expect(farKeys).toEqual(["0/0/0"]);
    expect(nearLevels.every((level) => level === 1)).toBe(true);
  });

  it("supports a real PerspectiveOffCenterFrustum", function () {
    const frustum = new PerspectiveOffCenterFrustum({
      left: -1.0,
      right: 1.0,
      bottom: -1.0,
      top: 1.0,
      near: 1.0,
      far: 1000.0,
    });
    const quadtree = createQuadtree();
    const far = createFrameState({
      frustum,
      position: new Cartesian3(0.0, 0.0, 64.0),
    });
    quadtree.beginFrame(1);
    const farLevel = quadtree.selectTiles(far, 1, 2.0)[0].level;

    const near = createFrameState({
      frameNumber: 2,
      frustum,
      position: new Cartesian3(0.0, 0.0, 32.0),
    });
    quadtree.beginFrame(2);
    expect(farLevel).toBe(0);
    expect(quadtree.selectTiles(near, 1, 2.0).length).toBe(4);
  });

  it("supports both real orthographic frustum types", function () {
    const centered = new OrthographicFrustum({
      width: 256.0,
      aspectRatio: 1.0,
      near: 1.0,
      far: 10000.0,
    });
    const offCenter = new OrthographicOffCenterFrustum({
      left: -128.0,
      right: 128.0,
      bottom: -128.0,
      top: 128.0,
      near: 1.0,
      far: 10000.0,
    });

    for (const frustum of [centered, offCenter]) {
      const quadtree = createQuadtree();
      const frameState = createFrameState({ frustum });
      quadtree.beginFrame(1);
      expect(quadtree.selectTiles(frameState, 1, 1.0)[0].level).toBe(0);
    }
  });

  it("keeps a zero-thickness tile touching a real frustum plane", function () {
    const quadtree = createQuadtree();
    const root = quadtree.getOrCreateTile(0, 0, 0);
    const cullingVolume = new CullingVolume([
      new Cartesian4(1.0, 0.0, 0.0, 128.0),
    ]);
    expect(cullingVolume.computeVisibility(root.boundingVolume)).not.toBe(
      Intersect.OUTSIDE,
    );

    const frameState = createFrameState();
    frameState.cullingVolume = cullingVolume;
    quadtree.beginFrame(1);
    expect(quadtree.selectTiles(frameState, 0, 2.0)).toEqual([root]);
  });

  it("trims only unprotected tiles with deterministic LRU ordering", function () {
    const quadtree = createQuadtree();
    const first = createFrameState({ position: new Cartesian3(0, 0, 0) });
    quadtree.beginFrame(1);
    quadtree.selectTiles(first, 1, 0.5);
    quadtree.trim(0);
    expect(quadtree._tiles.size).toBe(5);

    const second = createFrameState({ frameNumber: 2 });
    quadtree.beginFrame(2);
    quadtree.selectTiles(second, 0, Number.MAX_VALUE);
    quadtree.trim(1);

    expect(quadtree._tiles.has("0/0/0")).toBe(true);
    expect(quadtree._tiles.has("1/1/1")).toBe(true);
    expect(quadtree._tiles.size).toBe(2);
    expect(quadtree._debug.evictedTiles).toBe(3);
  });

  it("recreates evicted tiles and destroys every resident tile once", function () {
    const quadtree = createQuadtree();
    const frameState = createFrameState();
    quadtree.beginFrame(1);
    quadtree.selectTiles(frameState, 0, 2.0);
    quadtree.beginFrame(2);
    quadtree.trim(0);
    expect(quadtree._tiles.size).toBe(0);

    quadtree.beginFrame(3);
    quadtree.selectTiles(frameState, 0, 2.0);
    expect(quadtree._debug.createdTiles).toBe(2);
    quadtree.destroy();
    expect(quadtree._debug.destroyedTiles).toBe(2);
  });
});
