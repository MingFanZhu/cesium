# Plans

- [Entity 通用属性修复](2026-09-18-entity-api-fixes.md)（active standalone；EA-R001 与 EA-R003 距离显隐）

- [Camera 兼容性复核](2026-09-18-camera-compatibility.md)（completed；负责人验收通过；原 I1–I5 已完成）

- [Extension plan](2026-08-14-planar-api-integration-extension.md)（`completed`；I1-I5 completed；final checkpoint=`a81bbecebd`，not pushed）
- [I1 Planar Camera View and Flight](2026-08-14-phase-i1-planar-camera-view-flight.md)（`completed`；Architecture approved；owner manual gate passed；独立checkpoint已创建）
- [I2 Planar Entity/DataSource Framing](2026-08-14-phase-i2-planar-entity-datasource-framing.md)（`completed`；Architecture approved；owner manual gate passed；checkpoint=`e755ad95a2`）
- [I3 Planar Entity Tracking](2026-08-14-phase-i3-planar-entity-tracking.md)（`completed`；Architecture approved；I3-R001-R005 closed；owner manual gate passed；checkpoint=`63cf8bbe44`，not pushed）
- [I4 Planar Scene API Qualification and Safety](2026-08-14-phase-i4-planar-scene-api-safety.md)（`completed`；Architecture approved；I4-R001 closed；owner manual gate passed；checkpoint=`22bd7e1c29`，not pushed）
- [I5 Unified Qualification and Delivery](2026-08-14-phase-i5-unified-qualification-delivery.md)（`completed`；Architecture approved；dev/release final named E2E各`1 passed`；checkpoint=`a81bbecebd`，not pushed）

I5非E2E证据已完成。第三次dev E2E已结算，仅暴露explicit `completeFlight()`先发布cancel的产品缺陷与错误的HomeButton flight
假设；release未运行，root service已恢复为PID 30828。I5-R004/R005已窄修复并通过focused suites/build/static evidence，等待focused
re-review；不得操作服务或重跑E2E。

R004/R005关闭后的dev named case仅因intentional Fog guard rejection触发Cesium error-panel `console.error`而失败；其余qualification及
network/page/browser arrays通过，release未运行，root service已恢复为PID 33124。I5-R006现仅在该单次render周围保存、关闭并`finally`
恢复`_showRenderLoopErrors`，且加入恢复断言；等待focused re-review，不运行E2E。

I5-R006关闭后，最终dev named case `1 passed`（test 4.0s / command 7.5s），Windows process-local release同一case `1 passed`
（test 2.9s / command 6.5s）；timing case排除，所有qualification、destroy与network/error arrays通过。Architecture已恢复owner root
service PID 30388；I5现为checkpoint-ready，未commit、未push。

Architecture已创建I5本地checkpoint `a81bbecebdda3362decc8505dc31a96b14a82aa3`（short `a81bbecebd`，
`完成平面 API 融合统一交付`，not pushed）。I5与planar-api-integration extension均completed；当前无follow-up phase，等待未来
Architecture audit或新extension assignment。
