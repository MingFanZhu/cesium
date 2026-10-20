import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";

function validateWorld(world) {
  if (!(world instanceof SceneGISPlanarWorld) || world.isDestroyed()) {
    throw new DeveloperError(
      "planar.world must be a live SceneGISPlanarWorld.",
    );
  }
}

function forIntervals(value, callback) {
  if (!defined(value)) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(callback);
  } else {
    callback(value);
  }
}

function validateFrame(value) {
  if (defined(value.referenceFrame) && value.referenceFrame !== "FIXED") {
    throw new DeveloperError("Planar CZML requires referenceFrame FIXED.");
  }
}

function validatePacked(values, components, sampled) {
  if (!Array.isArray(values)) {
    throw new DeveloperError("Planar CZML coordinates must be packed arrays.");
  }
  const timed = sampled && values.length > components;
  const stride = components + (timed ? 1 : 0);
  if (values.length === 0 || values.length % stride !== 0) {
    throw new DeveloperError(
      "Planar CZML coordinate array has an invalid length.",
    );
  }
  for (let i = 0; i < values.length; i++) {
    if (timed && i % stride === 0 && typeof values[i] === "string") {
      // Native CZML validates ISO sample times and interprets numeric epoch offsets.
      continue;
    }
    if (!Number.isFinite(values[i])) {
      throw new DeveloperError(
        "Planar CZML coordinates must be finite world meters.",
      );
    }
  }
}

function validatePosition(value, sampled = true, holes = false) {
  forIntervals(value, function (interval) {
    if (interval.delete === true) {
      return;
    }
    validateFrame(interval);
    for (const encoding of [
      "cartographicDegrees",
      "cartographicRadians",
      "spherical",
      "unitSpherical",
      "unitCartesian",
    ]) {
      if (defined(interval[encoding])) {
        throw new DeveloperError(
          `Planar CZML positions require Cartesian world meters; ${encoding} is not supported.`,
        );
      }
    }
    if (defined(interval.cartesian)) {
      if (holes) {
        interval.cartesian.forEach((ring) => validatePacked(ring, 3, false));
      } else {
        validatePacked(interval.cartesian, 3, sampled);
      }
    }
    if (defined(interval.cartesianVelocity)) {
      if (!sampled || holes) {
        throw new DeveloperError(
          "cartesianVelocity is only supported for sampled positions.",
        );
      }
      validatePacked(interval.cartesianVelocity, 6, true);
    }
  });
}

function validatePacket(packet) {
  if (packet.id === "document" || packet.delete === true) {
    return;
  }
  validatePosition(packet.position);
  validatePosition(packet.viewFrom);
  for (const name of [
    "polyline",
    "polygon",
    "corridor",
    "wall",
    "polylineVolume",
  ]) {
    validatePosition(packet[name]?.positions, false);
  }
  validatePosition(packet.polygon?.holes, false, true);
  forIntervals(packet.orientation, function (interval) {
    validateFrame(interval);
    if (defined(interval.velocityReference)) {
      throw new DeveloperError(
        "Planar CZML orientation requires a fixed-axis quaternion; velocityReference uses an ellipsoid frame.",
      );
    }
  });
  forIntervals(packet.rectangle?.coordinates, function (interval) {
    if (defined(interval.wsenDegrees)) {
      throw new DeveloperError(
        "Planar CZML rectangle bounds must use wsen in world meters.",
      );
    }
  });
}

/**
 * Enforces an explicit per-instance fixed coordinate domain around native CZML parsing.
 * @private
 */
const SceneGISPlanarCzml = {
  prepare(dataSource, options) {
    let context = dataSource._sceneGISCzml;
    if (defined(context)) {
      if (
        defined(options) &&
        (!defined(context.world) || context.world !== options.world)
      ) {
        throw new DeveloperError(
          "CZML coordinate mode and planar world cannot change. Create a new CzmlDataSource.",
        );
      }
    } else {
      if (defined(options)) {
        validateWorld(options.world);
      }
      context = Object.freeze({ world: options?.world });
      dataSource._sceneGISCzml = context;
    }
    if (defined(context.world)) {
      validateWorld(context.world);
    }
  },

  validate(dataSource, packets) {
    const world = dataSource._sceneGISCzml?.world;
    if (!defined(world)) {
      return;
    }
    validateWorld(world);
    if (Array.isArray(packets)) {
      packets.forEach(validatePacket);
    } else {
      validatePacket(packets);
    }
  },

  validateScene(dataSource, scene) {
    const world = dataSource._sceneGISCzml?.world;
    if (!defined(world)) {
      return;
    }
    validateWorld(world);
    if (scene.world !== world) {
      throw new DeveloperError(
        "Planar CZML can only be displayed in its bound world.",
      );
    }
  },
};

export default SceneGISPlanarCzml;
