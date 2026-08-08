# ADR-0012：平面地形基础光照与几何法线

## 状态

- Status：`approved`
- Date：`2026-08-08`
- Decision owners：Architecture Agent、项目负责人
- Related plan：
  `AgentDocs/planar-terrain/plans/2026-08-08-phase-t6-terrain-lighting-and-delivery.md`
- Related patch：无；T6 只允许修改 SceneGIS-owned files

## 上下文与源码事实

T1-T5 已完成平面 Heightmap terrain数据、mesh、连续LOD、fallback、资源生命周期、查询/拾取、
generic URL provider和公开案例。当前surface geometry与imagery能正确绘制，但shader只输出
baseColor与栅格合成结果，没有法线或光照，因此山地起伏主要依赖相机视角和影像本身。

当前terrain mesh只包含tile-local Float32 position和shared indices。direct、upsampled、flat
fallback与skirt通过同一single opaque command绘制；normal render创建/更新资源，depth pass只重放
exact command references。给mesh增加vertex normal会改变CPU mesh格式、GPU attribute、fallback生成、
边界邻域和resource ownership，而当前没有证据证明smooth normal是基础表现的必要条件。

Cesium现有Scene/UniformState已经提供scene light、`czm_lightDirectionEC`、`czm_lightColor`和
`czm_getLambertDiffuse`。当前shader转换链也支持standard derivatives。Globe的lighting只作为
API命名、默认值与Lambert公式启发；其ellipsoid normals、atmosphere、day/night、shadow、water和
material系统不适用于真正的平面世界。

项目负责人已明确：camera在surface下方是合法状态并为未来地下模式保留；越界与大俯仰不能因此
触发home恢复。T6 lighting必须保持double-sided render，不能以back-face culling或camera collision
简化实现。

## 决策

### Public World 配置

`SceneGISPlanarWorld`增加constructor options与可变properties：

- `enableLighting=false`；必须为boolean；
- `lambertDiffuseMultiplier=0.9`；必须为finite non-negative number。

默认关闭使existing flat、imagery和terrain画面及fragment成本保持不变。World只消费Scene已有的
automatic light uniforms，不拥有或销毁light，也不增加SceneGIS专用Light类型。Multiplier作为
uniform动态读取，修改它不能创建新的shader或geometry/resource对象。

### Fragment geometric normal

lighting shader variant在vertex阶段输出由现有model-local position转换得到的eye-space position，
在fragment阶段以`cross(dFdx(v_positionEC), dFdy(v_positionEC))`求实际render triangle normal。

法线使用Cesium双面appearance同类的face-forward规则，使其朝viewer-facing eye-space半球。该决定
同时适用于unit quad、FLAT fallback、DIRECT、UPSAMPLED与skirts；skirts仍只参与render，不进入
terrain query/picking。

不增加CPU vertex normal、normal attribute/buffer、packing、normal map、邻tile sample或额外mesh
topology。首版明确提供per-triangle geometric lighting，不承诺smooth vertex lighting或跨LOD连续
normal。

### Lambert 与合成顺序

baseColor和shown imagery继续在单pass中bottom-to-top合成。完成合成后，lighting variant计算：

```text
diffuse = czm_getLambertDiffuse(czm_lightDirectionEC, normalEC)
intensity = clamp(diffuse * lambertDiffuseMultiplier + 0.3, 0.0, 1.0)
finalRgb = composedRgb * czm_lightColor * intensity
```

输出alpha始终为1。固定`0.3`环境亮度用于避免背光或surface下方视角完全变黑，首版不增加第三个
public tuning property。应用需要稳定方向时应显式设置`scene.light`为DirectionalLight；任意planar
CRS不赋予默认SunLight新的投影含义。

T6不实现HDR light intensity、day/night、gamma/material、specular、shadow map、water、atmosphere、
normal texture或PBR。

### Shader variant 与生命周期

private shader builder生成lit/unlit source。Unlit variant不输出eye-space position，也不执行
derivatives或Lambert。Shader cache identity至少由`layerCount + enableLighting`组成；同一layer count
首次使用lit/unlit最多取得两个ShaderProgram cache references。

现有tile DrawCommand保持唯一且复用。lighting切换只更新其shader/uniform map，不改变selection、
terrain/imagery content、VA、Buffer、Texture、mesh、request、bounding volume、pass或command数量。
Depth pass继续重放最近normal render的exact command references。Surface销毁时对每个已取得shader
reference执行exactly-once release。

当前shader规模仍是单组件、少量静态variant，继续使用SceneGIS private JS shader builder；不建立
`.glsl` build seam，不新增Cesium builtin或修改upstream Shader构建。若以后出现多组件共享、include、
大量variant或新builtin需求，再建立独立ADR。

### 性能、Worker 与交付

T6性能hard gate限定为稳定画面不持续创建shader、command、VA、buffer、texture、mesh或request，
lighting不增加draw command，并保持destroy平衡。简短本机timing只作趋势证据，不采用跨机器FPS或
百分比阈值，也不新增workflow或P8式soak。

当前公开257×257 LERC案例没有已确认的可重复主线程阻塞，因此T6不引入Worker、transferable
protocol或formal byte budget。若后续profiling发现不可接受阻塞，必须单独设计Worker入口、build、
runtime URL、payload ownership、cancel和release，而不是在T6中隐式加入。

## 不采用的方案

### CPU smooth vertex normals

暂不采用。它会扩大mesh/buffer和边界邻域契约，并可能在tile/LOD边界产生新的normal seam。只有
基础triangle lighting的实际画面不足时，才以独立阶段比较normal格式、内存与视觉收益。

### 复用 Globe shader或terrain material system

拒绝。Globe shader依赖ellipsoid、cartographic、atmosphere、day/night、water、shadow与大量
private variant，不是planar surface的可选接口。

### 只绘制正面或阻止camera进入surface下方

拒绝。这会破坏已批准的double-sided和未来地下模式边界，也会把表现问题错误转化为navigation
约束。

### 预防性引入Worker或Shader build seam

拒绝。当前没有measured blocker，且两者都会扩大构建、发布与升级契约。

## 兼容性、所有权与升级

T6只允许修改`packages/engine/Source/SceneGIS/**`、对应SceneGIS Specs、现有terrain Sandcastle、
Documentation和AgentDocs。预计upstream-owned files=`0`、T6 SGP=`0`，不修改
`.scenegis/upstream-patches.json`、SGP-0001或SGP-0002。

每次Cesium升级必须复核：

- `scene.light → frameState.light → UniformState`更新链；
- `czm_lightDirectionEC`、`czm_lightColor`和`czm_getLambertDiffuse`语义；
- standard derivatives与shader demodernization/extension处理；
- `ShaderProgram.fromCache` reference与destroy语义；
- DrawCommand depth replay、double-sided render state和single-command imagery composition；
- terrain vertex/index topology、model matrix与eye-space position精度。

若实现证明需要修改upstream-owned file、shader builtin/build、Worker或mesh vertex layout，Execution
必须停止并交回Architecture Agent，不能把该变化解释为ADR-0012已经授权。
