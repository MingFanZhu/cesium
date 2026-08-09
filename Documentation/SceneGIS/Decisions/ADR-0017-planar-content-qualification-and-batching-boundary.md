# ADR-0017：平面内容资格验证与批量边界

## 状态

- Status：`approved`
- Date：`2026-08-09`
- Decision owners：Architecture Agent（依据项目负责人授予的后续阶段自主设计权限）
- Related plan：
  `AgentDocs/planar-content/plans/2026-08-09-phase-c5-dynamic-performance-and-delivery.md`
- Related patch：None；C5预期不修改upstream-owned file，也不新增SGP

## 上下文与源码事实

C1-C4已经建立并自动接入Point、Billboard、Label、普通glTF Model、planar straight Polyline与Polygon。
C5是首版`planar-content`的最后阶段，目标是验证动态更新、代表性对象数量、资源收敛与交付链路，而不是继续
扩张graphics或公共API。

Cesium 1.144与当前SceneGIS实现具有以下事实：

1. Anchor visualizer复用每个DataSource caller-owned、disabled `EntityCluster`的Point/Billboard/Label pools；
   它不是每个Entity建立一个独立DrawCommand。
2. Model由`Model.fromGltfAsync`逐Entity管理。异步generation、candidate/current与exactly-once cleanup已经在
   C2固定；把不同Model强行合批会改变Model pipeline与pick/lifecycle语义。
3. Polyline和Polygon按Entity拥有private Buffer owner，以local DOUBLE geometry和translation
   `modelMatrix`保持大坐标精度。静态warm update已经不会再次标脏collection或上传Buffer，但当前仍会重新
   解析Property并构造CPU state。
4. C4 gate每次display update扫描当前Entity top-level profile，保证unsupported输入在child normal update和
   低层资源mutation前失败；同步collection listener只更新CPU tracking。
5. C2/C3已有小规模real Context像素、pick、depth、warm identity与destroy证据，C4已有automatic
   Widget/Viewer/DataSource ordering证据，但尚无固定的代表性对象集、动态局部更新、最终Sandcastle或本地E2E。
6. 单机浏览器CPU/GPU timing受硬件、驱动、构建模式与系统负载影响。它适合发现同环境可重复热点，不适合作为
   跨机器CI硬阈值；持久资源增长、重复GPU allocation、错误pick或destroy不平衡才是hard gate。

## 决策

### C5是资格与交付阶段

C5不新增public content class、World API、DataSource类型或graphics profile。支持面继续是C4批准的
`Entity`/`CustomDataSource`入口与六类graphics；GeoJSON、CZML、KML、3D Tiles、tracking、`flyTo`、`zoomTo`
和地下模式仍在扩展范围外。

### 代表性对象集

自动化资格使用固定、可本地生成的moderate profile：

- `512`个Anchor Entity：`256` Point、`128` Billboard、`128` Label；Billboard共享本地canvas image；
- `64`条Polyline，每条使用少量supplied planar vertices；
- `32`个simple Polygon，覆盖flat fill与少量extrusion/outline；
- Model不进入上述CPU批量计时，另用`2`个共享本地glTF URI验证async readiness、dynamic transform和释放。

该profile用于发现明显的O(N²)、每帧GPU重建、owner泄漏或DataSource ordering问题，不宣称是产品最大容量或
通用benchmark。至少执行`20`个identical warm frames、`5`轮局部mutation/removal/re-add，以及`3`个
Widget/Viewer/DataSource lifecycle cycles；不得为了追求极端边界扩大为超大压力矩阵。

### 不建立跨Entity batching层

首版保持已批准的ownership粒度：Anchor继续使用Cesium pool，Model继续逐实例，Polyline/Polygon继续
per-Entity owner。C5中的“批量性能”指代表性批量资格，不意味着新增第二套batch scene graph。

只有baseline出现可重复、可定位到SceneGIS private visualizer的热点时，才允许在C5做以下窄优化：

- 消除未变化absolute/static Polyline或Polygon的重复CPU state/triangulation构造；
- 复用现有scratch或已应用state，且仍以Entity/Property change、dynamic Property和terrain-dependent
  HeightReference为失效边界；
- 保持原Entity pick、per-Entity owner、bounds、candidate/current、dynamic update与terrain eventual
  consistency完全不变。

不得在C5引入跨Entity geometry merge、公开batch API、Worker、空间索引或新的upstream hook。若真实需求需要
这些能力，应建立独立扩展或后续phase/ADR。

### Hard gate与timing evidence分离

Hard gate包括：

- 代表性Entity均被automatic path接收，sampled pixel/pick/bounds finite且保持original Entity identity；
- identical warm frames保持slot/Model/owner/collection/render-context/command/VertexArray identity，低层collection
  不重复dirty或copy，持久resource count不增长；
- 局部动态更新只改变目标Entity；未变化对象identity与Buffer保持，下一warm frame重新收敛；
- terrain resident height变化能在下一normal update反映到代表性clamp/relative内容，不隐式发request；
- DataSource remove/re-add、Viewer destroy和late Model settlement恢复listener、primitive、DOM与controller
  baseline，SceneGIS-owned resource exactly once释放；
- default Globe、`globe:false`和C4unsupported profile contract不回归。

Timing只记录固定环境、viewport、build、warmup、样本数以及`DataSourceDisplay.update`与render的median/P95。
若C5修改runtime，必须先保存C4 checkpoint baseline，再用相同协议复测；只有可重复热点证据才保留优化。Timing
变化不写成跨机器flaky assertion，也不以单帧FPS替代资源与行为证据。

### Sandcastle、E2E与package

- 新增唯一稳定示例`scenegis-planar-content`，显式使用EPSG:3857 World，展示六类graphics、absolute/clamp/
  relative height、original Entity selection、可控动态更新和代表性批量增删。
- 示例可以复用公开OSM/terrain服务，但必须显示Credit、说明best-effort fallback，并保持固定初始视角；自动化
  不访问公网。普通glTF Model使用仓库local SampleData。
- 新增或扩展本地Playwright内容用例，使用local structural terrain/image或flat fallback，验证dev/release
  bundle中的automatic content、dynamic update、pick/selection、remove与destroy；不新增workflow。
- Installed-tarball smoke确认C4 private source/runtime链路被打包且未进入supported declarations/API；C5没有新
  public type时不制造虚假的type delta。
- `PlanarContentGuide`与`PlanarWorldUpgradeChecklist`记录最终compatibility、private dependency与升级复核项。

## 不采用的方案

### 先重写Polyline/Polygon为跨Entity batch

拒绝。当前没有证明per-Entity owner是阻断热点；重写会同时改变大坐标origin、局部dynamic update、pick id、
fragmentation与remove ownership，风险远大于C5交付目标。

### 把固定毫秒阈值作为CI hard gate

拒绝。不同GPU/driver与系统负载下不可移植。固定协议的同机baseline/candidate趋势用于调查，行为和资源收敛才
决定通过。

### 用公网Sandcastle代替自动化

拒绝。OSM、terrain与CORS只属于人工展示。自动化必须本地、可重复且不批量下载公开服务。

### 为批量内容增加新的公共Layer API

拒绝。首版已经选择复用Entity/DataSource；若未来需要百万级专题图层，应单独设计数据组织、更新协议、pick与
内存预算，不能在交付阶段隐式演化。

## 升级与验收检查点

C5至少验证：

- moderate profile的initial、warm、local mutation、remove/re-add与destroy收敛；
- 代表性terrain clamp/relative、Model async、大坐标、original Entity picking与Viewer selection；
- `CesiumWidget`/`DataSourceDisplay` callback、per-DataSource containers、EntityCluster pools、Model pipeline与
  experimental Buffer collection在升级后的调用顺序；
- dev/release local E2E、no-embedding Sandcastle/gallery、workspace build/types/docs和installed package smoke；
- current delivery upstream-owned files=`0`，历史`SGP-0001/0002`不变，generated files不进入提交；
- 项目负责人在真实浏览器/GPU中完成内容页面人工验收后，才把extension标为`completed`。
