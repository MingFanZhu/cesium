import RuntimeError from "../../../Core/RuntimeError.js";

function scaled(shape, scale, assets) {
  if (scale <= 0) {
    return { quads: [], box: undefined };
  }
  return {
    box: shape.box?.map((value) => value * scale),
    span: shape.span?.map((value) => value * scale),
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
  this.revision = 0;
  this.destroyed = false;
}
Object.defineProperty(SceneGISVectorSymbolShaping.prototype, "pending", {
  get() {
    return [...this.records.values()].some(
      (record) => record.state === "waiting" || record.state === "running",
    );
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
    record = undefined;
  }
  if (!record) {
    if (this.records.size >= this.maximum) {
      this.records.delete(this.records.keys().next().value);
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
  return {
    text: scaled(record.result.text, layout["text-size"] / 24, this.assets),
    icon: scaled(record.result.icon, layout["icon-size"], this.assets),
    pages: record.pages,
  };
};
SceneGISVectorSymbolShaping.prototype.flush = function () {
  while (this.owner._workers.available) {
    const records = [...this.records.values()]
      .filter((record) => record.state === "waiting")
      .slice(0, 128);
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
    }
    const finish = (result, error) => {
      if (this.destroyed) {
        return;
      }
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
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
SceneGISVectorSymbolShaping.prototype.destroy = function () {
  this.destroyed = true;
  this.records.clear();
};
export default SceneGISVectorSymbolShaping;
