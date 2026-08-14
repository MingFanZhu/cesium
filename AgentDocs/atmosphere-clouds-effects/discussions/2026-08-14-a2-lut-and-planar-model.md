# Discussion：A2 LUT 资产与 planar atmosphere 模型

## Metadata

- Type: `discussion`
- Status: `resolved`
- Owner: Architecture Agent
- Created: `2026-08-14`
- Parent plan:
  [2026-08-14-atmosphere-clouds-effects-extension.md](../plans/2026-08-14-atmosphere-clouds-effects-extension.md)
- Phase plan:
  [2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md](../plans/2026-08-14-phase-a2-bruneton-atmosphere-aerial-perspective.md)
- Decision:
  [ADR-0041](../../../Documentation/SceneGIS/Decisions/ADR-0041-bruneton-atmosphere-aerial-perspective.md)

## Questions

1. A2 是否交付参考实现的五个 float16 LUT，还是使用 combined scattering？
2. Planar 是否直接把 fixed Z 映射为 Bruneton virtual sphere radius？
3. Runtime asset 应从公网加载、生成，还是随 engine package 交付？

## Source and measurement facts

- `Texture3D` 需要 WebGL2；half-float linear sampling有独立 capability guard。Reference loader在不支持其首选filter时会转换为
  Float32；SceneGIS 不接受这种隐式内存扩大或 nearest quality fallback。
- Fixed three-geospatial commit `9c6dfd0054f077f3ad4695b802e74d4c6a814440` 的 binary为 RGBA16F：
  transmittance 131,072 bytes、irradiance 8,192 bytes、scattering 8,388,608 bytes。Scattering alpha包含 combined single-Mie red；
  `single_mie_scattering.bin` 与 `higher_order_scattering.bin` 各再增加 8,388,608 bytes，A2无需它们。
- Fixed source的三个所选 binary与用户指定 Cesium reference commit中的 hash相同。Source package license同时包含 MIT与Bruneton/INRIA
  BSD-3-Clause notices。
- `copyEngineAssets` 已递归复制 `packages/engine/Source/Assets/**` 下 binary/JSON/TXT；Karma、dev/release build、engine/root package均有
  可验证 delivery seam，不需要新增 build hook。
- Spherical Bruneton的 ray-boundary、radius/mu parameterization 包含 planet curvature。仅把 planar Z 改名为 radius仍会产生有限 curved
  horizon，不是 fixed-axis slab。

## Options considered

### Five textures and Float32 decode

优点是接近参考 prototype；缺点是 LUT binary/GPU至少约 24 MiB，Float32 decode后更大，而且 higher-order separation在A2没有consumer。

### Three combined RGBA16F textures

优点是保留 Bruneton multiple-scattering runtime，binary/GPU仅 8.13 MiB，且可直接使用 Cesium HALF_FLOAT upload；缺点是后续若 cloud
shadow/god-ray确实需要 higher-order separation，必须重新形成 asset budget。

### Reuse spherical LUT for planar

代码共享最多，但会把地球曲率和虚假horizon引入planar坐标。

### Independent planar flat slab

共享 optical coefficients 与 capability family，几何保持 fixed `+Z`；A2只能承诺 bounded single scattering，不能宣称与 Globe的
multiple-scattering quality等价。

### Runtime CDN versus package-local assets

CDN初始repo较小，但破坏offline、version/hash、CORS与installed package自包含。Package-local增加约8.13 MiB，但可以稳定审计与发布。

## Resolution

- Globe只交付 three-geospatial fixed commit的 transmittance、combined scattering、irradiance三个 RGBA16F binary。
- Planar不加载或采样spherical LUT；使用同一fixed Earth optical coefficients的`+Z` flat-slab single-scattering model。
- Assets、provenance JSON与完整license text进入新 SceneGIS-owned
  `packages/engine/Source/Assets/SceneGIS/Environment/BrunetonEarth/`；runtime只用`buildModuleUrl` package-local路径。
- Importer只接收显式source directory并验证固定hash，不下载、不写入本机路径。A2不交付single-Mie/higher-order asset，也不做Float32扩展。
- Public API只暴露feature开关，不暴露会与fixed LUT脱钩的physical parameters。完整长期contract提升到ADR-0041。

## Follow-up

- A5只有在 cloud shadow/god-ray实现证明需要 separated higher-order data 时，才能重新审计额外8 MiB asset。
- A6根据真实 GPU evidence决定quality/downsample/temporal资源，不在A2提前增加history。
- A2 manual gate必须明确对比 Globe Bruneton multiple scattering与planar single-scattering visual差异，不能用“pixel parity”作为通过条件。
