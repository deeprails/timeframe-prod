import type { BeginEvent, TerminationEvent, TurnEvent } from "assemblyai";
import { useRef, useState } from "react";
import { socket as local_socket } from "../apis/socket";

interface Props {
  setTranscription: React.Dispatch<React.SetStateAction<string | null>>
  setMode: React.Dispatch<React.SetStateAction<Modes>>
}
type AAIMessage = BeginEvent | TurnEvent | TerminationEvent;

export default function useAAI({ setTranscription, setMode }: Props) {
  const socket = useRef<WebSocket>(null);
  const audioContext = useRef<AudioContext>(null);
  const mediaStream = useRef<MediaStream>(null);
  const scriptProcessor = useRef<ScriptProcessorNode>(null);

  const hasSpokenRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startSilenceTimer = () => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      if (!hasSpokenRef.current) {
        setMode("idle")
        const payload = JSON.stringify({ event: "back-to-idle" })
        local_socket.send(payload);
      }
    }, 8000);
  };
  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const startSTT = async (token: string) => {
    `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&end_of_turn_confidence_threshold=0.9&max_turn_silence=2500&min_end_of_turn_silence_when_confident=1500`
    const wsUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&end_of_turn_confidence_threshold=0.9&max_turn_silence=2500&min_end_of_turn_silence_when_confident=1500&token=${token}`;
    socket.current = new WebSocket(wsUrl);

    hasSpokenRef.current = false;
    startSilenceTimer();

    socket.current.onopen = async () => {
      console.log('WebSocket connection established');
      setMode("listening");

      mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext.current = new AudioContext({ sampleRate: 16000 });

      const source = audioContext.current.createMediaStreamSource(mediaStream.current);
      try {
        await audioContext.current.audioWorklet.addModule("/audio-processor.js");
        console.log("🎧 Worklet loaded successfully");
      } catch (err) {
        console.error("❌ Failed to load audio worklet:", err);
      }

      const workletNode = new AudioWorkletNode(audioContext.current, "aai-processor");
      source.connect(workletNode);
      workletNode.connect(audioContext.current.destination);

      workletNode.port.onmessage = (event) => {
        if (!socket.current || socket.current.readyState !== WebSocket.OPEN) return;
      
        const base64 = arrayBufferToBase64(event.data);
        socket.current.send(JSON.stringify({ audio_data: base64 }));
      };

      startSilenceTimer();
    };

    socket.current.onmessage = (event: MessageEvent<string>) => {
      const message: AAIMessage = JSON.parse(event.data);
      console.log(message)

      if (message.type === 'Turn') {
        const text = (message.transcript || "").trim();

        if (text && !hasSpokenRef.current) {
          hasSpokenRef.current = true;
          clearSilenceTimer();
        }

        if (message.end_of_turn) {
          setTranscription(message.transcript);
          setTimeout(() => {
            const payload = JSON.stringify({ event: "start-thinking", data: message.transcript })
            local_socket.send(payload);
            setMode("thinking");
            stopSTT();
          }, 1500)
        } else {
          setTranscription(message.transcript);
        }
      }
    };

    socket.current.onerror = (err) => {
      console.error('WebSocket error:', err);
      clearSilenceTimer();
      stopSTT();
    };

    socket.current.onclose = () => {
      console.log('WebSocket closed');
      clearSilenceTimer();
      socket.current = null;
    };
  };

  const stopSTT = () => {
    clearSilenceTimer();
    if (scriptProcessor.current) {
      scriptProcessor.current.disconnect();
      scriptProcessor.current = null;
    }

    if (audioContext.current) {
      audioContext.current.close();
      audioContext.current = null;
    }

    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(track => track.stop());
      mediaStream.current = null;
    }

    if (socket.current) {
      socket.current.send(JSON.stringify({ type: 'Terminate' }));
      socket.current.close();
      socket.current = null;
    }
  };


  return { startSTT, stopSTT };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk as any);
  }
  return btoa(binary);
}
