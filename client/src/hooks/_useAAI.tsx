import { StreamingTranscriber } from 'assemblyai';
import React, { useRef, useState } from 'react'
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

  const [eot, setEOT] = useState(false)


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

  async function startSTT(token: string) {
    setEOT(false)
    realtimeTranscriber.current = new StreamingTranscriber({
      token,
      sampleRate: 16000,
    })

    realtimeTranscriber.current.on("open", (event) => {
      console.log('WebSocket connection established');
      setMode("listening");

      startSilenceTimer();
    })

    realtimeTranscriber.current.on("turn", async (event) => {
      const message = event.transcript;

      const text = (message || "").trim();

      if (text && !hasSpokenRef.current) {
        hasSpokenRef.current = true;
        clearSilenceTimer();
      }

      if (event.end_of_turn && event.transcript != '' && !eot) {
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
    })


    await realtimeTranscriber.current.connect();


    audioContextRef.current = new AudioContext({ sampleRate: 16000 });
    streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
    const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(audioContextRef.current.destination);

    processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const buffer = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      realtimeTranscriber.current?.sendAudio(buffer.buffer);
    };
  }

  const stopSTT = async () => {
    if (realtimeTranscriber.current) {
      clearSilenceTimer();
      await realtimeTranscriber.current.close();
    }

    if (streamRef.current && audioContextRef.current) {
      // stop mic
      streamRef.current.getTracks().forEach(t => t.stop());
      await audioContextRef.current.close();

      streamRef.current = null;
      audioContextRef.current = null;
    }
  };

  return { startSTT, stopSTT };
}