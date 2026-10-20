import { CzmlDataSource, SceneGISPlanarWorld } from "@cesium/engine";
import { Viewer } from "@cesium/widgets";

async function usePlanarCzml(world: SceneGISPlanarWorld, viewer: Viewer) {
  const planar: CzmlDataSource.PlanarOptions = { world };
  const options: CzmlDataSource.LoadOptions = { planar };
  const source = await CzmlDataSource.load("vehicles.czml", options);
  await viewer.dataSources.add(source);
  await source.process({
    id: "vehicle",
    position: { cartesian: [10, 20, 30] },
  });
  await source.load("replacement.czml");
  await viewer.zoomTo(source);
  viewer.trackedEntity = source.entities.getById("vehicle");
}
void usePlanarCzml;
