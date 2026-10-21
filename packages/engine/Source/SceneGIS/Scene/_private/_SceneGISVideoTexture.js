import DeveloperError from "../../../Core/DeveloperError.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import destroyObject from "../../../Core/destroyObject.js";
import Sampler from "../../../Renderer/Sampler.js";
import Texture from "../../../Renderer/Texture.js";
import TextureMinificationFilter from "../../../Renderer/TextureMinificationFilter.js";
import TextureMagnificationFilter from "../../../Renderer/TextureMagnificationFilter.js";

function validate(video) {
  if (
    !(video instanceof HTMLVideoElement) ||
    typeof video.requestVideoFrameCallback !== "function" ||
    typeof video.cancelVideoFrameCallback !== "function"
  ) {
    throw new DeveloperError(
      "video must be an HTMLVideoElement with video frame callback support.",
    );
  }
}

/** Frame-driven texture ownership for borrowed media. @private */
class VideoTexture {
  constructor(scene, video, errorEvent) {
    validate(video);
    this._scene = scene;
    this._errorEvent = errorEvent;
    this._active = false;
    this._generation = 0;
    this._callback = undefined;
    this._listeners = [];
    this.texture = undefined;
    this.uploads = 0;
    this.uploadBytes = 0;
    this.uploadMilliseconds = 0;
    this.setVideo(video);
  }

  setVideo(video) {
    validate(video);
    this._detach();
    this.video = video;
    this.ready = false;
    this.error = undefined;
    this._dirty = true;
    const listen = (name, callback) => {
      video.addEventListener(name, callback);
      this._listeners.push(() => video.removeEventListener(name, callback));
    };
    const dirty = () => {
      this._dirty = true;
      if (this._active) {
        this._scene.requestRender();
      }
    };
    for (const name of ["emptied", "loadstart"]) {
      listen(name, () => {
        this.ready = false;
        this.error = undefined;
        dirty();
        this._schedule();
      });
    }
    listen("seeking", () => {
      this.ready = false;
      dirty();
    });
    for (const name of ["loadeddata", "seeked", "resize"]) {
      listen(name, dirty);
    }
    listen("error", () => {
      this._fail(
        new RuntimeError(video.error?.message || "Video media failed."),
      );
    });
    if (video.error) {
      this._fail(
        new RuntimeError(video.error.message || "Video media failed."),
      );
    } else {
      this._schedule();
    }
    dirty();
  }

  setActive(active) {
    if (active === this._active) {
      return;
    }
    this._active = active;
    if (active) {
      // A disabled stage may have missed media frames while retaining its texture.
      this._dirty = true;
      this._schedule();
    } else {
      this._cancel();
    }
  }

  _schedule() {
    if (!this._active || this.error || this._callback !== undefined) {
      return;
    }
    const generation = this._generation;
    this._callback = this.video.requestVideoFrameCallback(() => {
      if (generation !== this._generation) {
        return;
      }
      this._callback = undefined;
      this._dirty = true;
      this._scene.requestRender();
      this._schedule();
    });
  }

  _cancel() {
    this._generation++;
    if (this._callback !== undefined) {
      this.video.cancelVideoFrameCallback(this._callback);
      this._callback = undefined;
    }
  }

  _detach() {
    this._cancel();
    for (const remove of this._listeners) {
      remove();
    }
    this._listeners.length = 0;
  }

  _fail(error) {
    this._cancel();
    this.ready = false;
    this.error = error;
    this._dirty = false;
    this._errorEvent.raiseEvent(error);
    if (this._active) {
      this._scene.requestRender();
    }
  }

  update(context) {
    const video = this.video;
    if (video.seeking || video.readyState < 2) {
      this.ready = false;
      return;
    }
    if (!this._active || !this._dirty || this.error) {
      return;
    }
    const start = performance.now();
    try {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (
        !this.texture ||
        this.texture.width !== width ||
        this.texture.height !== height
      ) {
        const next = new Texture({
          context,
          source: video,
          sampler: new Sampler({
            minificationFilter: TextureMinificationFilter.LINEAR,
            magnificationFilter: TextureMagnificationFilter.LINEAR,
          }),
        });
        this.texture?.destroy();
        this.texture = next;
      } else {
        this.texture.copyFrom({ source: video });
      }
      this.uploads++;
      this.uploadBytes += width * height * 4;
      this.uploadMilliseconds = performance.now() - start;
      this._dirty = false;
      this.ready = true;
    } catch (error) {
      this._fail(error);
    }
  }

  isDestroyed() {
    return false;
  }

  destroy() {
    this._detach();
    this.texture?.destroy();
    return destroyObject(this);
  }
}

export default VideoTexture;
