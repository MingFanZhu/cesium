import {
  BoundingSphere,
  Buffer,
  Color,
  ColorGeometryInstanceAttribute,
  ComponentDatatype,
  Geometry,
  GeometryAttribute,
  GeometryInstance,
  IndexDatatype,
  PrimitiveType,
  ShaderProgram,
  Texture,
} from "../../../../index.js";
import Resources from "../../../../Source/SceneGIS/Renderer/_private/_SceneGISVectorTileBatchResources.js";
import stroke from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorTileStroke.js";
import createContext from "../../../../../../Specs/createContext.js";

describe("SceneGIS/Renderer/_private/SceneGISVectorTileBatchResources", function () {
  let context;
  let resources;

  beforeEach(function () {
    context = createContext();
  });
  afterEach(function () {
    if (resources !== undefined && !resources.isDestroyed()) {
      resources.destroy();
    }
    resources = undefined;
    context.destroyForSpecs();
  });

  function triangle(id, color = Color.RED, count = 3) {
    const positions = new Float64Array(count * 3);
    positions.set([-1, -1, 0, 1, -1, 0, 0, 1, 0], (count - 3) * 3);
    return new GeometryInstance({
      id,
      geometry: new Geometry({
        attributes: {
          position: new GeometryAttribute({
            componentDatatype: ComponentDatatype.DOUBLE,
            componentsPerAttribute: 3,
            values: positions,
          }),
        },
        indices:
          count > 65535
            ? new Uint32Array([count - 3, count - 2, count - 1])
            : new Uint16Array([0, 1, 2]),
        primitiveType: PrimitiveType.TRIANGLES,
        boundingSphere: BoundingSphere.fromVertices(positions),
      }),
      attributes: { color: ColorGeometryInstanceAttribute.fromColor(color) },
    });
  }

  it("batches colors, preserves borrowed geometry, and releases feature pick identities", function () {
    const id = { featureId: "18446744073709551615" };
    const other = { featureId: "2" };
    const input = triangle(id);
    const owner = {};
    const original = input.geometry.attributes.position;
    resources = new Resources(
      context,
      {
        kind: "fill",
        instances: [input, triangle(id), triangle(other, Color.BLUE)],
      },
      owner,
      true,
    );
    expect(resources._vertexArrays.length).toBe(1);
    expect(resources._pickIds.length).toBe(2);
    expect(input.geometry.attributes.position).toBe(original);
    expect(input.geometry.attributes.position3DHigh).toBeUndefined();
    const colors = resources._pickIds.map((pick) => pick.color.toRgba());
    expect(context.getObjectByPickColor(colors[0])).toEqual({
      primitive: owner,
      id,
    });
    expect(context.getObjectByPickColor(colors[1]).id).toBe(other);
    const va = resources._vertexArrays[0];
    const shader = resources._shaderProgram;
    resources.destroy();
    context.shaderCache.destroyReleasedShaderPrograms();
    expect(va.isDestroyed()).toBeTrue();
    expect(shader.isDestroyed()).toBeTrue();
    for (const color of colors) {
      expect(context.getObjectByPickColor(color)).toBeUndefined();
    }
  });

  it("retains 32-bit indices without allocating a disabled pick channel", function () {
    const pick = spyOn(context, "createPickId").and.callThrough();
    resources = new Resources(
      context,
      { kind: "fill", instances: [triangle("large", Color.RED, 65538)] },
      {},
      false,
    );
    expect(pick).not.toHaveBeenCalled();
    expect(resources._pickIds.length).toBe(0);
    expect(resources._vertexArrays.length).toBe(1);
    expect(resources._vertexArrays[0].indexBuffer.indexDatatype).toBe(
      IndexDatatype.UNSIGNED_INT,
    );
    expect(resources._vertexArrays[0].indexBuffer.numberOfIndices).toBe(3);
  });

  function observeAllocations() {
    const buffers = [];
    for (const name of ["createVertexBuffer", "createIndexBuffer"]) {
      const original = Buffer[name];
      spyOn(Buffer, name).and.callFake((options) => {
        const buffer = original(options);
        buffers.push(buffer);
        return buffer;
      });
    }
    const picks = [];
    const createPick = context.createPickId;
    spyOn(context, "createPickId").and.callFake(function (object) {
      const pick = createPick.call(context, object);
      picks.push(pick.color.toRgba());
      return pick;
    });
    return { buffers, picks };
  }

  function dashedLine() {
    return {
      kind: "line",
      dashIntervals: [0, 2, 0, 0],
      instances: [
        new GeometryInstance({
          id: "dashed",
          geometry: stroke(
            new Float64Array([0, 0, 10, 0]),
            { toLocal: (x, y) => ({ x, y, z: 0 }) },
            false,
            { "line-width": 6 },
            {},
            [0, 1, 4],
          ),
          attributes: {
            color: ColorGeometryInstanceAttribute.fromColor(Color.RED),
          },
        }),
      ],
    };
  }

  it("owns and releases a numeric dash texture with its geometry", function () {
    resources = new Resources(context, dashedLine(), {}, true);
    const texture = resources._dashTexture;
    expect(texture).toBeDefined();
    expect(texture.width * texture.height).toBe(1);
    resources.destroy();
    expect(texture.isDestroyed()).toBeTrue();
  });

  it("cleans untransferred vertex buffers and pick IDs when index allocation fails", function () {
    const { buffers, picks } = observeAllocations();
    Buffer.createIndexBuffer.and.throwError("deliberate allocation failure");
    expect(
      () =>
        new Resources(
          context,
          { kind: "fill", instances: [triangle("failed")] },
          {},
          true,
        ),
    ).toThrowError("deliberate allocation failure");
    expect(buffers.length).toBeGreaterThan(0);
    expect(buffers.every((buffer) => buffer.isDestroyed())).toBeTrue();
    expect(picks.length).toBe(1);
    expect(context.getObjectByPickColor(picks[0])).toBeUndefined();
  });

  it("cleans transferred VA buffers and pick IDs when shader preflight fails", function () {
    const { buffers, picks } = observeAllocations();
    const releaseTexture = spyOn(
      Texture.prototype,
      "destroy",
    ).and.callThrough();
    spyOn(ShaderProgram.prototype, "_bind").and.throwError(
      "deliberate compile failure",
    );
    expect(() => new Resources(context, dashedLine(), {}, true)).toThrowError(
      "deliberate compile failure",
    );
    expect(buffers.length).toBeGreaterThan(0);
    expect(buffers.every((buffer) => buffer.isDestroyed())).toBeTrue();
    expect(context.getObjectByPickColor(picks[0])).toBeUndefined();
    expect(releaseTexture).toHaveBeenCalledTimes(1);
    context.shaderCache.destroyReleasedShaderPrograms();
  });
});
