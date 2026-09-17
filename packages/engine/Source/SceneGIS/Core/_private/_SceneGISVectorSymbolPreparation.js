import Cartesian3 from "../../../Core/Cartesian3.js";
import EncodedCartesian3 from "../../../Core/EncodedCartesian3.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import Line from "./_SceneGISVectorSymbolLine.js";
import State from "./_SceneGISVectorState.js";
function content(layout) {
  let text = layout["text-field"] ?? "";
  if (layout["text-transform"] === "uppercase") {
    text = text.toUpperCase();
  }
  if (layout["text-transform"] === "lowercase") {
    text = text.toLowerCase();
  }
  const font = layout["text-font"].join(",");
  const ranges = new Set();
  for (const character of text) {
    if (character !== "\r" && character !== "\n") {
      ranges.add(Math.floor(character.codePointAt(0) / 256));
    }
  }
  return {
    text,
    icon: layout["icon-image"] ?? "",
    font,
    requirements: [...ranges].map((range) => ({
      key: `${font}/${range}`,
      font,
      range,
    })),
  };
}
function featureAnchors(
  feature,
  layout,
  coordinates,
  entry,
  state,
  metersPerPixel,
  zoom,
) {
  const result = [];
  const placement = layout["symbol-placement"];
  for (const part of feature.geometry.parts) {
    if (feature.type === 1) {
      if (placement === "point") {
        for (let i = 0; i < part.length; i += 2) {
          result.push({ position: coordinates.toWorld(part[i], part[i + 1]) });
        }
      }
      continue;
    }
    const points = [];
    for (let i = 0; i < part.length; i += 2) {
      points.push(coordinates.toWorld(part[i], part[i + 1]));
    }
    if (placement === "point") {
      result.push({ position: points[0] });
      continue;
    }
    const overzoom = Math.max(0, Math.floor(zoom) - state.source.maximumLevel);
    const tilePixel =
      (entry.bounds.maximumX - entry.bounds.minimumX) / (512 * 2 ** overzoom);
    const spacing =
      layout["symbol-spacing"] * Math.max(metersPerPixel, tilePixel);
    for (const clipped of placement === "line"
      ? Line.clip(points, entry.bounds)
      : [points]) {
      const line = Line.path(clipped);
      for (const station of Line.anchors(line, spacing, placement)) {
        const anchor = Line.sample(line, station);
        result.push({
          position: new Cartesian3(anchor.x, anchor.y, 0),
          line,
          station,
        });
      }
    }
  }
  return result;
}

/** Tile-local symbol filtering, paths and anchors, executed in the Worker. @private */
function prepareVectorSymbols(
  style,
  definition,
  sourceLayer,
  coordinates,
  entry,
  state,
  metersPerPixel,
  zoom,
  report,
  stateContext,
) {
  const labels = [];
  for (const feature of sourceLayer.features) {
    const evaluation = style._evaluateVisibleLayer(
      definition.id,
      feature,
      zoom,
      undefined,
      State.context(
        stateContext?.featureStates,
        sourceLayer.name,
        feature.id,
        stateContext?.globalState,
      ),
    );
    if (!evaluation) {
      continue;
    }
    const names = content(evaluation.value.layout);
    if (!names.text && !names.icon) {
      continue;
    }
    if (feature.type === 3) {
      report(
        `${definition.id}/geometry`,
        new RuntimeError(
          `Symbol profile requires MVT Point or LineString geometry: ${definition.id}`,
        ),
      );
      continue;
    }
    const anchors = featureAnchors(
      feature,
      evaluation.value.layout,
      coordinates,
      entry,
      state,
      metersPerPixel,
      zoom,
    );
    for (const anchor of anchors) {
      anchor.encoded = EncodedCartesian3.fromCartesian(anchor.position);
    }
    labels.push({
      feature: {
        id: feature.id,
        type: feature.type,
        properties: feature.properties,
      },
      evaluation,
      names,
      anchors,
      key: JSON.stringify([
        definition.source,
        definition.id,
        names.text,
        names.icon,
        names.font,
      ]),
    });
  }
  return labels;
}
export default prepareVectorSymbols;
