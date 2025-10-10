import { useRef, useState, type RefObject } from 'react';
import { socket } from '../apis/socket';
import { AGENT_ID, DID_API_KEY_B64 } from '../config';

/**
 * useDIDAgentStream – React hook for manual‑mode D‑ID Agents
 * -----------------------------------------------------------
 * ‑ Opens a WebRTC stream (no LLM).
 * ‑ `sendText()` posts a **video‑stream** request so the avatar voices the EXACT
 *   sentence you supply (bypasses /chat and its GPT pipeline).
 */

const DID = {
  API_KEY_B64: DID_API_KEY_B64,
  ROOT: 'https://api.d-id.com',
  SERVICE: 'agents',
} as const;

// ▸ TYPES
interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}
interface CreateStreamRes {
  id: string;
  offer: RTCSessionDescriptionInit;
  ice_servers: IceServer[];
  session_id: string;
}
interface SendMessageRes { id: string; status: string }

export default function useDIDAgentStream(idleRef: RefObject<HTMLVideoElement | null>, remoteRef: RefObject<HTMLVideoElement | null>, onStartSpeaking: () => void, setMode: React.Dispatch<React.SetStateAction<Modes>>, onVideoStreamEnd: (type: 'textAnimation' | 'videoStream') => void) {
  const [connected, setConnected] = useState(false)
  const sessionId = useRef<string | null>(null);
  const streamId = useRef<string | null>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const streamStartTime = useRef<number | null>(null);

  // helper with auth header
  const didFetch = (path: string, init: RequestInit = {}) =>
    fetch(`${DID.ROOT}${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${DID.API_KEY_B64}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

  const handleIceCandidate = async (e: RTCPeerConnectionIceEvent) => {
    if (!e.candidate || !streamId.current) return;
    const { candidate, sdpMid, sdpMLineIndex } = e.candidate;
    await didFetch(`/${DID.SERVICE}/${AGENT_ID}/streams/${streamId.current}/ice`, {
      method: 'POST',
      body: JSON.stringify({ candidate, sdpMid, sdpMLineIndex, session_id: sessionId.current }),
    });
  };

  function wireDataChannel(dc: RTCDataChannel) {
    dc.onmessage = (event) => {
      const msg = event.data;
      /* 1 ▸ D-ID control messages */
      if (msg.startsWith('stream/done')) {
        if (streamStartTime.current) {
          const endTime = Date.now();
          const durationMs = endTime - streamStartTime.current;
          const seconds = (durationMs / 1000).toFixed(2);
          const minutes = (durationMs / 60000).toFixed(2);
          console.log(`⏱️ Video duration: ${seconds}s (~${minutes} min)`);
          streamStartTime.current = null;
        }
        console.log('🎬 stream/done  ← speech clip finished');
        restartIdle()
        fadeOut();
        onVideoStreamEnd("videoStream")
        return;
      } else if (msg.startsWith("stream/started")) {
        const message = JSON.stringify({ event: "speaking" });
        socket.send(message)
        setMode("speaking")
        console.log('🎬 stream/started  ← speech clip started');
        streamStartTime.current = Date.now();
        fadeIn();
        onStartSpeaking()
      }
    };
  }

  const restartIdle = () => {
    const v = idleRef.current;
    if (!v) return;
    v.currentTime = 0;
    v.volume = 0
    v.play().catch(() => { });
  };

  const fadeIn = () => {
    if (remoteRef.current) remoteRef.current.style.opacity = '1';
  };
  const fadeOut = () => {
    if (remoteRef.current) remoteRef.current.style.opacity = '0';
  };

  const handleConnectionStateChange = () => {
    const st = pc.current!.connectionState;
    if (st === 'disconnected' || st === 'failed' || st === 'closed') {
      console.log('D-ID session Disconnected')
      setConnected(false)
    }
  }

  const handleTrack = (ev: RTCTrackEvent) => {
    const [remote] = ev.streams;
    const [videoTrack] = remote.getVideoTracks();

    /* … inside handleTrack … */
    videoTrack.addEventListener('unmute', () => {
      if (!remoteRef.current) return;

      // attach stream
      remoteRef.current!.srcObject = remote;
      remoteRef.current!.onloadeddata = () => {
        remoteRef.current!.onloadeddata = null;
        // fadeIn();                      // avatar now visible
        remoteRef.current!.play().catch(console.error);
      };
    });

    videoTrack.addEventListener('ended', fadeOut);
    videoTrack.addEventListener('inactive', fadeOut);
  };

  /** Establish WebRTC & start video */
  const connect = async () => {
    const res = await didFetch(`/${DID.SERVICE}/${AGENT_ID}/streams`, {
      method: 'POST',
      // body: JSON.stringify({ "stream_warmup": true }),
    });
    if (!res.ok) throw new Error(`stream create failed ${res.status}`);
    const { id, offer, ice_servers, session_id } = (await res.json()) as CreateStreamRes;
    streamId.current = id;
    sessionId.current = session_id;

    pc.current = new RTCPeerConnection({ iceServers: ice_servers });
    const dc = pc.current.createDataChannel('JanusDataChannel');
    wireDataChannel(dc);

    pc.current.addEventListener('icecandidate', handleIceCandidate);
    pc.current.addEventListener('connectionstatechange', handleConnectionStateChange)
    pc.current.addEventListener('track', handleTrack);
    pc.current.addEventListener('datachannel', e => {
      console.log('inside data chanel')
      wireDataChannel(e.channel);
    });

    await pc.current.setRemoteDescription(offer);
    const answer = await pc.current.createAnswer();
    await pc.current.setLocalDescription(answer);

    await didFetch(`/${DID.SERVICE}/${AGENT_ID}/streams/${id}/sdp`, {
      method: 'POST',
      body: JSON.stringify({ answer, session_id }),
    });
    setConnected(true)
  };

  /** Speak _exactly_ `text` (no LLM involved) */
  const sendText = async (text: string): Promise<SendMessageRes> => {
    if (!streamId.current || !sessionId.current) throw new Error('Stream not ready');

    const payload = {
      script: { type: 'text', input: text, ssml: true },
      session_id: sessionId.current,
    };

    const res = await didFetch(`/${DID.SERVICE}/${AGENT_ID}/streams/${streamId.current}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`sendText failed ${res.status}: ${await res.text()}`);
    return (await res.json()) as SendMessageRes;
  };

  /** Cleanup */
  const destroy = async () => {
    if (streamId.current) {
      await didFetch(`/${DID.SERVICE}/${AGENT_ID}/streams/${streamId.current}`, {
        method: 'DELETE',
        body: JSON.stringify({ session_id: sessionId.current }),
      });
    }
    if (pc.current) {
      pc.current.close();
      pc.current.removeEventListener('icecandidate', handleIceCandidate);
      pc.current.removeEventListener('track', handleTrack);
      pc.current = null;
    }
    streamId.current = null;
    sessionId.current = null;
    setConnected(false)
  };

  return { connected, connect, sendText, destroy };
}
