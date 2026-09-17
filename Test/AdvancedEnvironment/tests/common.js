/* global window */

export function configureNativeEnvironment(scene, mode) {
  for (const object of [
    scene.skyAtmosphere,
    scene.skyBox,
    scene.sun,
    scene.moon,
  ]) {
    if (object) {
      object.show = false;
    }
  }
  scene.sunBloom = false;
  scene.fog.enabled = false;
  scene.highDynamicRange = true;
  if (scene.postProcessStages?.bloom) {
    scene.postProcessStages.bloom.enabled = false;
  }
  if (mode === "globe" && scene.globe) {
    scene.globe.showGroundAtmosphere = false;
    scene.globe.enableLighting = false;
  }
}

export function createErrorTracker(errorElement) {
  const errors = [];
  const update = () => {
    errorElement.textContent = `浏览器/渲染错误：${errors.length}`;
  };
  const onError = (event) => {
    errors.push(String(event.error?.message ?? event.message ?? event));
    update();
  };
  const onRejection = (event) => {
    errors.push(String(event.reason?.message ?? event.reason ?? event));
    update();
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  update();
  return {
    errors,
    record(error) {
      errors.push(String(error?.message ?? error));
      update();
    },
    destroy() {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    },
  };
}

export function installPageCleanup(dispose) {
  let disposed = false;
  const destroy = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    dispose();
  };
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      destroy();
    }
  });
  return destroy;
}

export function controllerStatus(controller, scene) {
  if (!controller.enabled) {
    return "disabled · identity";
  }
  return controller.ready && scene.highDynamicRange
    ? "ready · HDR"
    : "loading / unsupported";
}

export function bindBoolean(folder, state, property, controller, scene, name) {
  return folder
    .add(state, property)
    .name(name)
    .onChange((value) => {
      controller[property] = value;
      scene.requestRender();
    });
}

export function bindNumber(
  folder,
  state,
  property,
  controller,
  scene,
  name,
  minimum,
  maximum,
  step,
) {
  return folder
    .add(state, property, minimum, maximum, step)
    .name(name)
    .onChange((value) => {
      controller[property] = value;
      scene.requestRender();
    });
}
