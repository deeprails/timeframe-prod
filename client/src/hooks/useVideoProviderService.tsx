import { useRef, useState, type RefObject } from "react";
import { socket } from "../apis/socket";
import { AGENT_ID, DID_CLIENT_KEY } from "../config";
import * as sdk from "@d-id/client-sdk";
import { broadcastError } from "../utils";

// SDK auth: use the Agent "client key" (from Studio Embed or Client Key API)
const auth = { type: "key", clientKey: DID_CLIENT_KEY as string } as const;

export default function useDIDAgentStream(
  idleRef: RefObject<HTMLVideoElement | null>,
  remoteRef: RefObject<HTMLVideoElement | null>,
  onStartSpeaking: () => void,
  setMode: React.Dispatch<React.SetStateAction<Modes>>,
  onVideoStreamEnd: (type: "textAnimation" | "videoStream") => void
) {
  const connectedRef = useRef(false)
  const agentManagerRef = useRef<Awaited<ReturnType<typeof sdk.createAgentManager>> | null>(null);
  const streamStartedRef = useRef(false)

  // ── UI helpers (unchanged) ───────────────────────────────────────────────────
  const restartIdle = () => {
    const v = idleRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.volume = 0;
    v.play();
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
        setMode("away")
        console.error(error)
      }
    },
    onConnectionStateChange(state) {
      console.log("D-ID connection:", state);
      connectedRef.current = state === "connected";
    },
    onVideoStateChange(state) {
      try {
        console.log("STATE", state)
        if (state === "STOP") {
          restartIdle();
          fadeOut();
          onVideoStreamEnd("videoStream");
          streamStartedRef.current = false;
        } else if (state === "START") {
          fadeIn();
          console.log('line 65')
          if (!streamStartedRef.current) {
            onStartSpeaking();
            socket.send(JSON.stringify({ event: "speaking" }));
            setMode("speaking");
            streamStartedRef.current = true
          }
        }
      } catch (error) {
        broadcastError(error)
        setMode("away")
        console.error(error)
      }
    },
    onError(err) {
      broadcastError(err)
      console.error(err)
    },
  } satisfies sdk.ManagerCallbacks;

  // Create (or return existing) Agent Manager
  const ensureManager = async () => {
    if (!agentManagerRef.current) {
      console.log('ensureManager()')
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
        setMode("away")
        throw error
      }
    }
    return agentManagerRef.current!;
  };

  // ── Public API ───────────────────────────────────────────────────────────────
  /** Establish connection to the Agent (WebRTC etc. handled by SDK) */
  const connect = async () => {
    try {
      console.log('connect trigger')
      const manager = await ensureManager();
      await manager.connect();
    } catch (error) {
      broadcastError(error)
      setMode("away")
      throw error
    }
  };

  // helpers (top of hook file)
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  async function waitForConnected(maxMs = 3000, stepMs = 500) {
    const end = Date.now() + maxMs;
    while (Date.now() < end) {
      if (connectedRef.current) return true;
      await sleep(stepMs);
    }
    return connectedRef.current; // one last check
  }


  /** Speak EXACTLY `text` (no LLM). Pass SSML in `text` if desired (<speak>...</speak>) */
  const sendText = async (text: string) => {
    try {
      const manager = await ensureManager();
      // You can call speak without a preceding connect(); the SDK will auto-connect,
      // but we keep connect() explicit to match your flow.
      console.log('State while sending', connectedRef.current)
      while (!connectedRef.current) {
        await connect()
        console.log('connection request sent')
        const ok = await waitForConnected(3000, 500); // wait for connection for 3s with every 500ms wake and check if connection is established return true otherwise false
        console.log('connection waiting done', ok)
        if (!ok) {
          throw new Error("D-ID: not connected within 3s; aborting speak()");
        }
      }
      console.log('send triggered')
      await manager.speak({ type: "text", input: text });
      // SDK handles streaming and will invoke onVideoStateChange callbacks.
    } catch (error) {
      broadcastError(error)
      setMode("away")
      throw error
    }
  };

  /** Cleanup */
  const destroy = async () => {
    if (connectedRef.current) {
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
      reset()
    }
  };

  function reset() {
    connectedRef.current = false;
    streamStartedRef.current = false;
  }

  const connected = connectedRef.current;
  return { connected, connect, sendText, destroy };
}
