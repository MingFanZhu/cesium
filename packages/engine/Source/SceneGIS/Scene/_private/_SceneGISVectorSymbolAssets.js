import Resource from "../../../Core/Resource.js";
import Request from "../../../Core/Request.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import Texture from "../../../Renderer/Texture.js";
import Sampler from "../../../Renderer/Sampler.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";

function resource(url, entry) {
  const request = new Request({ throttle: false });
  entry.requests.push(request);
  return new Resource({ url, request });
}
function release(entry) {
  entry.released = true;
  for (const request of entry.requests) {
    request.cancel();
  }
  entry.texture?.destroy();
  entry.image?.close?.();
}

/** Layer-owned bounded glyph ranges and a single ordinary sprite. @private */
function SceneGISVectorSymbolAssets(owner, maximumRanges, maximumRequests) {
  this.owner = owner;
  this.maximumRanges = maximumRanges;
  this.maximumRequests = maximumRequests;
  this.pages = new Map();
  this.sprite = undefined;
  this.pending = 0;
  this.revision = 0;
  this.errors = [];
  this.destroyed = false;
  this.clock = 0;
  this._nextGeneration = 0;
}
SceneGISVectorSymbolAssets.key = function (font, code) {
  return `${font}/${Math.floor(code / 256)}`;
};
SceneGISVectorSymbolAssets.prototype.prepare = function (
  requirements,
  spriteNeeded,
  protectedKeys,
) {
  if (requirements.size > this.maximumRanges) {
    throw new RuntimeError(
      "Active symbol glyph ranges exceed maximumGlyphRanges.",
    );
  }
  const now = ++this.clock;
  const needed = new Set(requirements.keys());
  for (const [key, requirement] of requirements) {
    let entry = this.pages.get(key);
    if (!entry) {
      if (this.pages.size >= this.maximumRanges) {
        const candidates = [...this.pages.values()].filter(
          (p) => !needed.has(p.key) && !protectedKeys.has(p.key),
        );
        candidates.sort((a, b) => a.used - b.used);
        const victim = candidates[0];
        if (victim) {
          release(victim);
          this.pages.delete(victim.key);
        }
        // Only the currently published cohort may exceed the cache budget while
        // its replacement loads. Both cohorts individually obey maximumRanges.
      }
      entry = {
        ...requirement,
        key,
        state: "idle",
        requests: [],
        used: now,
        generation: ++this._nextGeneration,
      };
      this.pages.set(key, entry);
    }
    entry.used = now;
  }
  if (this.pages.size > this.maximumRanges) {
    const unused = [...this.pages.values()]
      .filter((page) => !needed.has(page.key) && !protectedKeys.has(page.key))
      .sort((a, b) => a.used - b.used);
    for (const page of unused) {
      if (this.pages.size <= this.maximumRanges) {
        break;
      }
      release(page);
      this.pages.delete(page.key);
    }
  }
  if (spriteNeeded && !this.sprite) {
    this.sprite = {
      key: "sprite",
      state: "idle",
      requests: [],
      generation: ++this._nextGeneration,
    };
  }
  const entries = [...needed].map((key) => this.pages.get(key));
  if (spriteNeeded) {
    entries.unshift(this.sprite);
  }
  for (const entry of entries) {
    if (entry.state !== "idle" || this.pending >= this.maximumRequests) {
      continue;
    }
    entry.state = "pending";
    this.pending++;
    const style = this.owner.style;
    const load = async () => {
      if (entry === this.sprite) {
        if (!style.sprite) {
          throw new RuntimeError("symbol icon-image requires a sprite URL.");
        }
        entry.metadata = await resource(
          `${style.sprite}.json`,
          entry,
        ).fetchJson();
        if (this.destroyed || entry.released) {
          return;
        }
        entry.image = await resource(`${style.sprite}.png`, entry).fetchImage();
        return;
      }
      if (!style.glyphs) {
        throw new RuntimeError("symbol text-field requires a glyphs URL.");
      }
      const start = entry.range * 256;
      const url = style.glyphs
        .replace("{fontstack}", encodeURIComponent(entry.font))
        .replace("{range}", `${start}-${start + 255}`);
      const bytes = await resource(url, entry).fetchArrayBuffer();
      if (this.destroyed || entry.released) {
        return;
      }
      const buffer = bytes.slice(0);
      const result = await this.owner._workers.enqueue(
        { kind: "glyphs", buffer, range: entry.range },
        [ArrayBuffer.isView(buffer) ? buffer.buffer : buffer],
      );
      if (this.destroyed || entry.released) {
        return;
      }
      if (
        result.kind !== "glyphs" ||
        !(result.glyphs instanceof Map) ||
        !(result.image?.arrayBufferView instanceof Uint8Array) ||
        result.image.width * result.image.height !==
          result.image.arrayBufferView.length
      ) {
        throw new RuntimeError("Invalid vector Worker glyph result.");
      }
      entry.glyphs = result.glyphs;
      entry.image = result.image;
      entry.cpuBytes = result.image.arrayBufferView.byteLength;
      for (const glyph of result.glyphs.values()) {
        entry.cpuBytes += glyph.bitmap.byteLength;
      }
    };
    const settle = (error) => {
      if (this.destroyed) {
        entry.image?.close?.();
        return;
      }
      this.pending--;
      if (entry.released) {
        entry.image?.close?.();
        this.revision++;
        this.owner.scene.requestRender();
        return;
      }
      entry.state = error ? "failed" : "ready";
      if (error) {
        this.errors.push({ resource: entry.key, error });
      }
      this.revision++;
      this.owner.scene.requestRender();
    };
    load().then(() => settle(), settle);
  }
  this.loaded = entries.every(
    (entry) => entry.state === "ready" || entry.state === "failed",
  );
};
SceneGISVectorSymbolAssets.prototype.texture = function (entry, context) {
  if (!entry.texture) {
    entry.texture = new Texture({
      context,
      source: entry.image,
      flipY: false,
      pixelFormat:
        entry === this.sprite
          ? PixelFormat.RGBA
          : context.webgl2
            ? PixelFormat.RED
            : PixelFormat.LUMINANCE,
      sampler: new Sampler({
        minificationFilter: TextureMinificationFilter.LINEAR,
        magnificationFilter: TextureMagnificationFilter.LINEAR,
      }),
    });
  }
  return entry.texture;
};
SceneGISVectorSymbolAssets.prototype.glyph = function (font, code) {
  const page = this.pages.get(SceneGISVectorSymbolAssets.key(font, code));
  if (page?.state !== "ready") {
    return undefined;
  }
  const glyph = page.glyphs.get(code);
  if (!glyph) {
    throw new RuntimeError(`Missing glyph U+${code.toString(16)} in ${font}`);
  }
  return { glyph, rect: page.image.positions.get(code), page };
};
SceneGISVectorSymbolAssets.prototype.destroy = function () {
  this.destroyed = true;
  for (const page of this.pages.values()) {
    release(page);
  }
  if (this.sprite) {
    release(this.sprite);
  }
  this.pages.clear();
  this.sprite = undefined;
};
export default SceneGISVectorSymbolAssets;
