import Cartesian3 from "../../../Core/Cartesian3.js";
import Matrix3 from "../../../Core/Matrix3.js";
import Quaternion from "../../../Core/Quaternion.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import parseS3m from "./_SceneGISS3mParser.js";
import S3mTexture from "./_SceneGISS3mTexture.js";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

class Builder {
  constructor() {
    this.parts = [];
    this.length = 0;
    this.features = [];
    this.featureMap = new Map();
    this.gltf = {
      asset: { version: "2.0", generator: "SceneGIS S3M 1.0 bridge" },
      scene: 0,
      scenes: [{ nodes: [] }],
      nodes: [],
      meshes: [],
      materials: [],
      textures: [],
      images: [],
      samplers: [],
      buffers: [],
      bufferViews: [],
      accessors: [],
      extensionsUsed: ["EXT_structural_metadata"],
    };
  }

  use(extension) {
    if (!this.gltf.extensionsUsed.includes(extension)) {
      this.gltf.extensionsUsed.push(extension);
    }
  }

  view(array) {
    const bytes = new Uint8Array(
      array.buffer,
      array.byteOffset,
      array.byteLength,
    );
    const index = this.gltf.bufferViews.length;
    this.gltf.bufferViews.push({
      buffer: 0,
      byteOffset: this.length,
      byteLength: bytes.length,
    });
    this.parts.push({ offset: this.length, bytes });
    this.length += (bytes.length + 3) & ~3;
    return index;
  }

  accessor(array, dimension, bounds = false) {
    const componentType =
      array instanceof Uint32Array
        ? 5125
        : array instanceof Uint16Array
          ? 5123
          : 5126;
    const accessor = {
      bufferView: this.view(array),
      componentType,
      count: array.length / dimension,
      type: ["", "SCALAR", "VEC2", "VEC3", "VEC4"][dimension],
    };
    if (bounds) {
      accessor.min = Array(dimension).fill(Infinity);
      accessor.max = Array(dimension).fill(-Infinity);
      for (let i = 0; i < array.length; i++) {
        if (!Number.isFinite(array[i])) {
          throw new RuntimeError("S3M positions must be finite.");
        }
        const c = i % dimension;
        accessor.min[c] = Math.min(accessor.min[c], array[i]);
        accessor.max[c] = Math.max(accessor.max[c], array[i]);
      }
    }
    return this.gltf.accessors.push(accessor) - 1;
  }

  feature(id, geometry, instance) {
    const kind = id === undefined ? "geometry" : "object";
    const key =
      kind === "object" ? `id:${id}` : `geometry:${geometry}:${instance ?? ""}`;
    if (!this.featureMap.has(key)) {
      this.featureMap.set(key, this.features.length);
      this.features.push({
        s3mId: id === undefined ? "" : String(id),
        idKind: kind,
        geometry,
      });
    }
    return this.featureMap.get(key);
  }

  finish() {
    const gltf = this.gltf;
    const properties = {};
    for (const name of ["s3mId", "idKind", "geometry"]) {
      const strings = this.features.map((f) =>
        new TextEncoder().encode(f[name]),
      );
      const offsets = new Uint32Array(strings.length + 1);
      for (let i = 0; i < strings.length; i++) {
        offsets[i + 1] = offsets[i] + strings[i].length;
      }
      const bytes = new Uint8Array(offsets[offsets.length - 1]);
      strings.forEach((s, i) => bytes.set(s, offsets[i]));
      // Empty strings still require a nonempty bufferView.
      properties[name] = {
        values: this.view(bytes.length ? bytes : new Uint8Array(1)),
        stringOffsets: this.view(offsets),
      };
    }
    gltf.extensions = {
      EXT_structural_metadata: {
        schema: {
          classes: {
            s3m: {
              properties: {
                s3mId: { type: "STRING" },
                idKind: { type: "STRING" },
                geometry: { type: "STRING" },
              },
            },
          },
        },
        propertyTables: [
          { class: "s3m", count: this.features.length, properties },
        ],
      },
    };
    gltf.buffers.push({ byteLength: this.length });
    const json = new TextEncoder().encode(JSON.stringify(gltf));
    const jsonLength = (json.length + 3) & ~3;
    const output = new Uint8Array(28 + jsonLength + this.length);
    const view = new DataView(output.buffer);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, output.length, true);
    view.setUint32(12, jsonLength, true);
    view.setUint32(16, 0x4e4f534a, true);
    output.fill(32, 20, 20 + jsonLength);
    output.set(json, 20);
    view.setUint32(20 + jsonLength, this.length, true);
    view.setUint32(24 + jsonLength, 0x004e4942, true);
    for (const part of this.parts) {
      output.set(part.bytes, 28 + jsonLength + part.offset);
    }
    return output;
  }
}

function linear(value) {
  return Math.pow(value, 2.2);
}

function materialFor(
  builder,
  decoded,
  material,
  tint,
  pngCache,
  materialCache,
) {
  const key = `${material.id}:${tint.join(",")}`;
  if (materialCache.has(key)) {
    return materialCache.get(key);
  }
  const diffuse = material.diffuse ?? { r: 1, g: 1, b: 1, a: 1 };
  const pbr = {
    baseColorFactor: [
      diffuse.r * linear(tint[0]),
      diffuse.g * linear(tint[1]),
      diffuse.b * linear(tint[2]),
      diffuse.a * tint[3],
    ],
    metallicFactor: 0,
    roughnessFactor: 1,
  };
  const state = material.textureunitstates?.[0]?.textureunitstate;
  if (state) {
    const texture = decoded.textures[state.id];
    if (!texture) {
      throw new RuntimeError(`Missing S3M texture: ${state.id}.`);
    }
    let png = pngCache.get(state.id);
    if (!png) {
      png = S3mTexture.toPng(texture);
      pngCache.set(state.id, png);
    }
    const image =
      builder.gltf.images.push({
        bufferView: builder.view(png),
        mimeType: "image/png",
      }) - 1;
    const address = state.addressmode;
    const sampler =
      builder.gltf.samplers.push({
        wrapS: address?.u === 0 ? 10497 : 33071,
        wrapT: address?.v === 0 ? 10497 : 33071,
        minFilter: 9987,
        magFilter: 9729,
      }) - 1;
    const index = builder.gltf.textures.push({ source: image, sampler }) - 1;
    pbr.baseColorTexture = { index };
  }
  const index =
    builder.gltf.materials.push({
      name: material.id,
      pbrMetallicRoughness: pbr,
      doubleSided: material.cullMode === "none",
      alphaMode: material.transparentsorting ? "BLEND" : "MASK",
      alphaCutoff: 0.1,
    }) - 1;
  materialCache.set(key, index);
  return index;
}

function vertexFeatureIds(builder, geometry) {
  const ids = new Uint32Array(geometry.position.count);
  const ranges = geometry.ranges;
  if (!ranges?.length) {
    ids.fill(builder.feature(undefined, geometry.name));
    return ids;
  }
  ids.fill(0xffffffff);
  for (const { id, offset, length } of ranges) {
    if (offset + length > ids.length) {
      throw new RuntimeError("S3M selection range exceeds its geometry.");
    }
    ids.fill(builder.feature(id, geometry.name), offset, offset + length);
  }
  for (let i = 0; i < ids.length; i++) {
    if (ids[i] === 0xffffffff) {
      ids[i] = builder.feature(undefined, geometry.name);
    }
  }
  return ids;
}

function makePrimitive(builder, geometry, indexPackage, material, vertexIds) {
  const { position, normal, color } = geometry;
  const texcoord = geometry.texcoords[0];
  const indices = indexPackage.values;
  if (
    position.dimension < 3 ||
    indices.length % 3 !== 0 ||
    indices.length === 0
  ) {
    throw new RuntimeError("Invalid S3M triangle geometry.");
  }
  // The official shader derives face normals when none are supplied. Expand only
  // those triangles so native Model receives equivalent flat geometry normals.
  const expand = normal === undefined;
  const count = expand ? indices.length : position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const uv = new Float32Array(count * 2);
  const features = vertexIds ? new Uint32Array(count) : undefined;
  const state = material.textureunitstates?.[0]?.textureunitstate;
  const textureMatrix = state?.texmodmatrix ?? identity;
  for (let i = 0; i < count; i++) {
    const source = expand ? indices[i] : i;
    if (source >= position.count) {
      throw new RuntimeError("S3M index exceeds its vertex count.");
    }
    for (let c = 0; c < 3; c++) {
      positions[i * 3 + c] = position.values[source * position.dimension + c];
      if (normal) {
        normals[i * 3 + c] = normal.values[source * normal.dimension + c];
      }
      colors[i * 4 + c] = color ? linear(color[source * 4 + c] / 255) : 1;
    }
    colors[i * 4 + 3] = color ? color[source * 4 + 3] / 255 : 1;
    if (features) {
      features[i] = vertexIds[source];
    }
    const u = texcoord ? texcoord.values[source * texcoord.dimension] : 0.5;
    const v = texcoord ? texcoord.values[source * texcoord.dimension + 1] : 0.5;
    uv[i * 2] = textureMatrix[0] * u + textureMatrix[4] * v + textureMatrix[12];
    uv[i * 2 + 1] =
      textureMatrix[1] * u + textureMatrix[5] * v + textureMatrix[13];
  }
  if (expand) {
    for (let i = 0; i < count; i += 3) {
      const a = i * 3;
      const ux = positions[a + 3] - positions[a];
      const uy = positions[a + 4] - positions[a + 1];
      const uz = positions[a + 5] - positions[a + 2];
      const vx = positions[a + 6] - positions[a];
      const vy = positions[a + 7] - positions[a + 1];
      const vz = positions[a + 8] - positions[a + 2];
      const x = uy * vz - uz * vy;
      const y = uz * vx - ux * vz;
      const z = ux * vy - uy * vx;
      const length = Math.hypot(x, y, z);
      // Degenerate triangles have no coverage; a finite normal keeps the loader valid.
      const n = length === 0 ? [0, 0, 1] : [x / length, y / length, z / length];
      normals.set(n, a);
      normals.set(n, a + 3);
      normals.set(n, a + 6);
    }
  }
  const attributes = {
    POSITION: builder.accessor(positions, 3, true),
    NORMAL: builder.accessor(normals, 3),
    COLOR_0: builder.accessor(colors, 4),
  };
  if (state) {
    attributes.TEXCOORD_0 = builder.accessor(uv, 2);
  }
  const primitive = { attributes, mode: 4 };
  if (!expand) {
    if (indices.some((index) => index >= position.count)) {
      throw new RuntimeError("S3M index exceeds its vertex count.");
    }
    primitive.indices = builder.accessor(indices, 1);
  }
  if (features) {
    builder.use("EXT_mesh_features");
    attributes._FEATURE_ID_0 = builder.accessor(features, 1);
    primitive.extensions = {
      EXT_mesh_features: {
        featureIds: [
          {
            attribute: 0,
            propertyTable: 0,
            featureCount: 0,
            label: "s3m",
          },
        ],
      },
    };
  }
  return primitive;
}

function instanceGroups(instances) {
  const groups = new Map();
  for (let i = 0; i < instances.count; i++) {
    const tint = Array.from(
      instances.values.subarray(i * 17 + 12, i * 17 + 16),
    );
    const key = tint.join(",");
    let group = groups.get(key);
    if (!group) {
      group = { tint, indices: [] };
      groups.set(key, group);
    }
    group.indices.push(i);
  }
  return [...groups.values()];
}

function addInstances(builder, node, geometry, group) {
  const count = group.indices.length;
  const translations = new Float32Array(count * 3);
  const scales = new Float32Array(count * 3);
  const rotations = new Float32Array(count * 4);
  const features = new Uint32Array(count);
  const values = geometry.instances.values;
  const rotation = new Matrix3();
  const quaternion = new Quaternion();
  for (let i = 0; i < count; i++) {
    const index = group.indices[i];
    const offset = index * 17;
    const columns = [
      new Cartesian3(values[offset], values[offset + 4], values[offset + 8]),
      new Cartesian3(
        values[offset + 1],
        values[offset + 5],
        values[offset + 9],
      ),
      new Cartesian3(
        values[offset + 2],
        values[offset + 6],
        values[offset + 10],
      ),
    ];
    const scale = columns.map((c) => Cartesian3.magnitude(c));
    if (scale.some((s) => !Number.isFinite(s) || s <= 0)) {
      throw new RuntimeError(
        "S3M instance transform must have finite nonzero scale.",
      );
    }
    for (let c = 0; c < 3; c++) {
      Cartesian3.divideByScalar(columns[c], scale[c], columns[c]);
      Matrix3.setColumn(rotation, c, columns[c], rotation);
    }
    if (
      [
        Cartesian3.dot(columns[0], columns[1]),
        Cartesian3.dot(columns[1], columns[2]),
        Cartesian3.dot(columns[0], columns[2]),
      ].some((dot) => Math.abs(dot) > 1e-5)
    ) {
      throw new RuntimeError(
        "Sheared S3M instance transforms are not supported.",
      );
    }
    if (Matrix3.determinant(rotation) < 0) {
      scale[0] = -scale[0];
      Cartesian3.negate(columns[0], columns[0]);
      Matrix3.setColumn(rotation, 0, columns[0], rotation);
    }
    Quaternion.fromRotationMatrix(rotation, quaternion);
    Quaternion.normalize(quaternion, quaternion);
    translations.set(
      [values[offset + 3], values[offset + 7], values[offset + 11]],
      i * 3,
    );
    scales.set(scale, i * 3);
    rotations.set(
      [quaternion.x, quaternion.y, quaternion.z, quaternion.w],
      i * 4,
    );
    features[i] = builder.feature(
      geometry.instances.ids?.[index],
      geometry.name,
      index,
    );
  }
  builder.use("EXT_mesh_gpu_instancing");
  builder.use("EXT_instance_features");
  builder.gltf.extensionsRequired = ["EXT_mesh_gpu_instancing"];
  node.extensions = {
    EXT_mesh_gpu_instancing: {
      attributes: {
        TRANSLATION: builder.accessor(translations, 3, true),
        ROTATION: builder.accessor(rotations, 4),
        SCALE: builder.accessor(scales, 3),
        _FEATURE_ID_0: builder.accessor(features, 1),
      },
    },
    EXT_instance_features: {
      featureIds: [
        {
          attribute: 0,
          propertyTable: 0,
          featureCount: 0,
          label: "s3m",
        },
      ],
    },
  };
}

function convertPage(decoded, page, pngCache) {
  const builder = new Builder();
  const materials = new Map(
    decoded.materials.map((entry) => [entry.material.id, entry.material]),
  );
  const materialCache = new Map();
  for (const geode of page.geodes) {
    if (!geode.matrix.every(Number.isFinite)) {
      throw new RuntimeError("S3M geode transforms must be finite.");
    }
    for (const name of geode.names) {
      const geometry = decoded.geometries[name];
      if (!geometry) {
        throw new RuntimeError(`Missing S3M geometry: ${name}.`);
      }
      const groups = geometry.instances
        ? instanceGroups(geometry.instances)
        : [{ tint: [1, 1, 1, 1] }];
      const vertexIds = geometry.instances
        ? undefined
        : vertexFeatureIds(builder, geometry);
      for (const group of groups) {
        const primitives = [];
        for (const indexPackage of geometry.indices) {
          const material = materials.get(indexPackage.material);
          if (!material) {
            throw new RuntimeError(
              `Missing S3M material: ${indexPackage.material}.`,
            );
          }
          const primitive = makePrimitive(
            builder,
            geometry,
            indexPackage,
            material,
            vertexIds,
          );
          primitive.material = materialFor(
            builder,
            decoded,
            material,
            group.tint,
            pngCache,
            materialCache,
          );
          primitives.push(primitive);
        }
        const mesh = builder.gltf.meshes.push({ primitives }) - 1;
        const node = { mesh, matrix: geode.matrix };
        if (geometry.instances) {
          addInstances(builder, node, geometry, group);
        }
        builder.gltf.scenes[0].nodes.push(builder.gltf.nodes.push(node) - 1);
      }
    }
  }
  if (builder.gltf.meshes.length === 0) {
    return undefined;
  }
  const count = builder.features.length;
  for (const mesh of builder.gltf.meshes) {
    for (const primitive of mesh.primitives) {
      if (primitive.extensions) {
        primitive.extensions.EXT_mesh_features.featureIds[0].featureCount =
          count;
      }
    }
  }
  for (const node of builder.gltf.nodes) {
    if (node.extensions) {
      node.extensions.EXT_instance_features.featureIds[0].featureCount = count;
    }
  }
  return builder.finish();
}

/**
 * Converts one S3MB payload into native Model inputs and its PageLOD records.
 * @param {object} parameters Task parameters.
 * @param {ArrayBuffer[]} transferableObjects Output buffers transferred to the caller.
 * @returns {object} PageLOD records with optional GLB payloads.
 * @private
 */
function prepareS3m(parameters, transferableObjects = []) {
  const decoded = parseS3m(parameters.buffer);
  const pngCache = new Map();
  const pages = decoded.pages.map((page) => {
    const glb = convertPage(decoded, page, pngCache);
    if (glb) {
      transferableObjects.push(glb.buffer);
    }
    return {
      range: page.range,
      rangeMode: page.rangeMode,
      center: page.center,
      radius: page.radius,
      child: page.child,
      glb,
    };
  });
  return { pages };
}

export default prepareS3m;
