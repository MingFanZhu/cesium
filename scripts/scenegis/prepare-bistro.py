"""Prepare a source-preserving Bistro glTF using Blender's DDS decoder.

Run with Blender --background --factory-startup --python this-file --
source.glb original-bistro-directory output-directory [maximum-texture-size].
The source archive's README defines Specular as ORM and Normal as DirectX.
"""

import hashlib
import json
from pathlib import Path
import re
import shutil
import struct
import sys

import bpy
import numpy as np


def prepare(source, archive, output, maximum_size):
    output.mkdir(parents=True, exist_ok=True)
    textures = output / "textures"
    textures.mkdir(exist_ok=True)
    with source.open("rb") as stream:
        magic, version, total, json_size, json_type = struct.unpack("<5I", stream.read(20))
        assert magic == 0x46546C67 and version == 2 and json_type == 0x4E4F534A
        gltf = json.loads(stream.read(json_size))
        bin_size, bin_type = struct.unpack("<2I", stream.read(8))
        assert bin_type == 0x004E4942 and total == 28 + json_size + bin_size
        bin_start = stream.tell()
        image_views = {image["bufferView"] for image in gltf["images"]}
        view_mapping = {}
        views = []
        with (output / "Bistro.bin").open("wb") as binary:
            for index, view in enumerate(gltf["bufferViews"]):
                if index in image_views:
                    continue
                assert view.get("buffer", 0) == 0
                binary.write(b"\0" * (-binary.tell() % 4))
                stream.seek(bin_start + view.get("byteOffset", 0))
                data = stream.read(view["byteLength"])
                assert len(data) == view["byteLength"]
                view_mapping[index] = len(views)
                views.append({**view, "byteOffset": binary.tell()})
                binary.write(data)
            byte_length = binary.tell()
    for accessor in gltf["accessors"]:
        assert "sparse" not in accessor
        if "bufferView" in accessor:
            accessor["bufferView"] = view_mapping[accessor["bufferView"]]
    gltf["bufferViews"] = views
    gltf["buffers"] = [{"uri": "Bistro.bin", "byteLength": byte_length}]
    gltf["images"] = []
    gltf["textures"] = []
    gltf["samplers"] = [
        {"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}
    ]
    assert gltf.get("extensionsUsed") == ["KHR_materials_specular"]
    del gltf["extensionsUsed"]
    converted = {}
    records = []

    def texture(name, kind):
        filename = f"{name}_{kind}.dds"
        if filename in converted:
            return converted[filename]
        path = archive / "Textures" / filename
        if not path.is_file():
            raise FileNotFoundError(path)
        image = bpy.data.images.load(str(path), check_existing=False)
        # Work on stored channels, without a display transform or alpha premultiplication.
        image.colorspace_settings.name = "Non-Color"
        image.alpha_mode = "CHANNEL_PACKED"
        width, height = image.size
        pixels = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        pixels = pixels.reshape((-1, 4))
        alpha_min = float(pixels[:, 3].min())
        alpha_max = float(pixels[:, 3].max())
        channel_min = pixels.min(axis=0).tolist()
        channel_max = pixels.max(axis=0).tolist()
        if kind == "Normal":
            pixels[:, 1] = 1.0 - pixels[:, 1]
            image.pixels.foreach_set(pixels.ravel())
            image.update()
        if max(width, height) > maximum_size:
            ratio = maximum_size / max(width, height)
            image.scale(round(width * ratio), round(height * ratio))
        target = textures / f"{name}_{kind}.png"
        image.file_format = "PNG"
        image.filepath_raw = str(target)
        image.save()
        index = len(gltf["images"])
        gltf["images"].append({"uri": f"textures/{target.name}"})
        gltf["textures"].append({"sampler": 0, "source": index})
        record = {
            "source": f"Textures/{filename}",
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "uri": f"textures/{target.name}",
            "kind": kind,
            "sourceSize": [width, height],
            "size": list(image.size),
            "channelMin": channel_min,
            "channelMax": channel_max,
        }
        records.append(record)
        bpy.data.images.remove(image)
        result = (index, alpha_min, alpha_max)
        converted[filename] = result
        return result

    material_records = []
    for material in gltf["materials"]:
        name = material["name"]
        source_name = re.sub(r"(?:\.DoubleSided|\.\d{3})$", "", name)
        base, alpha_min, alpha_max = texture(source_name, "BaseColor")
        normal, _, _ = texture(source_name, "Normal")
        emissive = material.get("emissiveTexture")
        material.pop("extensions", None)
        material["pbrMetallicRoughness"] = {
            "baseColorTexture": {"index": base},
            "metallicFactor": 1,
            "roughnessFactor": 1,
        }
        if source_name == "Paris_LiquorBottle_01_Labels":
            # The source archive contains no ORM for this paper label. This explicit
            # dielectric/matte assembly assumption is recorded in the manifest.
            material["pbrMetallicRoughness"]["metallicFactor"] = 0
            orm = None
        else:
            orm, _, _ = texture(source_name, "Specular")
            material["pbrMetallicRoughness"]["metallicRoughnessTexture"] = {"index": orm}
            material["occlusionTexture"] = {"index": orm}
        material["normalTexture"] = {"index": normal}
        # Opaque texels do not need blending. Foliage and authored MASKED materials
        # use cutout coverage; retain continuous alpha on the remaining surfaces.
        if alpha_min == 1:
            material["alphaMode"] = "OPAQUE"
        elif name.startswith("Foliage_") or "MASKED" in name:
            material["alphaMode"] = "MASK"
            material["alphaCutoff"] = 0.5
        else:
            material["alphaMode"] = "BLEND"
        if emissive:
            index, _, _ = texture(source_name, "Emissive")
            material["emissiveTexture"] = {"index": index}
        material_records.append({
            "name": name,
            "source": source_name,
            "alphaMode": material["alphaMode"],
            "alphaRange": [alpha_min, alpha_max],
            "orm": orm is not None,
        })
    gltf["asset"]["generator"] += " / SceneGIS Bistro source material restoration"
    (output / "Bistro.gltf").write_text(
        json.dumps(gltf, separators=(",", ":")), encoding="utf8"
    )
    for name in ["LICENSE.txt", "README.txt", "CHANGELOG.txt"]:
        shutil.copyfile(archive / name, output / name)
    with source.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    report = {
        "id": "scenegis-bistro-v5.2-20260921",
        "sourceGlb": {"file": source.name, "sha256": digest, "bytes": total},
        "sourceFbx": {
            "file": "BistroExterior.fbx",
            "sha256": hashlib.sha256(
                (archive / "BistroExterior.fbx").read_bytes()
            ).hexdigest(),
        },
        "blender": bpy.app.version_string,
        "maximumTextureSize": maximum_size,
        "triangles": sum(
            gltf["accessors"][p["indices"]]["count"] // 3
            for mesh in gltf["meshes"] for p in mesh["primitives"]
        ),
        "materials": material_records,
        "textures": records,
        "assumptions": [
            "Paris_LiquorBottle_01_Labels has no source ORM: use metallic=0, roughness=1.",
            "Foliage/authored MASKED alpha cutoff=0.5.",
            "Source alpha does not implement physical glass transmission.",
        ],
        "textureMipBytesRGBA8": sum(
            r["size"][0] * r["size"][1] * 4 * 4 / 3 for r in records
        ),
    }
    (output / "prepared.json").write_text(json.dumps(report, indent=2), encoding="utf8")
    print("BISTRO_PREPARED", json.dumps({
        "triangles": report["triangles"],
        "textures": len(records),
        "textureMiB": round(report["textureMipBytesRGBA8"] / 1024**2),
        "alpha": {
            mode: sum(m["alphaMode"] == mode for m in material_records)
            for mode in ["OPAQUE", "MASK", "BLEND"]
        },
    }), flush=True)


if __name__ == "__main__":
    args = sys.argv[sys.argv.index("--") + 1:]
    prepare(
        Path(args[0]).resolve(), Path(args[1]).resolve(), Path(args[2]).resolve(),
        int(args[3]) if len(args) > 3 else 1024,
    )
