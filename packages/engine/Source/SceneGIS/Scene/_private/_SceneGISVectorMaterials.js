import Resource from "../../../Core/Resource.js";
import Request from "../../../Core/Request.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import Material from "../../Core/_private/_SceneGISVectorBuildingMaterial.js";
import Resources from "../../Renderer/_private/_SceneGISVectorMaterialResources.js";

function fail(owner, error) {
  if (owner.destroyed || owner.error) {
    return;
  }
  owner.error = error;
  owner.loaded = true;
  owner.images = {};
  for (const entry of owner.entries) {
    entry.request?.cancel();
  }
  owner.owner.scene.requestRender();
}

async function load(owner, entry) {
  entry.state = "loading";
  entry.request = new Request({ throttle: false });
  owner.pending++;
  let image;
  try {
    image = await new Resource({
      url: entry.url,
      request: entry.request,
    }).fetchImage({
      preferImageBitmap: true,
      flipY: false,
      skipColorSpaceConversion: true,
    });
    if (owner.destroyed || owner.error) {
      return;
    }
    const width = image.width,
      height = image.height;
    const bytes = width * height * 4;
    if (
      width > owner.maximumSize ||
      height > owner.maximumSize ||
      owner.sourceBytes + bytes > owner.maximumBytes
    ) {
      throw new RuntimeError(
        "Building material images exceed maximumMaterialTextureBytes or Context limits.",
      );
    }
    // The temporary canvas belongs to this decode, unlike a persistent global pixel cache.
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, width, height).data;
      owner.images[entry.url] = {
        width,
        height,
        arrayBufferView: new Uint8Array(pixels.buffer),
      };
      owner.sourceBytes += bytes;
      entry.state = "ready";
    } finally {
      canvas.width = canvas.height = 0;
    }
  } catch (error) {
    fail(owner, error);
  } finally {
    image?.close?.();
    owner.pending--;
    if (!owner.destroyed) {
      owner.owner.scene.requestRender();
    }
  }
}

/** Fetch/decode/Worker state; GPU publication occurs only during the layer's normal update. @private */
function VectorMaterials(owner, maximumBytes, maximumRequests) {
  this.owner = owner;
  this.maximumBytes = maximumBytes;
  this.maximumRequests = maximumRequests;
  this.materials = owner.style._snapshot.materials;
  const urls = new Set(
    Object.values(this.materials).flatMap((material) =>
      Material.channels.map((key) => material[key]).filter(Boolean),
    ),
  );
  this.entries = [...urls].map((url) => ({ url, state: "idle" }));
  this.images = {};
  this.sourceBytes = 0;
  this.pending = 0;
  this.loaded = false;
  this.ready = false;
  this.destroyed = false;
}
VectorMaterials.prototype.update = function (context) {
  if (this.error) {
    if (!this.reported) {
      this.reported = true;
      this.owner.errorEvent.raiseEvent({
        layer: this.owner,
        resource: "building-materials",
        error: this.error,
      });
    }
    return;
  }
  if (this.ready) {
    return;
  }
  this.maximumSize = ContextLimits.maximumTextureSize;
  if (this.packed) {
    try {
      this.resources = new Resources(context, this.packed);
      this.loaded = this.ready = true;
    } catch (error) {
      fail(this, error);
    } finally {
      this.packed = undefined;
    }
    return;
  }
  for (const entry of this.entries) {
    if (entry.state === "idle" && this.pending < this.maximumRequests) {
      load(this, entry);
    }
  }
  if (!this.packing && this.entries.every((entry) => entry.state === "ready")) {
    this.packing = true;
    const images = this.images;
    this.images = {};
    try {
      this.owner._workers
        .enqueue(
          {
            kind: "materials",
            materials: this.materials,
            images,
            maximumTextureSize: this.maximumSize,
            maximumBytes: this.maximumBytes,
          },
          Object.values(images).map((image) => image.arrayBufferView.buffer),
        )
        .then(
          (result) => {
            if (!this.destroyed && !this.error) {
              this.packed = result;
              this.owner.scene.requestRender();
            }
          },
          (error) => fail(this, error),
        );
    } catch (error) {
      fail(this, error);
    }
  }
};
VectorMaterials.prototype.uniformMap = function () {
  return this.resources.uniformMap;
};
VectorMaterials.prototype.destroy = function () {
  this.destroyed = true;
  for (const entry of this.entries) {
    entry.request?.cancel();
  }
  this.resources?.destroy();
  this.resources = this.packed = undefined;
  this.images = {};
};
export default VectorMaterials;
