# Flatten qualification fixture

SceneGIS-authored deterministic sloped grid; no third-party assets. The root
uses a coarse mesh and two child meshes refine the same surface. Root and glTF
node transforms are deliberately nonidentity. In the placement frame the
original surface is `z = 30 + 0.1*x + 0.05*y`, over `[-100,100]^2`.

Reproduce the checked-in test inputs with
`node scripts/scenegis/create-model-flatten-fixture.mjs`.
The manual photogrammetry option reuses `Test/Rendering/data/agi-hq.glb`;
its provenance/license remain in that directory.
