import { StreamingTranscriber } from 'assemblyai';
import React, { useReducer, useRef, useState } from 'react'
import { socket as local_socket } from "../apis/socket";
import { broadcastError } from '../utils';

interface Props {
  setTranscription: React.Dispatch<React.SetStateAction<string | null>>
  setMode: React.Dispatch<React.SetStateAction<Modes>>
}

export default function useAAI({ setTranscription, setMode }: Props) {
  const realtimeTranscriber = useRef<StreamingTranscriber>(null);

  const hasSpokenRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const queuedRef = useRef<number>(0)
  const connectedRef = useRef(false);

  const [eot, setEOT] = useState(false)


  const startSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (!hasSpokenRef.current) {
        setMode("idle")
        const payload = JSON.stringify({ event: "back-to-idle" })
        local_socket.send(payload);
        reset();
      }
    }, 8000);
  };
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  async function startSTT(token: string) {
    setEOT(false)
    realtimeTranscriber.current = new StreamingTranscriber({
      token,
      sampleRate: 16000,
    })

    realtimeTranscriber.current.on("open", (event) => {
      console.log('WebSocket connection established');
      setMode("listening");
      connectedRef.current = true;

      startSilenceTimer();
    })

    realtimeTranscriber.current.on("turn", async (event) => {
      console.log("[TURN]", { eot: event.end_of_turn, len: (event.transcript || "").length });
      const message = event.transcript;

      const text = (message || "").trim();

      if (text && !hasSpokenRef.current) {
        hasSpokenRef.current = true;
        clearSilenceTimer();
      }

      if (event.end_of_turn && (event.transcript || "").length != 0 && !eot) {
        setEOT(true)
        setTranscription(message);
        setTimeout(() => {
          const payload = JSON.stringify({ event: "start-thinking", data: message })
          local_socket.send(payload);
          setMode("thinking");
        }, 1500)
        stopSTT();
      } else {
        setTranscription(message);
      }
    })

    realtimeTranscriber.current.on("error", (error) => {
      console.error('WebSocket error:', error);
      broadcastError(`WebSocket error: ${error.message}`)
      setMode("away")
      clearSilenceTimer();
      stopSTT();
      connectedRef.current = false;
    })

    realtimeTranscriber.current.on("close", () => {
      reset();
    })


    const begin = await realtimeTranscriber.current.connect();

    console.log(
      "[AAI] begin.id:", begin.id,
      "expires_at:", new Date(begin.expires_at * 1000).toISOString()
    );


    // audioContextRef.current = new AudioContext({ sampleRate: 16000 });
    // streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    // const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
    // const processor = audioContextRef.current.createScriptProcessor(1024, 1, 1);

    // source.connect(processor);
    // processor.connect(audioContextRef.current.destination);

    // processor.onaudioprocess = (e) => {
    //   const input = e.inputBuffer.getChannelData(0);
    //   const buffer = new Int16Array(input.length);
    //   for (let i = 0; i < input.length; i++) {
    //     const s = Math.max(-1, Math.min(1, input[i]));
    //     buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    //   }
    //   realtimeTranscriber.current?.sendAudio(buffer.buffer);
    // };

    audioContextRef.current = new AudioContext({ latencyHint: 'interactive' });

    // Request mono, disable fancy DSP to reduce latency (tune as needed)
    streamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      }
    });

    await audioContextRef.current.audioWorklet.addModule('/aai-worklet.js');

    const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
    const worklet = new AudioWorkletNode(audioContextRef.current, 'aai-worklet', {
      processorOptions: { targetSampleRate: 16000 }
    });

    source.connect(worklet);

    worklet.port.onmessage = (e) => {
      if (e.data?.type !== 'audio') return;
      if (!realtimeTranscriber.current) return;

      const MAX_QUEUED = 50;

      // simple backpressure: drop oldest if queue grows too large
      if (queuedRef.current > MAX_QUEUED) {
        queuedRef.current = 0; // reset counter; next frames will be fresh
        return;
      }

      const pcm16 = floatToPCM16(e.data.samples);
      queuedRef.current++;

      // If the SDK exposes a promise or callback, hook it to decrement queued.
      console.log('connected', connectedRef.current)
      if (connectedRef.current) {
        try {
          console.log('pcm16.buffer', pcm16.buffer)
          realtimeTranscriber.current.sendAudio(pcm16.buffer);
        } finally {
          queuedRef.current--;
        }
      }
    };
  }

  const stopSTT = async () => {
    try {
      clearSilenceTimer();

      // 🧹 Stop audio processing first
      if (audioContextRef.current) {
        // Disconnect processor & source if they exist
        const ctx = audioContextRef.current;
        ctx.suspend().catch(console.warn);
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      // 🧩 Close the transcriber after audio stops flowing
      if (realtimeTranscriber.current) {
        try {
          await realtimeTranscriber.current.close();
        } catch (err) {
          console.warn("[AAI] Error closing transcriber:", err);
        }
      }

      // 🔇 Finally close the audio context
      if (audioContextRef.current) {
        await audioContextRef.current.close();
      }

      reset()
    } catch (error) {
      console.error("[AAI stopSTT error]", error);
    }
  };


  function reset() {
    audioContextRef.current = null;
    streamRef.current = null;
    realtimeTranscriber.current = null;
    queuedRef.current = 0;
    connectedRef.current = false;
  }

  return { startSTT, stopSTT };
}

function floatToPCM16(f32: Float32Array) {
  const out = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}