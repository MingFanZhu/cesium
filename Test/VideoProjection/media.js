/* global document, window, URL */
// The example, not the engine, owns this media source and all stream tracks.
export function createMedia(video, report) {
  let timer, stream, objectUrl;
  function release() {
    window.clearInterval(timer);
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    objectUrl = undefined;
    video.pause();
    video.srcObject = null;
    video.removeAttribute("src");
    video.load();
  }
  async function play() {
    try {
      await video.play();
    } catch (error) {
      report(`视频未开始播放：${error.message}；请点击预览中的播放按钮。`);
    }
  }
  return {
    async calibration(width, height) {
      release();
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      let frame = 0;
      const draw = () => {
        for (const [index, color] of [
          "#ef3340",
          "#40ca72",
          "#307fea",
          "#d7ad36",
        ].entries()) {
          ctx.fillStyle = color;
          ctx.fillRect(
            ((index % 2) * width) / 2,
            (Math.floor(index / 2) * height) / 2,
            width / 2,
            height / 2,
          );
        }
        ctx.strokeStyle = "#ffffff90";
        ctx.lineWidth = 2;
        for (let i = 1; i < 8; i++) {
          ctx.beginPath();
          ctx.moveTo((i * width) / 8, 0);
          ctx.lineTo((i * width) / 8, height);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, (i * height) / 8);
          ctx.lineTo(width, (i * height) / 8);
          ctx.stroke();
        }
        ctx.font = `bold ${height / 12}px system-ui`;
        ctx.fillStyle = "white";
        ctx.fillText("TOP ↑ 上", width * 0.06, height * 0.18);
        ctx.fillText("RIGHT → 右", width * 0.55, height * 0.18);
        ctx.fillText(`帧 ${frame++}`, width * 0.06, height * 0.73);
        ctx.fillStyle = "black";
        ctx.fillRect(0, height * 0.84, width / 3, height * 0.16);
        ctx.fillStyle = "#808080";
        ctx.fillRect(width / 3, height * 0.84, width / 3, height * 0.16);
        ctx.fillStyle = "white";
        ctx.fillRect((width * 2) / 3, height * 0.84, width / 3, height * 0.16);
        ctx.fillStyle = "white";
        ctx.beginPath();
        ctx.arc(
          width * (0.5 + 0.35 * Math.sin(frame / 25)),
          height * 0.6,
          height * 0.06,
          0,
          2 * Math.PI,
        );
        ctx.fill();
      };
      draw();
      stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      video.srcObject = stream;
      video.loop = false;
      track.requestFrame();
      timer = window.setInterval(() => {
        if (!video.paused) {
          draw();
          track.requestFrame();
        }
      }, 1000 / 30);
      await play();
    },
    async trailer() {
      release();
      video.src = "/Specs/Data/Videos/big-buck-bunny-trailer-small.webm";
      video.loop = true;
      await play();
    },
    async file(file) {
      release();
      objectUrl = URL.createObjectURL(file);
      video.src = objectUrl;
      video.loop = true;
      await play();
    },
    dispose: release,
  };
}
