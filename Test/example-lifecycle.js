/* global window */
// Shared page lifecycle only; each example owns its Viewer and feature setup.
export default function exposeExample(
  viewer,
  gui,
  objects = {},
  release = () => {},
) {
  function destroy() {
    if (viewer.isDestroyed()) {
      return;
    }
    release();
    gui.destroy();
    viewer.destroy();
  }
  window.example = { viewer, gui, ...objects, destroy };
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      destroy();
    }
  });
}
