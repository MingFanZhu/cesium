import Cartesian4 from "../../../Core/Cartesian4.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import Matrix4 from "../../../Core/Matrix4.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Pass from "../../../Renderer/Pass.js";
import RenderState from "../../../Renderer/RenderState.js";
import BlendingState from "../../../Scene/BlendingState.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import BatchResources from "../../Renderer/_private/_SceneGISVectorTileBatchResources.js";
import prepareBatch from "../../Core/_private/_SceneGISVectorBatchGeometry.js";
import CullFace from "../../../Scene/CullFace.js";
import EncodedCartesian3 from "../../../Core/EncodedCartesian3.js";
import EllipsoidTerrainProvider from "../../../Core/EllipsoidTerrainProvider.js";
import GlobeCoordinates from "../../Core/_private/_SceneGISVectorGlobeCoordinates.js";
import GlobeCover from "./_SceneGISVectorGlobeCover.js";
import GlobeTerrain from "./_SceneGISVectorGlobeTerrain.js";
import EnvironmentResources from "../../Renderer/_private/_SceneGISVectorEnvironmentResources.js";
import environment from "./_SceneGISVectorEnvironment.js";
import extrusionAnchoring from "./_SceneGISVectorExtrusionAnchoring.js";

const colorState = {
  depthTest: { enabled: false },
  depthMask: false,
  cull: { enabled: false },
  blending: BlendingState.PRE_MULTIPLIED_ALPHA_BLEND,
};
const minimumCorner = new Cartesian3();
const maximumCorner = new Cartesian3();

function shaderProgram(batch) {
  const resources = batch._resources;
  const base = resources.getShaderProgram
    ? resources.getShaderProgram(
        batch._owner._globe &&
          !(
            batch._owner._world.terrainProvider instanceof
            EllipsoidTerrainProvider
          ),
      )
    : resources._shaderProgram;
  if (batch._kind === "circle" || !environment.active(batch._owner)) {
    return base;
  }
  batch._environmentResources ??= new EnvironmentResources(
    batch._owner._scene.context,
  );
  return batch._environmentResources.get(
    base,
    batch._owner._globe,
    environment.shadowMap(batch._owner),
  );
}

function groundHeights(batch, frameState) {
  const owner = batch._owner;
  const bounds = batch._tileBounds;
  const ranges = (owner._groundRanges ??= new WeakMap());
  let range = ranges.get(bounds);
  if (range?.frame === frameState.frameNumber) {
    return range.heights;
  }
  if (!range) {
    range = { heights: new Cartesian2() };
    ranges.set(bounds, range);
  }
  if (owner._globe) {
    range.frame = frameState.frameNumber;
    return GlobeTerrain.heights(owner, bounds, range.heights);
  }
  // Uniforms run after World.render publishes this frame's terrain cover. Tighten
  // only the raster volume, never the earlier conservative frustum bounds.
  const surface = owner._world._surface;
  let minimum = 0,
    maximum = 0;
  for (let i = 0; i < surface._terrainQuerySnapshotCount; i++) {
    const entry = surface._terrainQuerySnapshot[i];
    if (entry.source === "FLAT") {
      continue;
    }
    const extent = entry.tile.extent;
    if (
      extent.maximumX < bounds.minimumX ||
      extent.minimumX > bounds.maximumX ||
      extent.maximumY < bounds.minimumY ||
      extent.minimumY > bounds.maximumY
    ) {
      continue;
    }
    minimum = Math.min(minimum, entry.mesh.skirtMinimumHeight);
    maximum = Math.max(maximum, entry.mesh.maximumHeight);
  }
  range.frame = frameState.frameNumber;
  range.heights.x = minimum - 1;
  range.heights.y = maximum + 1;
  return range.heights;
}

function updateAnchors(batch, frameState) {
  if (batch._kind === "fill-extrusion") {
    if (batch._owner._globe) {
      extrusionAnchoring.update(batch, frameState);
    } else {
      updateExtrusionAnchors(batch);
    }
    return;
  }
  const terrain = batch._owner._terrain;
  const streams = batch._resources._anchorBuffers;
  if (!streams?.length || !terrain || batch._anchorTerrain === terrain) {
    return;
  }
  batch._anchorTerrain = terrain;
  if (batch._owner._globe) {
    const point = new Cartesian3();
    const encoded = new EncodedCartesian3();
    for (let i = 0; i < streams.length; i += 2) {
      const coordinates = batch._resources._anchorCoordinates[i / 2];
      const high = streams[i].values,
        low = streams[i + 1].values;
      let first = Infinity,
        last = 0;
      for (let j = 0; j < high.length / 3; j++) {
        const x = coordinates[j * 2] + batch._tileBounds.minimumX;
        const y = coordinates[j * 2 + 1] + batch._tileBounds.maximumY;
        GlobeCoordinates.position(x, y, terrain.height(x, y), point);
        Cartesian3.subtract(point, batch._origin, point);
        EncodedCartesian3.fromCartesian(point, encoded);
        for (let axis = 0; axis < 3; axis++) {
          const key = axis === 0 ? "x" : axis === 1 ? "y" : "z";
          const offset = j * 3 + axis;
          if (
            high[offset] !== Math.fround(encoded.high[key]) ||
            low[offset] !== Math.fround(encoded.low[key])
          ) {
            high[offset] = encoded.high[key];
            low[offset] = encoded.low[key];
            first = Math.min(first, offset);
            last = offset + 1;
          }
        }
      }
      if (last > first) {
        streams[i].buffer.copyFromArrayView(
          high.subarray(first, last),
          first * 4,
        );
        streams[i + 1].buffer.copyFromArrayView(
          low.subarray(first, last),
          first * 4,
        );
      }
    }
    return;
  }
  for (let i = 0; i < streams.length; i += 2) {
    const high = streams[i].values;
    const low = streams[i + 1].values;
    let start = Infinity,
      end = 0,
      lastX,
      lastY,
      height;
    for (let j = 0; j < low.length; j += 3) {
      const x = high[j] + low[j] + batch._tileBounds.minimumX;
      const y = high[j + 1] + low[j + 1] + batch._tileBounds.maximumY;
      if (x !== lastX || y !== lastY) {
        height = Math.fround(terrain.height(x, y));
        lastX = x;
        lastY = y;
      }
      if (low[j + 2] !== height) {
        low[j + 2] = height;
        start = Math.min(start, j + 2);
        end = j + 3;
      }
    }
    if (end > start) {
      streams[i + 1].buffer.copyFromArrayView(
        low.subarray(start, end),
        start * 4,
      );
    }
  }
}

function updateExtrusionAnchors(batch) {
  const terrain = batch._owner._terrain;
  if (!terrain || batch._anchorTerrain === terrain) {
    return;
  }
  batch._anchorTerrain = terrain;
  const resources = batch._resources;
  const streams = resources._anchorBuffers;
  const point = new Cartesian3();
  const encoded = new EncodedCartesian3();
  for (let i = 0; i < streams.length; i += 2) {
    const high = streams[i].values,
      low = streams[i + 1].values;
    const coordinates = resources._anchorCoordinates[i / 2];
    const data = resources._extrusionData[i / 2];
    let first = Infinity,
      last = 0,
      previousX,
      previousY,
      anchorHeight;
    for (let j = 0; j < high.length / 3; j++) {
      const cx = data[j * 4],
        cy = data[j * 4 + 1];
      if (cx !== previousX || cy !== previousY) {
        anchorHeight = terrain.height(
          cx + batch._tileBounds.minimumX,
          cy + batch._tileBounds.maximumY,
        );
        previousX = cx;
        previousY = cy;
      }
      const x = coordinates[j * 2],
        y = coordinates[j * 2 + 1];
      const z = data[j * 4 + 2];
      let height = anchorHeight + z;
      if (z === 0 && data[j * 4 + 3] === 0) {
        height = Math.min(
          height,
          terrain.height(
            x + batch._tileBounds.minimumX,
            y + batch._tileBounds.maximumY,
          ),
        );
      }
      Cartesian3.fromElements(x, y, height, point);
      EncodedCartesian3.fromCartesian(point, encoded);
      for (let axis = 0; axis < 3; axis++) {
        const key = axis === 0 ? "x" : axis === 1 ? "y" : "z";
        const offset = j * 3 + axis;
        const h = Math.fround(encoded.high[key]),
          l = Math.fround(encoded.low[key]);
        if (high[offset] !== h || low[offset] !== l) {
          high[offset] = h;
          low[offset] = l;
          first = Math.min(first, offset);
          last = offset + 1;
        }
      }
    }
    if (last > first) {
      streams[i].buffer.copyFromArrayView(
        high.subarray(first, last),
        first * 4,
      );
      streams[i + 1].buffer.copyFromArrayView(
        low.subarray(first, last),
        first * 4,
      );
    }
  }
}

/** Owns one tile/style geometry batch and its last published commands. @private */
function SceneGISVectorTileBatch(owner, tile, prepared, allowPicking, record) {
  if (prepared.kind === "fill-extrusion" && prepared.instances) {
    prepared = prepareBatch(prepared, allowPicking, false)[0];
  } else if (
    owner._ground &&
    prepared.instances &&
    prepared.kind !== "circle"
  ) {
    prepared = prepareBatch(prepared, allowPicking, true)[0];
  }
  this._ground = !!prepared.ground;
  this._kind = prepared.kind;
  this._minimumHeight = prepared.minimumHeight ?? 0;
  this._maximumHeight = prepared.maximumHeight ?? 0;
  this._heightRange = new Cartesian2();
  this._styleOpacity =
    prepared.kind === "fill-extrusion"
      ? prepared.geometries[0].attributes.color.values[3] / 255
      : 1;
  this._environmentResources = undefined;
  this.commands = [];
  this.renderCommands = [];
  this._regionCommands = [];
  this._tileBounds = tile.bounds;
  this._allowPicking = allowPicking;
  this._bounds = BoundingSphere.fromCornerPoints(
    new Cartesian3(tile.bounds.minimumX, tile.bounds.minimumY, 0),
    new Cartesian3(tile.bounds.maximumX, tile.bounds.maximumY, 0),
  );
  this._owner = owner;
  this._prepared = prepared;
  this._record = record;
  this._geometryKey = record?.key;
  this._resources = undefined;
  this._modelMatrix = Matrix4.fromTranslation(
    new Cartesian3(tile.bounds.minimumX, tile.bounds.maximumY, 0),
  );
  if (owner._globe) {
    this._origin = this._ground
      ? new Cartesian3()
      : GlobeCoordinates.position(
          tile.bounds.minimumX + tile.bounds.width * 0.5,
          tile.bounds.minimumY + tile.bounds.height * 0.5,
        );
    this._modelMatrix = Matrix4.fromTranslation(this._origin);
  }
}

SceneGISVectorTileBatch.prototype.update = function (frameState) {
  const extrusion = this._kind === "fill-extrusion";
  const heights = Cartesian2.fromElements(
    (this._owner._ground ? this._owner._groundHeights.x : 0) +
      this._minimumHeight,
    (this._owner._ground ? this._owner._groundHeights.y : 0) +
      this._maximumHeight,
    this._heightRange,
  );
  if (this._owner._globe) {
    if (
      !this._globeRegion ||
      this._globeRegion.minimumHeight !== heights.x ||
      this._globeRegion.maximumHeight !== heights.y
    ) {
      this._globeRegion = GlobeCover.region(this._tileBounds, heights);
      BoundingSphere.clone(this._globeRegion.boundingSphere, this._bounds);
    }
  } else if (this._owner._ground || extrusion) {
    const bounds = this._tileBounds;
    Cartesian3.fromElements(
      bounds.minimumX,
      bounds.minimumY,
      heights.x,
      minimumCorner,
    );
    Cartesian3.fromElements(
      bounds.maximumX,
      bounds.maximumY,
      heights.y,
      maximumCorner,
    );
    BoundingSphere.fromCornerPoints(minimumCorner, maximumCorner, this._bounds);
  }
  if (this._resources !== undefined) {
    const program = shaderProgram(this);
    for (const command of this.commands) {
      EnvironmentResources.setProgram(command, program);
      if (extrusion) {
        updateExtrusionState(this, command);
      }
    }
    updateAnchors(this, frameState);
    if (this._record?.uniformPaint && this._record.key === this._geometryKey) {
      this._resources.updatePaint(this._record.uniformPaint);
    }
    return;
  }
  this._resources = new BatchResources(
    frameState.context,
    this._prepared,
    this._owner,
    this._allowPicking,
    this._owner._groundGeometry,
  );
  this._prepared = undefined;
  updateAnchors(this, frameState);
  const depthRange = new Cartesian2();
  const uniformMap = {
    ...this._resources.uniformMap,
    u_sceneGISVectorOpacity: () => this._owner.opacity,
    ...environment.createUniformMap(this._owner),
    u_sceneGISGroundHeights: () => groundHeights(this, frameState),
    u_sceneGISGroundLighting: () => this._owner._world.enableLighting,
    u_sceneGISVectorMetersPerPixel: () => this._owner._metersPerPixel,
    u_sceneGISVectorDepthRange: () => {
      const splits = frameState.frustumSplits;
      const far = frameState.context.uniformState.currentFrustum.y;
      const index = splits.indexOf(far);
      depthRange.x = splits[index - 1];
      depthRange.y = far;
      return depthRange;
    },
  };
  if (this._resources._dashTexture !== undefined) {
    uniformMap.u_sceneGISVectorDashTable = () => this._resources._dashTexture;
    uniformMap.u_sceneGISVectorDashSize = () => this._resources._dashSize;
  }
  for (const vertexArray of this._resources._vertexArrays) {
    this.commands.push(
      new DrawCommand({
        owner: this._owner,
        vertexArray,
        shaderProgram: shaderProgram(this),
        modelMatrix: this._modelMatrix,
        boundingVolume: this._bounds,
        uniformMap,
        renderState: RenderState.fromCache(
          this._ground
            ? {
                ...colorState,
                cull: { enabled: true, face: CullFace.FRONT },
              }
            : colorState,
        ),
        instanceCount: this._resources.instanceCount ?? 0,
        pickId: this._allowPicking ? "v_pickColor" : undefined,
        primitiveType: PrimitiveType.TRIANGLES,
        pass: Pass.TERRAIN_CLASSIFICATION,
        cull: false,
        castShadows: false,
        receiveShadows: false,
      }),
    );
    if (extrusion) {
      updateExtrusionState(this, this.commands[this.commands.length - 1]);
    }
  }
};

function updateExtrusionState(batch, command) {
  const translucent = batch._styleOpacity * batch._owner.opacity < 1;
  const pass = translucent ? Pass.TRANSLUCENT : Pass.OPAQUE;
  if (command.pass === pass) {
    return;
  }
  command.pass = pass;
  command.renderState = RenderState.fromCache({
    depthTest: { enabled: true },
    depthMask: !translucent,
    cull: { enabled: true, face: CullFace.BACK },
    blending: translucent ? BlendingState.ALPHA_BLEND : undefined,
  });
}

SceneGISVectorTileBatch.prototype.setRegions = function (regions) {
  this.renderCommands.length = 0;
  const count = regions.length * this.commands.length;
  this._regionCommands.length = count;
  const bounds = this._tileBounds;
  let index = 0;
  for (const region of regions) {
    for (const source of this.commands) {
      let published = this._regionCommands[index];
      if (published === undefined) {
        const clip = new Cartesian4();
        published = { clip, uniformMap: {}, sourceMap: undefined };
        this._regionCommands[index] = published;
      }
      const clip = published.clip;
      Cartesian4.fromElements(
        region.minimumX - bounds.minimumX,
        region.minimumY - bounds.maximumY,
        region.maximumX - bounds.minimumX,
        region.maximumY - bounds.maximumY,
        clip,
      );
      if (
        published.source !== source ||
        published.sourceMap !== source.uniformMap
      ) {
        published.source = source;
        published.sourceMap = source.uniformMap;
        published.uniformMap = {
          ...source.uniformMap,
          u_sceneGISVectorTileClip: () => clip,
        };
        published.render = DrawCommand.shallowClone(source, published.render);
        published.render.uniformMap = published.uniformMap;
      }
      EnvironmentResources.setProgram(published.render, source.shaderProgram);
      published.render.pass = source.pass;
      published.render.renderState = source.renderState;
      this.renderCommands.push(published.render);
      index++;
    }
  }
};

SceneGISVectorTileBatch.prototype.queue = function (frameState) {
  if (
    frameState.passes.render ||
    (frameState.passes.pick &&
      !frameState.passes.depth &&
      this._allowPicking) ||
    (frameState.passes.depth && this._kind === "fill-extrusion")
  ) {
    for (const command of this.renderCommands) {
      frameState.commandList.push(command);
    }
  }
};

SceneGISVectorTileBatch.prototype.destroy = function () {
  extrusionAnchoring.clear(this);
  this._environmentResources?.destroy();
  this._resources?.destroy();
  this._anchorTerrain = undefined;
  this._prepared = undefined;
  this.commands.length = 0;
  this.renderCommands.length = 0;
  this._regionCommands.length = 0;
};

export default SceneGISVectorTileBatch;
