"""Run with Blender --background --factory-startup --python-exit-code 1 --python this-file.

The focused browser test writes the native GPU color samples first.
"""
import importlib.util
import json
import math
from pathlib import Path
import sys
import unittest

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

sys.dont_write_bytecode = True


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


reference = load("reference", "render-bistro-reference.py")
preparation = load("preparation", "prepare-bistro.py")


class CalibrationTests(unittest.TestCase):
    def test_output_matches_native_gpu(self):
        samples = json.loads(Path("Build/Specs/calibration/color-reference.json").read_text())
        actual = reference.neutral(np.array(samples["colors"], dtype=np.float32))
        expected = np.array(samples["reference"]).reshape(-1, 4)[:, :3]
        np.testing.assert_allclose(actual, expected, atol=2e-6)

    def test_camera_long_axis_and_orientation(self):
        for width, height in [(1600, 900), (900, 1600)]:
            bpy.ops.wm.read_factory_settings(use_empty=True)
            scene = bpy.context.scene
            config = {"snapshot": {"resolution": [width, height], "camera": {
                "position": [3, 5, 7], "direction": [0, 1, 0], "up": [0, 0, 1],
                "fov": math.pi / 2, "near": 0.05, "far": 1000}}}
            reference.configure_camera(scene, config)
            # At depth ten, the longer-axis FOV of 90 degrees spans +/- ten.
            point = Vector((13, 15, 7)) if width >= height else Vector((3, 15, 17))
            projected = world_to_camera_view(scene, scene.camera, point)
            self.assertAlmostEqual(projected.x if width >= height else projected.y, 1, places=5)

    def test_only_unused_bistro_ao_is_unbound(self):
        gltf = {"materials": [{"occlusionTexture": {"index": i}} for i in range(2)],
                "textures": [{"source": i} for i in range(2)],
                "images": [{"uri": str(i)} for i in range(2)]}
        records = [{"uri": "0", "kind": "Specular", "channelMax": [0, 1, 1]},
                   {"uri": "1", "kind": "Specular", "channelMax": [1, 1, 1]}]
        self.assertEqual(preparation.repair_occlusion_bindings(gltf, records), 1)
        self.assertNotIn("occlusionTexture", gltf["materials"][0])
        self.assertEqual(gltf["materials"][1]["occlusionTexture"]["index"], 1)


suite = unittest.defaultTestLoader.loadTestsFromTestCase(CalibrationTests)
if not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful():
    raise RuntimeError("Calibration contract failed.")
