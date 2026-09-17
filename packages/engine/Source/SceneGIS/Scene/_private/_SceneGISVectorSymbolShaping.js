import RuntimeError from "../../../Core/RuntimeError.js";
import IconFit from "../../Core/_private/_SceneGISVectorIconFit.js";

function scaled(shape, scale, assets) {
  if (scale <= 0) {
    return { quads: [], box: undefined };
  }
  return {
    box: shape.box?.map((value) => value * scale),
    span: shape.span?.map((value) => value * scale),
    logicalBox: shape.logicalBox?.map((value) => value * scale),
    quads: shape.quads.map((quad) => ({
      ...quad,
      page:
        quad.page === "sprite" ? assets.sprite : assets.pages.get(quad.page),
      box: quad.box.map((value) => value * scale),
      scale: quad.scale * scale,
      center: quad.center === undefined ? undefined : quad.center * scale,
    })),
  };
}

/** Bounded normalized shaping cache; view projection and collision stay synchronous. @private */
function SceneGISVectorSymbolShaping(owner, assets, maximum) {
  this.owner = owner;
  this.assets = assets;
  this.maximum = maximum;
  this.records = new Map();
  this._waiting = new Map();
  this._pending = new Set();
  this.revision = 0;
  this.destroyed = false;
}
Object.defineProperty(SceneGISVectorSymbolShaping.prototype, "pending", {
  get() {
    return this._pending.size > 0;
  },
});
SceneGISVectorSymbolShaping.prototype.get = function (
  candidate,
  layout,
  image,
) {
  const normalized = { ...layout, "text-size": 24, "icon-size": 1 };
  const key = JSON.stringify([
    candidate.text,
    candidate.font,
    candidate.icon,
    normalized,
  ]);
  let record = this.records.get(key);
  if (
    record?.pages.some(
      ([key, generation]) =>
        (key === "sprite" ? this.assets.sprite : this.assets.pages.get(key))
          ?.generation !== generation,
    )
  ) {
    this.records.delete(key);
    this._waiting.delete(key);
    this._pending.delete(record);
    record = undefined;
  }
  if (!record) {
    if (this.records.size >= this.maximum) {
      const oldest = this.records.values().next().value;
      this.records.delete(oldest.key);
      this._waiting.delete(oldest.key);
      this._pending.delete(oldest);
    }
    const glyphs = new Map();
    const pages = new Map();
    for (const character of candidate.text) {
      if (character === "\r" || character === "\n") {
        continue;
      }
      const code = character.codePointAt(0);
      const item = this.assets.glyph(candidate.font, code);
      pages.set(item.page.key, item.page.generation);
      glyphs.set(code, {
        glyph: {
          advance: item.glyph.advance,
          left: item.glyph.left,
          top: item.glyph.top,
        },
        rect: item.rect,
        page: item.page.key,
      });
    }
    record = {
      key,
      pages: [
        ...pages,
        ...(image ? [["sprite", this.assets.sprite.generation]] : []),
      ],
      state: "waiting",
      item: { key, text: candidate.text, layout: normalized, image, glyphs },
    };
    this.records.set(key, record);
    this._waiting.set(key, record);
    this._pending.add(record);
  } else {
    this.records.delete(key);
    this.records.set(key, record);
  }
  if (record.error) {
    throw new RuntimeError(record.error);
  }
  if (!record.result) {
    return undefined;
  }
  const icon = (shape) =>
    shape.fit
      ? scaled(
          IconFit.scale(shape, layout["text-size"] / 24, layout["icon-size"]),
          1,
          this.assets,
        )
      : scaled(shape, layout["icon-size"], this.assets);
  return {
    text: scaled(record.result.text, layout["text-size"] / 24, this.assets),
    icon: icon(record.result.icon),
    icons:
      record.result.icons &&
      new Map(
        [...record.result.icons].map(([anchor, shape]) => [
          anchor,
          icon(shape),
        ]),
      ),
    variants:
      record.result.variants &&
      new Map(
        [...record.result.variants].map(([anchor, shape]) => [
          anchor,
          scaled(shape, layout["text-size"] / 24, this.assets),
        ]),
      ),
    pages: record.pages,
  };
};
SceneGISVectorSymbolShaping.prototype.flush = function () {
  while (this.owner._workers.available) {
    const records = [];
    for (const record of this._waiting.values()) {
      records.push(record);
      if (records.length === 128) {
        break;
      }
    }
    if (!records.length) {
      return;
    }
    const promise = this.owner._workers.schedule({
      kind: "shapes",
      items: records.map((record) => record.item),
    });
    if (!promise) {
      return;
    }
    for (const record of records) {
      record.state = "running";
      record.item = undefined;
      this._waiting.delete(record.key);
    }
    const finish = (result, error) => {
      if (this.destroyed) {
        return;
      }
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        this._pending.delete(record);
        if (this.records.get(record.key) !== record) {
          continue;
        }
        const shape = result?.shapes[i];
        record.error = error?.message ?? shape?.error;
        record.result = shape;
        record.state = "ready";
      }
      this.revision++;
      this.owner.scene.requestRender();
    };
    promise.then(
      (result) => finish(result),
      (error) => finish(undefined, error),
    );
  }
};
SceneGISVectorSymbolShaping.prototype.clear = function () {
  this.records.clear();
  this._waiting.clear();
  this._pending.clear();
};
SceneGISVectorSymbolShaping.prototype.destroy = function () {
  this.destroyed = true;
  this.clear();
};
export default SceneGISVectorSymbolShaping;
