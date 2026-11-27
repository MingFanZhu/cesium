# Reference assets

## AGI HQ photogrammetry

- Publisher: AGI / Cesium.
- Source page: <https://cesium.com/learn/3d-tiling/ion-tile-photogrammetry/>.
- Download: <https://cesium.com/public/learn/AGI_HQ.zip>.
- Source page states that its content and code examples are available under Apache 2.0.
  The linked archive contains OBJ, MTL and two JPEG images, with no separate license override.
  Apache license text is included in `LICENSE-AGI-HQ.txt`; retain this attribution.
- Fixed source SHA-256: `254ac95ccef0db6288979a3f43c0861ee1f9abc62ae87f3ddf821572bfbc7e87`.
- Conversion: Cesium `obj2gltf@3.2.0`, source Z-up to standard glTF Y-up, embedded original images.
  No retexturing, delighting or invented surface detail. The source has no normals: derive
  area-weighted corner normals from the original triangles, smoothing within each face's
  hemisphere. Opposite-facing coincident source faces retain separate normals. Positions,
  topology and UVs are unchanged. Without normals Cesium would render this scan unlit.
  Material conversion uses the tool's
  standard Blinn-Phong to metallic/roughness conversion. The example can bypass relighting.
- The 3D Tiles 1.1 wrapper recenters the scan and places its lowest vertex at local Z=0.
  Globe placement uses an approximate Pennsylvania reference, not a surveyed registration.
- 139,461 source triangles; GLB 9,375,132 bytes. `manifest.json` records bounds and fingerprints.
  This is a single-leaf campus reference, not an urban streaming/LOD benchmark.

These files are pinned input fixtures served from the repository. The page makes no public
network requests and does not need an ion token. The raw archive and temporary conversion files
are not part of the repository. To reproduce with Node 22 or newer:

```powershell
$referenceTools = Join-Path $env:TEMP 'scenegis-reference-tools'
npm install --prefix $referenceTools --no-audit --no-fund obj2gltf@3.2.0
node scripts/scenegis/prepare-rendering-reference.mjs $referenceTools
```

The preparer uses the repository's existing `adm-zip` dependency. A source checksum change fails
explicitly and requires a deliberate dataset review. Review the resulting asset before replacement.

## Additional reference objects

The example reuses the public CesiumMilkTruck GLB already in `Apps/SampleData/models/` and the
native Box fixture in `Specs/Data/Models/`. They remain in their existing locations and retain
their original attribution. The neutral glossy surface is an explicit example material, not a
modification of the scanned building's textures. No extra downloaded PBR texture set is required.
