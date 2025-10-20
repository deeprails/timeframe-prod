type Modes = "idle" | "listening" | "thinking" | "speaking" | "away"
type SocketEvents = Modes | "stt-transcription" | "start-speaking" | "start-offline-speaking" | "stop-video-connection" | "start-listening" | "loop-started" | "loop-stopped"
type SocketResponse = {
  event: SocketEvents,
  data: string | null
}

interface StartLoopResponse {
  "status": "started"
}

interface StopLoopResponse {
  "status": "stop"
}

interface GetAAITokenResponse {
  token: string
}

interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

interface CreateStreamResponse {
  id: string;
  offer: RTCSessionDescriptionInit;
  ice_servers: IceServer[];
  session_id: string;
}

interface SendMessageResponse {
  id: string;
  status: string;
  // …extend with whatever fields you read from the response
}

declare module "*.json" {
  const value: Record<string, string>;
  export default value;
}