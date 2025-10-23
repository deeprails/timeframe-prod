import { stopCoreLoopApiCall } from "./apis";
import { socket } from "./apis/socket";

export function broadcastError(e: unknown) {
  const message = JSON.stringify({ event: "error", data: String(e) })
  socket.send(message);
}

export function broadcastLog(event: SocketEvents, data: string) {
  const message = JSON.stringify({ event, data })
  socket.send(message);
}

export async function cleanupAllConnections({
  stopSTT,
  destroyVideo,
}: {
  stopSTT: () => Promise<void>;
  destroyVideo: () => Promise<void>;
}) {
  await stopSTT();
  await destroyVideo();
  await stopCoreLoopApiCall(false);
  
}