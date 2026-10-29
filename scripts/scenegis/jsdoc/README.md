# SceneGIS engine API

This documentation covers the native engine, Widgets and SceneGIS extensions in this
distribution. Use `SceneGIS.js` as the browser global `SceneGIS`, or import named exports
from `index.js`. Native class names, such as `Cesium3DTileset`, remain unchanged.

```js
import { Viewer } from "../index.js";
const viewer = new Viewer("map", { baseLayer: false, baseLayerPicker: false });
viewer.destroy();
```

- [Viewer](Viewer.html)
- [Planar World](SceneGISPlanarWorld.html)
- [GPU wind simulation](SceneGISWindSimulation.html)
- [Static 3D Tiles voxelization](SceneGIS3DTilesVoxelizer.html)
- [API doclets](api-doclets.json): full semantic metadata and stable canonical IDs.
- [Search index](api-index.json): symbol names, kinds and local page/anchor URLs.

The distribution README explains resource base URLs and downstream SDK composition.
Private and undocumented implementation exports are outside the public API.
