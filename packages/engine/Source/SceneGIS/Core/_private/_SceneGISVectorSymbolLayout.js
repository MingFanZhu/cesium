const anchors = {
  center: [0.5, 0.5],
  left: [0, 0.5],
  right: [1, 0.5],
  top: [0.5, 0],
  bottom: [0.5, 1],
  "top-left": [0, 0],
  "top-right": [1, 0],
  "bottom-left": [0, 1],
  "bottom-right": [1, 1],
};

function bounds(quads) {
  if (!quads.length) {
    return undefined;
  }
  return [
    Math.min(...quads.map((q) => q.box[0])),
    Math.min(...quads.map((q) => q.box[1])),
    Math.max(...quads.map((q) => q.box[2])),
    Math.max(...quads.map((q) => q.box[3])),
  ];
}

function textOffset(layout, anchor) {
  const radial = layout["text-radial-offset"];
  const offset = layout["text-offset"];
  if (radial === undefined && !layout["text-variable-anchor"]) {
    return offset;
  }
  const x = 1 - 2 * anchor[0],
    y = 1 - 2 * anchor[1];
  const distance =
    radial === undefined
      ? undefined
      : Math.max(0, radial) / (x && y ? Math.SQRT2 : 1);
  return [
    x * (distance ?? Math.abs(offset[0])),
    y * ((distance ?? Math.abs(offset[1])) - 7 / 24),
  ];
}

/** Pure symbol metrics and screen-space collision. Units are CSS pixels. @private */
const SceneGISVectorSymbolLayout = {
  text(text, layout, lookup) {
    const size = layout["text-size"];
    if (!text || size <= 0) {
      return { quads: [], box: undefined };
    }
    const scale = size / 24;
    const spacing = layout["text-letter-spacing"] * size;
    const limit =
      layout["symbol-placement"] === "point" && layout["text-max-width"] > 0
        ? layout["text-max-width"] * size
        : Infinity;
    const lines = [[]];
    let width = 0;
    // Latin words stay together; ideographs are legal break positions.
    const tokens =
      text.match(/[^\s\u2e80-\u9fff]+|[\u2e80-\u9fff]|[^\S\n]+|\n/gu) ?? [];
    for (const token of tokens) {
      if (token === "\n") {
        lines.push([]);
        width = 0;
        continue;
      }
      const chars = [...token].map((character) => ({
        character,
        ...lookup(character.codePointAt(0)),
      }));
      const tokenWidth = chars.reduce(
        (sum, g) => sum + g.glyph.advance * scale + spacing,
        0,
      );
      if (width > 0 && width + tokenWidth > limit && token.trim()) {
        lines.push([]);
        width = 0;
      }
      if (!width && !token.trim()) {
        continue;
      }
      lines[lines.length - 1].push(...chars);
      width += tokenWidth;
    }
    for (const line of lines) {
      while (line.length && !line[line.length - 1].character.trim()) {
        line.pop();
      }
    }
    const widths = lines.map((line) =>
      Math.max(
        0,
        line.reduce((sum, g) => sum + g.glyph.advance * scale + spacing, 0) -
          spacing,
      ),
    );
    const maxWidth = Math.max(...widths);
    const lineHeight = size * layout["text-line-height"];
    const anchor = anchors[layout["text-anchor"]];
    const offset = textOffset(layout, anchor);
    const justification =
      layout["text-justify"] === "auto"
        ? anchor[0]
        : { left: 0, center: 0.5, right: 1 }[layout["text-justify"]];
    const quads = [];
    for (let row = 0; row < lines.length; row++) {
      let x =
        -maxWidth * anchor[0] +
        (maxWidth - widths[row]) * justification +
        offset[0] * size;
      // Glyph-PBF metrics use the 24-pixel em and a baseline offset of -17.
      const baseline =
        -17 * scale +
        0.5 * lineHeight -
        lines.length * lineHeight * anchor[1] +
        row * lineHeight +
        offset[1] * size;
      for (const item of lines[row]) {
        const { glyph, rect, page } = item;
        if (rect) {
          const left = x + (glyph.left - 3) * scale;
          const top = baseline - (glyph.top + 3) * scale;
          quads.push({
            page,
            rect,
            box: [
              left,
              top,
              left + rect.width * scale,
              top + rect.height * scale,
            ],
            scale,
            center: x + glyph.advance * scale * 0.5,
            row,
          });
        }
        x += glyph.advance * scale + spacing;
      }
    }
    return {
      quads,
      box: bounds(quads),
      span: [
        -maxWidth * anchor[0] + offset[0] * size,
        maxWidth * (1 - anchor[0]) + offset[0] * size,
      ],
    };
  },
  icon(image, page, layout) {
    if (!image || layout["icon-size"] <= 0) {
      return { quads: [], box: undefined };
    }
    const scale = layout["icon-size"] / image.pixelRatio;
    const anchor = anchors[layout["icon-anchor"]];
    const width = image.width * scale,
      height = image.height * scale;
    const offset = layout["icon-offset"].map(
      (value) => value * layout["icon-size"],
    );
    const box = [
      -width * anchor[0] + offset[0],
      -height * anchor[1] + offset[1],
      width * (1 - anchor[0]) + offset[0],
      height * (1 - anchor[1]) + offset[1],
    ];
    return { quads: [{ page, rect: image, box, scale: 0 }], box };
  },
  collision() {
    const cells = new Map();
    function keys(box) {
      const result = [];
      for (let x = Math.floor(box[0] / 64); x <= Math.floor(box[2] / 64); x++) {
        for (
          let y = Math.floor(box[1] / 64);
          y <= Math.floor(box[3] / 64);
          y++
        ) {
          result.push(`${x}/${y}`);
        }
      }
      return result;
    }
    return {
      hits(box) {
        return keys(box).some((key) =>
          (cells.get(key) ?? []).some(
            (other) =>
              box[0] < other[2] &&
              box[2] > other[0] &&
              box[1] < other[3] &&
              box[3] > other[1],
          ),
        );
      },
      insert(box) {
        for (const key of keys(box)) {
          if (!cells.has(key)) {
            cells.set(key, []);
          }
          cells.get(key).push(box);
        }
      },
    };
  },
  place(textBox, iconBox, layout, collision, commit = true) {
    const textBoxes = !textBox
      ? []
      : typeof textBox[0] === "number"
        ? [textBox]
        : textBox;
    const iconBoxes = !iconBox
      ? []
      : typeof iconBox[0] === "number"
        ? [iconBox]
        : iconBox;
    let text =
      textBoxes.length > 0 &&
      (layout["text-allow-overlap"] ||
        !textBoxes.some((box) => collision.hits(box)));
    let icon =
      iconBoxes.length > 0 &&
      (layout["icon-allow-overlap"] ||
        !iconBoxes.some((box) => collision.hits(box)));
    if (textBoxes.length && iconBoxes.length) {
      if (!text && !layout["text-optional"]) {
        icon = false;
      }
      if (!icon && !layout["icon-optional"]) {
        text = false;
      }
    }
    if (commit && text && !layout["text-ignore-placement"]) {
      textBoxes.forEach((box) => collision.insert(box));
    }
    if (commit && icon && !layout["icon-ignore-placement"]) {
      iconBoxes.forEach((box) => collision.insert(box));
    }
    return { text, icon };
  },
};
export default SceneGISVectorSymbolLayout;
