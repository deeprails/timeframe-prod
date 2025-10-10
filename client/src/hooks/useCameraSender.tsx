import { useEffect } from "react";
import { socket } from "../apis/socket";
import type ReconnectingWebSocket from "reconnecting-websocket";

export default function useCameraSender() {
  useEffect(() => {
    let sendLoop = true;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const ws: ReconnectingWebSocket = socket;

    (async () => {
      try {
        // Create an off-screen <video> element
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;

        // Ask for webcam access
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 360, frameRate: 30 },
        });

        video.srcObject = stream;
        await new Promise<void>((resolve) => {
          video.onloadeddata = () => resolve();
        });
        await video.play();

        // Downsample for bandwidth
        canvas.width = 320;
        canvas.height = 180;

        ws.binaryType = "arraybuffer";

        ws.addEventListener("open", () => console.log("✅ WebSocket connected"));
        ws.addEventListener("close", () => console.log("❌ WebSocket closed"));
        ws.addEventListener("error", (e) => console.error("⚠️ WebSocket error", e));

        const targetFps = 8;
        const period = 1000 / targetFps;
        let lastSent = 0;

        const tick = (t: number) => {
          if (!sendLoop) return;

          if (t - lastSent >= period && ws.readyState === WebSocket.OPEN) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
              (blob) => {
                if (!blob) return;
                if (ws.bufferedAmount < 1_000_000) {
                  blob.arrayBuffer().then((buf) => ws.send(buf));
                  lastSent = t;
                }
              },
              "image/jpeg",
              0.6
            );
          }
          requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);

        // cleanup
        return () => {
          sendLoop = false;
          ws.close();
          stream.getTracks().forEach((t) => t.stop());
        };
      } catch (err) {
        console.error("CameraSender error:", err);
      }
    })();
  }, []);

  return null; // nothing is rendered
}
