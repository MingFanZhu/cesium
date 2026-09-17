// Authored point features in local metres; smaller rank wins a collision.
export default [
  { id: 1, x: -300, y: 200, name: "北京 Beijing", kind: "city", rank: 1 },
  {
    id: 2,
    x: 280,
    y: 200,
    name: "中英文地图\nSceneGIS",
    kind: "halo",
    rank: 1,
  },
  { id: 3, x: -300, y: 0, name: "城市医院", kind: "poi", rank: 1 },
  { id: 4, x: 280, y: 0, name: "北京公园", kind: "poi", rank: 1 },
  { id: 5, x: -300, y: -220, name: "优先显示", kind: "collision", rank: 1 },
  { id: 6, x: -295, y: -220, name: "遮挡", kind: "collision", rank: 2 },
  { id: 7, x: 280, y: -220, name: "Station 车站", kind: "city", rank: 1 },
];
