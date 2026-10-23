/* global window, document, URLSearchParams */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
const viewer = new C.Viewer("map", {
  ...(planar
    ? {
        planarWorld: {
          crs: "LOCAL",
          extent: {
            minimumX: -1000,
            minimumY: -1000,
            maximumX: 1000,
            maximumY: 1000,
          },
          maximumLevel: 0,
          baseColor: C.Color.fromCssColorString("#343f43"),
        },
      }
    : { baseLayer: false }),
  skyBox: false,
  skyAtmosphere: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
});
const scene = viewer.scene;
if (planar) {
  viewer.addController(
    new C.SceneGISPlanarEnvironment({
      world: viewer.planarWorld,
      showAtmosphere: false,
      showSun: false,
      showMoon: false,
      sunDirection: C.Cartesian3.UNIT_Z,
      moonDirection: C.Cartesian3.UNIT_Y,
      directionMode: "astronomical",
      originLongitude: 0,
      originLatitude: C.Math.toRadians(35),
    }),
  );
}
viewer.addController(
  new C.SceneGISEnvironmentEffects({
    mode: planar ? "planar" : "globe",
    world: planar ? viewer.planarWorld : undefined,
    enabled: true,
    showAtmosphere: true,
    showClouds: false,
    showCloudShadows: false,
    showCrepuscularRays: false,
    showHeightFog: false,
    showAerialPerspective: false,
    showBloom: false,
    showLensFlare: false,
    showMoonlight: false,
    surfaceRadianceScale: 3,
    backgroundRadianceScale: 3,
  }),
);
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T10:00:00Z");
scene.highDynamicRange = true;
scene.fog.enabled = false;
if (scene.sun) {
  scene.sun.show = false;
}
if (scene.moon) {
  scene.moon.show = false;
}
if (scene.globe) {
  scene.globe.showGroundAtmosphere = false;
  scene.globe.baseColor = C.Color.fromCssColorString("#343f43");
}
const transform = planar
  ? C.Matrix4.fromTranslation(new C.Cartesian3(0, 0, 0.1))
  : C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(0, 35, 0.1));
const point = (x, y, z) =>
  C.Matrix4.multiplyByPoint(
    transform,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const direction = (x, y, z) =>
  C.Matrix4.multiplyByPointAsVector(
    transform,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
scene.light = new C.DirectionalLight({
  direction: direction(-0.4, 0.5, -1),
  intensity: 2,
});
function box(x, y, z, sx, sy, sz, color) {
  return scene.primitives.add(
    new C.Primitive({
      geometryInstances: new C.GeometryInstance({
        geometry: C.BoxGeometry.fromDimensions({
          dimensions: new C.Cartesian3(sx, sy, sz),
          vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(
            C.Color.fromCssColorString(color),
          ),
        },
      }),
      appearance: new C.PerInstanceColorAppearance({ translucent: false }),
      modelMatrix: C.Matrix4.multiplyByTranslation(
        transform,
        new C.Cartesian3(x, y, z),
        new C.Matrix4(),
      ),
      asynchronous: false,
    }),
  );
}

// The basin floor and walls visualize the solver's local box boundary.
box(0, -0.25, -0.12, 3.3, 3.8, 0.2, "#a8b4b7");
for (let x = 0; x < 10; x++) {
  for (let y = 0; y < 10; y++) {
    box(
      (x - 4.5) * 0.3,
      (y - 4.5) * 0.35 - 0.25,
      -0.0125,
      0.294,
      0.344,
      0.025,
      (x + y) % 2 === 0 ? "#517d85" : "#a1bcc0",
    );
  }
}
box(-1.56, -0.25, 0.08, 0.12, 3.74, 0.36, "#a8b4b7");
box(1.56, -0.25, 0.08, 0.12, 3.74, 0.36, "#a8b4b7");
box(0, -2.06, 0.08, 3, 0.12, 0.36, "#a8b4b7");
box(0, 1.56, 0.08, 3, 0.12, 0.36, "#a8b4b7");
for (const x of [-1.05, 1.05]) {
  box(x, 1.1, 0.49, 0.18, 0.22, 0.98, "#64737c");
  box(x, 1.1, 0.04, 0.46, 0.48, 0.08, "#85949a");
}

const pipeCenter = new C.Cartesian3(0, 1.1, 1.25);
const pipeRadius = 0.24;

// Build a hollow pipe with a real opening in its front wall. Each quad owns
// its normals so the hole's cut surfaces remain distinct from the shell.
function pipeGeometry() {
  const positions = [];
  const normals = [];
  const indices = [];
  function vertex(x, angle, radius) {
    return [x, Math.cos(angle) * radius, Math.sin(angle) * radius];
  }
  function radial(angle, sign = 1) {
    return [0, Math.cos(angle) * sign, Math.sin(angle) * sign];
  }
  function quad(points, faceNormals, reverse = false) {
    const base = positions.length / 3;
    for (let i = 0; i < 4; i++) {
      positions.push(...points[i]);
      normals.push(...faceNormals[i]);
    }
    const order = reverse ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
    indices.push(...order.map((i) => base + i));
  }
  const segments = 96;
  const rings = [-1.4, -0.09, 0.09, 1.4];
  const inner = 0.205;
  const holeStart = 43;
  const holeEnd = 53;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * C.Math.TWO_PI;
    const b = ((i + 1) / segments) * C.Math.TWO_PI;
    for (let j = 0; j < rings.length - 1; j++) {
      if (j === 1 && i >= holeStart && i < holeEnd) {
        continue;
      }
      for (const radius of [pipeRadius, inner]) {
        const inside = radius === inner;
        const sign = inside ? -1 : 1;
        quad(
          [
            vertex(rings[j], a, radius),
            vertex(rings[j], b, radius),
            vertex(rings[j + 1], b, radius),
            vertex(rings[j + 1], a, radius),
          ],
          [radial(a, sign), radial(b, sign), radial(b, sign), radial(a, sign)],
          inside,
        );
      }
    }
    // End rings and the two vertical cuts bordering the opening.
    const edges = [
      [-1.4, -1],
      [1.4, 1],
    ];
    if (i >= holeStart && i < holeEnd) {
      edges.push([-0.09, 1], [0.09, -1]);
    }
    for (const [x, sign] of edges) {
      quad(
        [
          vertex(x, a, inner),
          vertex(x, a, pipeRadius),
          vertex(x, b, pipeRadius),
          vertex(x, b, inner),
        ],
        Array(4).fill([sign, 0, 0]),
        sign < 0,
      );
    }
  }
  for (const [index, sign] of [
    [holeStart, 1],
    [holeEnd, -1],
  ]) {
    const angle = (index / segments) * C.Math.TWO_PI;
    quad(
      [
        vertex(-0.09, angle, inner),
        vertex(0.09, angle, inner),
        vertex(0.09, angle, pipeRadius),
        vertex(-0.09, angle, pipeRadius),
      ],
      Array(4).fill([0, -Math.sin(angle) * sign, Math.cos(angle) * sign]),
      sign < 0,
    );
  }
  return new C.Geometry({
    attributes: {
      position: new C.GeometryAttribute({
        componentDatatype: C.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: new Float64Array(positions),
      }),
      normal: new C.GeometryAttribute({
        componentDatatype: C.ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: new Float32Array(normals),
      }),
    },
    indices: new Uint16Array(indices),
    primitiveType: C.PrimitiveType.TRIANGLES,
    boundingSphere: C.BoundingSphere.fromVertices(positions),
  });
}
function pipePart(geometry, color, localMatrix) {
  return scene.primitives.add(
    new C.Primitive({
      geometryInstances: new C.GeometryInstance({
        geometry,
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(
            C.Color.fromCssColorString(color),
          ),
        },
      }),
      appearance: new C.PerInstanceColorAppearance({
        translucent: false,
        closed: true,
      }),
      modelMatrix: C.Matrix4.multiply(transform, localMatrix, new C.Matrix4()),
      asynchronous: false,
    }),
  );
}
const pipe = pipePart(
  pipeGeometry(),
  "#407f91",
  C.Matrix4.fromTranslation(pipeCenter),
);
const flangeRotation = C.Matrix3.fromQuaternion(
  C.Quaternion.fromAxisAngle(C.Cartesian3.UNIT_Y, C.Math.PI_OVER_TWO),
);
for (const x of [-1.22, 1.22]) {
  pipePart(
    new C.CylinderGeometry({
      length: 0.08,
      topRadius: 0.3,
      bottomRadius: 0.3,
      slices: 64,
      vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
    "#bac4c8",
    C.Matrix4.fromRotationTranslation(
      flangeRotation,
      new C.Cartesian3(x, pipeCenter.y, pipeCenter.z),
    ),
  );
}

const fluid = scene.primitives.add(
  new C.SceneGISFluidPrimitive({
    modelMatrix: transform,
    minimum: new C.Cartesian3(-1.5, -2, 0),
    maximum: new C.Cartesian3(1.5, 1.5, 2.8),
    maximumParticles: 8192,
    particleSpacing: 0.0325,
    emitterPosition: new C.Cartesian3(0, 0.835, 1.25),
    emitterOrientation: C.Quaternion.fromAxisAngle(
      C.Cartesian3.UNIT_X,
      C.Math.PI_OVER_TWO,
    ),
    emitterVelocity: new C.Cartesian3(0, 0, 3.2),
    emitterRadius: 0.065,
    emissionRate: 1320,
    particleLifetime: 5,
    renderRadius: 0.026,
    sprayIntensity: 1.5,
    sprayParticleRadius: 0.0045,
    roughness: 0.12,
  }),
);
const controls = {
  pitch: 25,
  updateEmitter() {
    const pitch = C.Math.toRadians(controls.pitch);
    C.Quaternion.fromAxisAngle(
      C.Cartesian3.UNIT_X,
      C.Math.PI_OVER_TWO - pitch,
      fluid.emitterOrientation,
    );
    fluid.emitterPosition.y =
      pipeCenter.y - Math.cos(pitch) * (pipeRadius + 0.025);
    fluid.emitterPosition.z =
      pipeCenter.z + Math.sin(pitch) * (pipeRadius + 0.025);
    const rotation = C.Matrix3.fromQuaternion(
      C.Quaternion.fromAxisAngle(C.Cartesian3.UNIT_X, -pitch),
    );
    const localMatrix = C.Matrix4.fromRotationTranslation(rotation, pipeCenter);
    C.Matrix4.multiply(transform, localMatrix, pipe.modelMatrix);
  },
  resetView() {
    scene.camera.setView({
      destination: point(2.8, -6.2, 3.4),
      orientation: {
        direction: C.Cartesian3.normalize(
          direction(-2.8, 6.1, -2.5),
          new C.Cartesian3(),
        ),
        up: direction(0, 0, 1),
      },
    });
  },
  inspectJet() {
    scene.camera.setView({
      destination: point(2, -1.8, 1.8),
      orientation: {
        direction: C.Cartesian3.normalize(
          direction(-2, 2, -0.65),
          new C.Cartesian3(),
        ),
        up: direction(0, 0, 1),
      },
    });
  },
};
const gui = new GUI({
  container: document.getElementById("controls"),
  title: "破口喷射控制",
});
gui.add(fluid, "emitting").name("开启泄漏");
gui.add(fluid, "paused").name("暂停模拟");
gui
  .add(controls, "pitch", -25, 45, 1)
  .name("破口仰角（度）")
  .onChange(controls.updateEmitter);
gui.add(fluid.emitterVelocity, "z", 1, 4.5, 0.1).name("喷射速度（米/秒）");
gui.add(fluid, "emissionRate", 480, 2400, 20).name("每秒发射数");
gui
  .add(fluid, "renderRadius", 0.01625, 0.04875, 0.00025)
  .name("粒子半径（米）");
gui.add(fluid, "surfaceAnisotropy", 0, 1, 0.1).name("水流形状重建");
gui.add(fluid, "sprayIntensity", 0, 4, 0.1).name("细小飞沫强度");
gui
  .add(fluid, "sprayParticleRadius", 0.0013, 0.008125, 0.0001)
  .name("飞沫半径（米）");
gui.add(fluid, "reflections").name("场景反射");
gui.add(fluid, "reset").name("重置流体");
gui.add(controls, "inspectJet").name("近看喷流");
gui.add(controls, "resetView").name("复位视角");
controls.updateEmitter();
controls.resetView();
viewer.clock.shouldAnimate = true;
scene.camera.frustum.near = 0.05;
scene.camera.frustum.far = 200;
scene.debugShowFramesPerSecond = true;
document.getElementById("status").textContent =
  "管径 0.48 米 · 3.25 厘米采样间距 · 8192 个流体槽位";
exposeExample(viewer, gui, { fluid });
