# Bistro / Cycles 画质校准

入口：[独立对照页](../PBR画质校准.html)、[实时场景](../PBR综合验收.html?world=planar)。
本轮建立参考和修正输入数据，不新增 GI、局部探针或引擎 API。

## 当前参考

- Blender 5.2.2 LTS / Cycles，CUDA，RTX 3060 Ti，64 samples，adaptive threshold
  0.02，启用去噪。当前机器 OptiX 内核编译失败，显式选择 CUDA，无静默降级。
- 1778 × 1000，网页街道近景，2026 年第 172 天 15:03 UTC；同一份 Bistro 1K
  glTF，132 个材质、1,591 个 mesh。没有补建模、改贴图或增加灯光装饰。
- 从实际 GPU 物理大气读取线性 HDR 天空与太阳 beam irradiance。太阳方向和相机
  使用相同局部 Z-up 坐标；天空采用未做粗糙度预过滤的 128 面宽 cubemap，导出
  512 × 256 经纬图；不含太阳盘，避免与 Sun 光重复。
- 直接光在相机高度取样，Cycles 使用 0.53° 太阳角直径。受控网页关闭 AO、SSR、
  空气透视、高度雾，保持阴影和 4×MSAA。曝光 1，PBR Neutral，gamma 2.2。
- 保留线性 EXR；交付 PNG 单独使用与 Cesium 相同的输出变换。Blender 工程的
  交互预览仍使用 Standard，不能直接拿它代替 PNG 做曝光比较。
- Cycles full：diffuse / glossy 各 4 次反弹；direct：两者均为 0。
  其余几何、材质、相机、光源和输出一致。零反弹仍包含直接环境采样和几何遮挡。

## 复现

先按 [Bistro 说明](Bistro.md) 准备本地资产。已有派生数据可以只修正未使用的 AO
绑定，避免重新编码纹理：

```powershell
$blender = '<Blender 安装目录>/blender.exe'
& $blender --background --factory-startup --python-exit-code 1 `
  --python scripts/scenegis/prepare-bistro.py -- `
  --update-occlusion Test/Rendering/pbr-data/local/bistro
```

1. 在实时页面选择平面、Bistro、物理大气，停止时间播放，等待加载完成。
2. 调好视角和窗口大小，点击「导出 Cycles 校准」。导出期间短暂显示各分项图，
   完成后恢复相机输入、效果设置与材质。不要在采集中调整窗口大小。
3. 将下载的 `bistro-calibration.json` 放进
   `Test/Rendering/pbr-data/local/calibration/`。
4. 在仓库根目录执行：

```powershell
& $blender --background --factory-startup --python-exit-code 1 `
  --python scripts/scenegis/render-bistro-reference.py -- `
  Test/Rendering/pbr-data/local/calibration/bistro-calibration.json 64 CUDA
```

输出独立 `Bistro-reference.blend`、天空和两张参考 EXR、对应 Neutral PNG、
九张网页诊断图及参数报告。输出目录由现有 `.gitignore` 排除；输入 GLB、原始
FBX/DDS 和已经打开的 Blender 文档不修改。刷新独立对照页即可比较。

## 本次发现

1. **光照层次存在明确差异。** Cycles 中拱门内、右侧窗框和背光立面有更连续的
   遮挡与反弹光；零反弹 / 多反弹对照能观察暖色回光。它并非简单把暗处全部提亮。
   引擎 / Cycles 的总差异还包含天空积分、BRDF、法线切线和纹理过滤，不能全部
   归因为缺 GI。局部环境可见性与间接照明仍是下一步候选。
2. **这份资产的粗糙度变化很少。** 源记录的 131 张 ORM 中，128 张 G 通道为常数，
   其中 125 张约为 0.741。纹理正常读取时，粗糙度诊断图也会接近单一灰色。
   不能仅增加渲染效果就得到丰富的干湿、磨损、抛光差异。本轮保留源值。
3. **修正了 AO 绑定错误。** 131 张源 ORM 的 R 通道均为零。
   [Falcor 来源格式文档](https://github.com/NVIDIAGameWorks/Falcor/blob/master/docs/usage/scene-formats.md)
   将该通道标为 unsupported。结合全零源数据，将它判断为未使用通道，不再绑定为
   glTF 的零可见性。保留 G/B 通道与原纹理字节，有实际 AO 的贴图不会被修正移除。
   当前基础 `textureIBL` 并未乘 material occlusion，因此这项数据修正不是当前
   画面发闷的主因，也不声称会显著提亮整个场景。
4. **细节上限仍受资产限制。** 当前交付为 1K；玻璃只保留 alpha，无 transmission
   和体积吸收，植被无透光模型。本轮未增加这些材质能力，也未作美术补光。

## 比较边界

Cycles 计算几何可见性和真实光路；当前引擎天空漫反射采用半球近似，镜面环境不含
街区自身。捕获天空的下半球是引擎的近似地面。太阳高度采样、有限天空分辨率、
阴影贴图过滤、纹理 mip / 各向异性过滤、透明排序和两种 BRDF 均可造成残差。
64 samples 与去噪用于有边界的视觉诊断，不作为无噪声数值 ground truth。

静态抗锯齿对照只比较无 AA / 4×MSAA；不能据此评价 TAA 的运动稳定性或性能。
材质图以原生 linear-to-sRGB 显示，数值读数须先逆 gamma；法线编码到 0–1。
粗糙度和金属度读取实际绑定的 glTF 纹理、变换和系数；无光照分支不能直接读
默认 `material.roughness` 作为已求值粗糙度。

## 有边界的验证

```powershell
npx playwright test -c Test/playwright.calibration.config.mjs `
  --grep 'calibration|Bistro preserves'
& $blender --background --factory-startup --python-exit-code 1 `
  --python scripts/scenegis/test-bistro-calibration.py
```

3 项浏览器 / 资产检查：真实 GPU 导出、材质像素、状态 / 回调恢复、对照页和缺图
提示、源几何保真。3 项 Blender 检查：横竖屏投影、五组 HDR 色值与原生 GPU 输出
一致、仅移除未使用 AO 绑定。实际 Cycles 双图渲染完成，资源和结果已检查。
本轮无引擎文件修改，不扩大为全量引擎 / 发布验证。
