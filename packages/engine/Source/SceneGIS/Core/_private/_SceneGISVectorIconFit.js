import RuntimeError from "../../../Core/RuntimeError.js";

function axis(image, index, content) {
  const name = index ? "stretchY" : "stretchX";
  const length = index ? image.height : image.width;
  const ranges = image[name] ?? [[0, length]];
  let previous = 0;
  if (!Array.isArray(ranges) || !ranges.length) {
    throw new RuntimeError(`Invalid sprite ${name}: expected stretch ranges.`);
  }
  for (const range of ranges) {
    if (
      !Array.isArray(range) ||
      range.length !== 2 ||
      !range.every(Number.isFinite) ||
      range[0] < previous ||
      range[1] <= range[0] ||
      range[1] > length
    ) {
      throw new RuntimeError(
        `Invalid sprite ${name}: ranges must be ordered, disjoint and within the image.`,
      );
    }
    previous = range[1];
  }
  const stretch = (position) =>
    ranges.reduce(
      (sum, [start, end]) => sum + Math.max(0, Math.min(position, end) - start),
      0,
    );
  const start = content[index],
    end = content[index + 2];
  const before = stretch(start),
    flexible = stretch(end) - before;
  if (flexible <= 0) {
    throw new RuntimeError(
      `Invalid sprite ${name}: content must intersect a stretch range.`,
    );
  }
  const fixed = end - start - flexible,
    total = stretch(length);
  const cuts = [...new Set([0, ...ranges.flat(), length])].sort(
    (a, b) => a - b,
  );
  return {
    cuts,
    coefficients: cuts.map((position) => {
      const flexiblePosition = stretch(position);
      return [
        (flexiblePosition - before) / flexible,
        (position -
          flexiblePosition -
          (start - before) -
          (fixed * flexiblePosition) / total) /
          image.pixelRatio,
      ];
    }),
    minimum: fixed / image.pixelRatio,
    natural: length / image.pixelRatio,
  };
}

/** Worker-prepared sprite slices; scale evaluates only cached linear coefficients. @private */
const SceneGISVectorIconFit = {
  prepare(image, page, layout, text) {
    const content = image.content ?? [0, 0, image.width, image.height];
    if (
      !Array.isArray(content) ||
      content.length !== 4 ||
      !content.every(Number.isFinite) ||
      content[0] < 0 ||
      content[1] < 0 ||
      content[2] > image.width ||
      content[3] > image.height ||
      content[2] <= content[0] ||
      content[3] <= content[1]
    ) {
      throw new RuntimeError(
        "Invalid sprite content: expected a nonempty rectangle within the image.",
      );
    }
    if (image.textFitWidth !== undefined || image.textFitHeight !== undefined) {
      throw new RuntimeError(
        "Sprite textFitWidth/textFitHeight constraints are not supported.",
      );
    }
    const axes = [axis(image, 0, content), axis(image, 1, content)];
    const quads = [];
    for (let x = 0; x < axes[0].cuts.length - 1; x++) {
      for (let y = 0; y < axes[1].cuts.length - 1; y++) {
        const a = axes[0].cuts,
          b = axes[1].cuts;
        quads.push({
          page,
          scale: 0,
          slice: [x, y],
          rect: {
            x: image.x + a[x],
            y: image.y + b[y],
            width: a[x + 1] - a[x],
            height: b[y + 1] - b[y],
          },
        });
      }
    }
    return {
      quads,
      fit: {
        axes,
        textBox: text.logicalBox,
        mode: layout["icon-text-fit"],
        padding: layout["icon-text-fit-padding"],
        offset: layout["icon-offset"],
      },
    };
  },
  scale(shape, fontScale, iconScale) {
    if (iconScale <= 0) {
      return { quads: [], box: undefined };
    }
    const { axes, textBox, mode, padding, offset } = shape.fit;
    const positions = axes.map((axis, index) => {
      const fitting = mode === "both" || mode === (index ? "height" : "width");
      const before = padding[index ? 0 : 3],
        after = padding[index ? 2 : 1];
      const low = textBox[index] * fontScale,
        high = textBox[index + 2] * fontScale;
      const size = fitting ? high - low + before + after : axis.natural;
      const left =
        offset[index] + (fitting ? low - before : (low + high - size) * 0.5);
      const scale =
        size > 0 ? Math.max(iconScale, axis.minimum / size) : iconScale;
      const width = Math.max(size * iconScale, axis.minimum);
      return axis.coefficients.map(
        ([fraction, fixed]) => left * scale + fraction * width + fixed,
      );
    });
    const [x, y] = positions;
    return {
      box: [x[0], y[0], x[x.length - 1], y[y.length - 1]],
      quads: shape.quads.map((quad) => ({
        ...quad,
        box: [
          x[quad.slice[0]],
          y[quad.slice[1]],
          x[quad.slice[0] + 1],
          y[quad.slice[1] + 1],
        ],
      })),
    };
  },
};
export default SceneGISVectorIconFit;
