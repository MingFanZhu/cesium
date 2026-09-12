# Globe 高级环境升级检查清单

本清单用于 Cesium 官方版本升级时复核已交付的 Globe A2–A7 高级环境能力。它是操作清单，不替代 `Architecture.md`、ADR 或 SGP 清单。

## 1. 基线与工作树

- [ ] 从 `.scenegis/upstream-base.json` 确认目标 Cesium 官方基线、tag 与 tree。
- [ ] 在独立 `upgrade/cesium-*` 分支合入上游，不混入功能开发。
- [ ] 记录冻结的上一阶段 checkpoint，并保持可直接回退。
- [ ] 确认 `packages/engine/index.js`、`packages/engine/index.d.ts`、`Build/**`、`Source/Cesium.js`、`Source/Cesium.d.ts` 和 Spec barrels 仍由生成器拥有，未被手工编辑。

## 2. 构建、类型与文档入口

按顺序执行，避免并发写入共享 `Build/**`：

```powershell
npm run build
npm run build-release
npm run build-ts
npm run tsc
npm run build-docs
node scripts/scenegis/verify-planar-packages.mjs
```

- [ ] workspace 与 installed tarball 的 root、engine、widgets exports 均可导入。
- [ ] `SceneGISEnvironmentEffects` public options、defaults、types 与 API docs 一致。
- [ ] SceneGIS private renderer、private shaders 与内部 helpers 未进入 public exports/types。
- [ ] development/release bundles 都只形成一个 Cesium runtime identity。

## 3. Upstream patch seams

执行：

```powershell
node scripts/scenegis/audit-upstream-patches.mjs
```

### SGP-0008

- [ ] `packages/engine/Source/Scene/Scene.js` 中 paired markers 完整。
- [ ] advanced-background 与 pre-tonemap linear-HDR slots 的时序仍位于 ADR-0040 定义的位置。
- [ ] 运行 `SceneGISAdvancedEnvironmentRenderSlot`、private pipeline 与 atmosphere reference-frame focused Specs。
- [ ] 如上游提供等价公开 slots，先走 ADR/SGP retirement，不在升级中并存第二套 seam。

### SGP-0009

- [ ] 以下三个 upstream-owned paths 均保留 paired markers，且没有第四条路径：
  - `packages/engine/Source/Scene/GlobeSurfaceShaderSet.js`
  - `packages/engine/Source/Scene/GlobeSurfaceTileProvider.js`
  - `packages/engine/Source/Shaders/GlobeFS.glsl`
- [ ] frame-local Globe lighting record、shader variant flag 与 uniform callbacks 仍是显式、无全局状态的窄 seam。
- [ ] 运行 `SceneGISEnvironmentEffects` 与 `GlobeSurfaceTileProvider` focused Specs。
- [ ] 如上游提供等价 surface material-lighting hook，先复核 ADR-0047 的 removal condition。

## 4. 确定性资产与 provenance

- [ ] A2 Bruneton LUT 与 A4 CloudCore 资产均从本地包加载，无运行时公网依赖。
- [ ] CloudCore `PROVENANCE.json` 的尺寸、channel、format、byte order、bytes 与 SHA-256 和实际文件一致。
- [ ] CloudCore generator 的 `--verify-only`、atomic output 与 byte-compare 仍通过。
- [ ] 不把本机路径、临时 reference clone 或未核验 opaque binary 写入产品或 AgentDocs。
- [ ] MIT/reference equations 的 commit、文件与 copyright 记录仍可追踪。

## 5. 冻结资源与质量预算

### Cloud MRT 与 history

- [ ] low/medium/high cloud scale 为 `0.375 / 0.5 / 0.75`。
- [ ] low-resolution Cloud MRT 仍为一个 two-attachment RGBA16F manager，bytes 为 `16 * ceil(W*scale) * ceil(H*scale)`。
- [ ] cloud history 仍仅有两个 full-resolution ping-pong managers，每个 two RGBA16F attachments，总计 `32 * W * H` bytes。
- [ ] A6 只演进上述 history；没有第三 MRT、velocity/history texture、额外 pass 或 readback。
- [ ] deterministic CloudCore static payload、texture count 与当前 `PROVENANCE.json` 完全一致。

### Quality profiles 与 Beer atlas

| Tier     | Cloud scale | Primary/fine/Sun | Detail | BSM cascades/tile/steps | BSM bytes    |
| -------- | ----------- | ---------------- | ------ | ----------------------- | ------------ |
| `low`    | `0.375`     | `32/1/2`         | off    | `2/256/25`              | `2,097,152`  |
| `medium` | `0.5`       | `64/4/3`         | on     | `3/512/50`              | `8,388,608`  |
| `high`   | `0.75`      | `64/4/4`         | on     | `3/768/50`              | `18,874,368` |

- [ ] BSM 仍为一个 current-frame RGBA16F atlas/FBO/program，无 depth/history。
- [ ] surface receiver 仍使用 Beer-transmittance-space 3×3 PCF；shadow-length path 仍使用冻结的 raw progressive sampling。

### HDR bloom 与 lens flare

- [ ] A7 仍为 three programs、four command objects、three color-only RGBA16F FBOs、zero history/depth/readback/asset。
- [ ] 两个 half-resolution ping-pong targets 与一个 full-resolution target 的 bytes 为 `8*W*H + 16*ceil(W/2)*ceil(H/2)`，约 `12*W*H`。
- [ ] blur 仍按固定 `1/2/4` 三 octave 调度现有 H/V commands；未新增 mip chain 或 target。
- [ ] 两个 A7 toggle 都为 false 时在分配/command 之前返回 incoming texture。

## 6. 生命周期与冲突

- [ ] controller disabled 保持 Cesium identity；disconnect/destroy 精确释放 owned resources。
- [ ] Globe terrain-depth prerequisite 在 controller activation 时获取，在 disable/disconnect 时按 ownership 恢复。
- [ ] caller-owned `scene.sunBloom=false`、native bloom disabled、native Globe lighting/fog/atmosphere conflicts 仍 fail closed，不被每帧静默改写。
- [ ] resize 与 quality switch candidate-first，失败时保留 last-good resources。
- [ ] `pagehide` cleanup 区分 BFCache，non-persisted 离开才幂等销毁 Test caller-owned 对象。

## 7. Focused qualification

- [ ] 依次运行 A8 phase plan 列出的五组 focused Specs。
- [ ] development 与 release 各运行一次 `Specs/e2e/scenegis-globe-environment.spec.js`。
- [ ] E2E 默认只使用本地 Natural Earth II，不产生公网 request；Planar 只做入口/启动 smoke。
- [ ] Globe 手工矩阵覆盖地面高日、云上高日 mixed、真日落、无月夜、近太空高日以及 `medium -> low -> high`。
- [ ] 手工记录 public ready/HDR、tier、太阳高度与 browser/render errors；finite/storage 由 focused automated qualification 记录，不由 release page 私有 readback；不以 hash、截图阈值或 FPS 替代 owner 判断。
- [ ] Development/release E2E 通过既有 `cesiumPage` 分别加载 `Build/CesiumUnminified/Cesium.js` 与 `Build/Cesium/Cesium.js`，并执行同一 public Globe controller/terrain-depth lifecycle。
- [ ] Windows 上用 PowerShell 设置 `$env:release='true'` 后运行 focused Playwright；根 `test-e2e-release` 的 POSIX-style 环境变量写法属于既有 portability residual。

## 8. Checkpoint 与回退

- [ ] 构建、types、docs、package、SGP audit、focused E2E 和 owner gate 全部通过后，才由 Architecture Agent 创建单独本地 phase checkpoint。
- [ ] checkpoint 包含产品/Specs/文档/SGP/AgentDocs 的同阶段一致状态，且不包含生成输出、临时 package、profile 或浏览器产物。
- [ ] 升级失败时回退到记录的 frozen predecessor checkpoint；禁止用 Test fallback、隐藏 retry 或扩大 SGP 绕过产品缺陷。
- [ ] 未经新 phase plan，不激活 Planar qualification 或后继 Globe 产品阶段。
