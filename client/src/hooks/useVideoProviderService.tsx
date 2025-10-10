import { useRef, useState, type RefObject } from "react";
import { socket } from "../apis/socket";
import { AGENT_ID, DID_CLIENT_KEY } from "../config";
import * as sdk from "@d-id/client-sdk";

/**
 * useDIDAgentStream – React hook for manual-mode D-ID Agents (SDK version)
 * -----------------------------------------------------------
 * - Uses the D-ID Agents SDK for connection, video, and control.
 * - `sendText()` speaks EXACTLY the text you pass (no LLM).
 */

// SDK auth: use the Agent "client key" (from Studio Embed or Client Key API)
const auth = { type: "key", clientKey: DID_CLIENT_KEY as string } as const;

// Optional SDK stream options
const streamOptions = { compatibilityMode: "auto", streamWarmup: true } as const;

// ────────────────────────────────────────────────────────────────────────────────

function broadcastError(e: unknown) {
  const message = JSON.stringify({ event: "speaking", data: String(e) })
  socket.send(message);

}

export default function useDIDAgentStream(
  idleRef: RefObject<HTMLVideoElement | null>,
  remoteRef: RefObject<HTMLVideoElement | null>,
  onStartSpeaking: () => void,
  setMode: React.Dispatch<React.SetStateAction<Modes>>,
  onVideoStreamEnd: (type: "textAnimation" | "videoStream") => void
) {
  const [connected, setConnected] = useState(false);
  const agentManagerRef = useRef<Awaited<ReturnType<typeof sdk.createAgentManager>> | null>(null);

  const streamStartTime = useRef<number | null>(null);

  // ── UI helpers (unchanged) ───────────────────────────────────────────────────
  const restartIdle = () => {
    const v = idleRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.volume = 0;
    v.play().catch(() => { });
  };

  const fadeIn = () => {
    if (remoteRef.current) remoteRef.current.style.opacity = "1";
  };
  const fadeOut = () => {
    if (remoteRef.current) remoteRef.current.style.opacity = "0";
  };

  // ── Build SDK callbacks on demand so they close over latest refs/state ───────
  const callbacks = {
    onSrcObjectReady(srcObject: MediaStream) {
      try {
        const v = remoteRef.current;
        if (!v) return;
        v.srcObject = srcObject;
        v.onloadeddata = () => {
          v.onloadeddata = null;
          v.play().catch(console.error);
        };
      } catch (error) {
        broadcastError(error)
        throw error
      }
    },
    onConnectionStateChange(state) {
      try {
        console.log("D-ID connection:", state);
        setConnected(state === "connected");
      } catch (error) {
        broadcastError(error)
        throw error
      }
    },
    onVideoStateChange(state) {
      try {
        if (state === "STOP") {
          restartIdle();
          fadeOut();
          onVideoStreamEnd("videoStream");
        } else {
          fadeIn();
          onStartSpeaking();
          socket.send(JSON.stringify({ event: "speaking" }));
          setMode("speaking");
        }
      } catch (error) {
        broadcastError(error)
        throw error
      }
    },
    onError(err) {
      broadcastError(err)
    },
  } satisfies sdk.ManagerCallbacks;

  // Create (or return existing) Agent Manager
  const ensureManager = async () => {
    if (!agentManagerRef.current) {
      try {
        agentManagerRef.current = await sdk.createAgentManager(AGENT_ID, {
          auth,
          callbacks,
          // streamOptions,
          mode: sdk.ChatMode.DirectPlayback,
          streamOptions: {
            outputResolution: 1080,
          }
        });

      } catch (error) {
        broadcastError(error)
        throw error
      }
    }
    return agentManagerRef.current!;
  };

  // ── Public API ───────────────────────────────────────────────────────────────
  /** Establish connection to the Agent (WebRTC etc. handled by SDK) */
  const connect = async () => {
    try {
      const manager = await ensureManager();
      await manager.connect();
    } catch (error) {
      broadcastError(error)
      throw error
    }
  };

  /** Speak EXACTLY `text` (no LLM). Pass SSML in `text` if desired (<speak>...</speak>) */
  const sendText = async (text: string) => {
    try {
      const manager = await ensureManager();
      // You can call speak without a preceding connect(); the SDK will auto-connect,
      // but we keep connect() explicit to match your flow.
      await manager.speak({ type: "text", input: text });
      // SDK handles streaming and will invoke onVideoStateChange callbacks.
    } catch (error) {
      broadcastError(error)
      throw error
    }
  };

  /** Cleanup */
  const destroy = async () => {
    const manager = await ensureManager();
    await manager.disconnect(); // closes stream and chat session
    if (remoteRef.current) {
      try {
        remoteRef.current.pause();
        remoteRef.current.srcObject = null;
      } catch (error) {
        broadcastError(error)
        throw error
      }
    }
    setConnected(false);
  };

  return { connected, connect, sendText, destroy };
}
