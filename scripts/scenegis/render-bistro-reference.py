"""Build an independent Cycles reference from the browser calibration export.

blender --background --factory-startup --python-exit-code 1 --python this-file --
  Test/Rendering/pbr-data/local/calibration/bistro-calibration.json [samples] [CUDA|OPTIX]

Large outputs stay beside the input, outside Git. The supplied asset is read-only.
"""

import base64
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
import zlib

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector
import numpy as np


def neutral(rgb, exposure=1.0, gamma=2.2):
    """Same output transform as Cesium, applied to scene-linear Rec.709.

    Source: Shaders/Builtin/Functions/pbrNeutralTonemapping.glsl and
    Shaders/PostProcessStages/PbrNeutralTonemapping.glsl, upstream 1.144,
    6d5d8b1f0725b6f831b336463f4b11c98023427b. Recheck on baseline upgrades.
    Khronos PBR Neutral: https://github.com/KhronosGroup/ToneMapping.
    """
    color = np.maximum(rgb * exposure, 0.0)
    low = color.min(axis=-1, keepdims=True)
    color -= np.where(low < 0.08, low - 6.25 * low * low, 0.04)
    peak = color.max(axis=-1, keepdims=True)
    active = peak >= 0.76
    safe_peak = np.maximum(peak, 0.76)
    new_peak = 1.0 - 0.24 * 0.24 / (safe_peak - 0.52)
    compressed = color * new_peak / safe_peak
    fade = 1.0 - 1.0 / (0.15 * (safe_peak - new_peak) + 1.0)
    color = np.where(active, compressed * (1.0 - fade) + new_peak * fade, color)
    return np.clip(color, 0.0, 1.0) ** (1.0 / gamma)


def write_png(path, rgb):
    """Encode already display-transformed RGB; rows are top-to-bottom."""
    pixels = np.rint(np.clip(rgb, 0, 1) * 255).astype(np.uint8)
    height, width, _ = pixels.shape

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    rows = b"".join(b"\x00" + row.tobytes() for row in pixels)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">2I5B", width, height, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(rows, 6)) + chunk(b"IEND", b""))


def configure_camera(scene, config):
    camera = config["snapshot"]["camera"]
    width, height = config["snapshot"]["resolution"]
    data = bpy.data.cameras.new("SceneGIS matched camera")
    obj = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(obj)
    direction = Vector(camera["direction"]).normalized()
    up = Vector(camera["up"]).normalized()
    right = direction.cross(up).normalized()
    up = right.cross(direction).normalized()
    obj.matrix_world = Matrix((right, up, -direction)).transposed().to_4x4()
    obj.location = camera["position"]
    # Cesium's perspective fov follows the longer viewport dimension.
    data.sensor_fit = "HORIZONTAL" if width >= height else "VERTICAL"
    data.sensor_width = data.sensor_height = 36.0
    data.lens = 18.0 / math.tan(camera["fov"] / 2.0)
    data.clip_start, data.clip_end = camera["near"], camera["far"]
    scene.camera = obj
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = 100
    scene.render.pixel_aspect_x = scene.render.pixel_aspect_y = 1
    bpy.context.view_layer.update()
    center = obj.location + direction * 10
    projected = world_to_camera_view(scene, obj, center)
    half_width = 10 * math.tan(camera["fov"] / 2) * min(1, width / height)
    edge = world_to_camera_view(scene, obj, center + right * half_width)
    assert abs(projected.x - 0.5) < 1e-5 and abs(projected.y - 0.5) < 1e-5
    assert abs(edge.x - 1) < 1e-5
    return {"center": list(projected), "rightEdge": list(edge), "matrix": [list(row) for row in obj.matrix_world]}


def configure_world(scene, config, directory):
    env = config["environment"]
    pixels = np.frombuffer(base64.b64decode(env["data"]), dtype="<f4").copy()
    assert pixels.size == env["width"] * env["height"] * 4 and np.isfinite(pixels).all()
    image = bpy.data.images.new("SceneGIS captured linear sky", width=env["width"], height=env["height"], float_buffer=True)
    image.colorspace_settings.name = "Non-Color"
    image.pixels.foreach_set(pixels)
    image.file_format = "OPEN_EXR"
    image.filepath_raw = str(directory / "sky-linear.exr")
    image.save()
    world = bpy.data.worlds.new("SceneGIS captured physical sky")
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    texture = nodes.new("ShaderNodeTexEnvironment")
    texture.image = image
    texture.projection = "EQUIRECTANGULAR"
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = 1
    output = nodes.new("ShaderNodeOutputWorld")
    links.new(texture.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], output.inputs["Surface"])
    scene.world = world

    beam = config["sun"]["beamIrradiance"]
    light = bpy.data.lights.new("SceneGIS measured Sun", "SUN")
    light.energy = max(beam)
    light.color = [component / light.energy for component in beam]
    light.angle = math.radians(config["sun"]["angularDiameterDegrees"])
    sun = bpy.data.objects.new(light.name, light)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (-Vector(config["sun"]["directionToLight"])).to_track_quat("-Z", "Y").to_euler()
    return {"sunEnergy": light.energy, "sunColor": list(light.color), "skyMaximum": float(pixels.reshape(-1, 4)[:, :3].max())}


def render_reference(config_path, samples, backend="CUDA"):
    config_path = config_path.resolve()
    directory = config_path.parent
    config = json.loads(config_path.read_text(encoding="utf-8"))
    assert config["schema"] == "scenegis-cycles-calibration-v1"
    assert config["output"]["tonemapper"] == "PBR_NEUTRAL"
    diagnostics = config["diagnostics"]
    image_names = ["runtime-original", "runtime-controlled", "runtime-noaa", "runtime-effects",
                   "material-basecolor", "material-roughness", "material-metalness", "material-normal", "material-occlusion"]
    for name in image_names:
        prefix, encoded = diagnostics["images"][name].split(",", 1)
        assert prefix == "data:image/png;base64"
        (directory / f"{name}.png").write_bytes(base64.b64decode(encoded, validate=True))
    runtime_report = {key: value for key, value in diagnostics.items() if key != "images"}
    runtime_report["images"] = image_names
    (directory / "runtime-report.json").write_text(json.dumps(runtime_report, indent=2), encoding="utf-8")
    model = (directory / config["model"]).resolve()
    source = json.loads(model.read_text(encoding="utf-8"))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(model), import_shading="NORMALS")
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    preferences = bpy.context.preferences.addons["cycles"].preferences
    preferences.compute_device_type = backend
    preferences.get_devices()
    for device in preferences.devices:
        device.use = device.type == backend
    if not any(d.use for d in preferences.devices):
        raise RuntimeError(f"This reference requires an available {backend} device.")
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.seed = 0
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.cycles.max_bounces = 8
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 4
    scene.cycles.transmission_bounces = 4
    scene.cycles.transparent_max_bounces = 8
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    camera_check = configure_camera(scene, config)
    light_check = configure_world(scene, config, directory)
    report = {
        "schema": "scenegis-cycles-reference-v1",
        "blender": bpy.app.version_string,
        "samples": samples,
        "backend": backend,
        "devices": [d.name for d in preferences.devices if d.use],
        "gltfSha256": hashlib.sha256(model.read_bytes()).hexdigest(),
        "materials": len(source["materials"]),
        "importedMeshes": len([o for o in scene.objects if o.type == "MESH"]),
        "cameraValidation": camera_check,
        "lighting": light_check,
        "snapshot": config["snapshot"],
        "output": config["output"],
        "limitations": config["limitations"] + [
            "Blender viewport uses Standard; delivered PNG is separately transformed with Cesium PBR Neutral/gamma.",
            "No geometry or material embellishment. glTF alpha remains alpha, without invented glass transmission.",
            "Finite 0.53-degree Sun produces physical penumbrae unlike shadow-map filtering.",
        ],
        "renders": [],
    }
    bpy.ops.wm.save_as_mainfile(filepath=str(directory / "Bistro-reference.blend"))
    for name, diffuse_bounces, glossy_bounces in [("cycles-full", 4, 4), ("cycles-direct", 0, 0)]:
        scene.cycles.diffuse_bounces = diffuse_bounces
        scene.cycles.glossy_bounces = glossy_bounces
        scene.render.filepath = str(directory / f"{name}.exr")
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(scene.render.filepath, check_existing=False)
        width, height = image.size
        pixels = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        rgb = pixels.reshape(height, width, 4)[::-1, :, :3]
        assert np.isfinite(rgb).all()
        display = neutral(rgb, config["output"]["exposure"], config["output"]["gamma"])
        write_png(directory / f"{name}.png", display)
        report["renders"].append({"name": name, "resolution": [width, height], "diffuseBounces": diffuse_bounces,
                                  "glossyBounces": glossy_bounces, "linearMaximum": float(rgb.max())})
        bpy.data.images.remove(image)
        (directory / "reference-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("SCENEGIS_REFERENCE_COMPLETE", json.dumps(report["renders"]), flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    render_reference(Path(args[0]), int(args[1]) if len(args) > 1 else 64, args[2] if len(args) > 2 else "CUDA")
