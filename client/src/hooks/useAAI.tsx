import { useEffect, useRef, useState } from "react";
import { WavRecorder } from "wavtools";

export default function useAAI() {
  const socket = useRef<WebSocket>(null);
  const audioContext = useRef<AudioContext>(null);
  const mediaStream = useRef<MediaStream>(null);
  const scriptProcessor = useRef<ScriptProcessorNode>(null);

  const [transcripts, setTranscripts] = useState({});

  const startRecording = async () => {
    const token = "AQICAHgniYaElTsUjrvXxctupi0J2iqJuH8-jsA2X_IMiWgmywGsVUeJXUARy6umYheSEVADAAADujCCA7YGCSqGSIb3DQEHBqCCA6cwggOjAgEAMIIDnAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAwTiWwNan3gE_rqMfQCARCAggNtPsaRD5cQ4LuFxgogwpOCiD8CvUdtOxhhSra0XlMfo3ki-e4Ph3Odtp9F08_05ZEj5XygG8bWssv3xZ8Pay1DzQF5c-RYnkmk2o3RD3iOWWjKOmk69QGKOcg9RfPIbKuOFUqzD0zrV-YS9vLQgl0QpKRnpr40TGluswGQ6NcfrNzhS_6bc3cX0UAcA4YC2Kl0x4TbpuVt-hUuYie8PefJT9X3HzGWbvcxNlLPkCh2MgQfX9RUCkT0NuTozByX-15iWumK29u8aSWyd8cCx2xE8sI-uma_HBqq5xAbIcdPM4lfbWKJRIF-8gaY8xeEQIW9F8ba3SwaKwGez0hBloFT-WuT365NDFIewUraOgPjhInO_Wh-8qgDUCbH7eL_AaU2RoI_c-qYaIDgVdEZAecBT9SRrA8bt5H_F67EtdJxQQZS6CISticMZYvbgVMyXB5_DgEL1oUWikfgcfElMWghsNVJ_q4c5Zb7pCJHfGIxgUhmmwzHkPckjKTkYUA-gTqYXaXPXC-uB-LphmWWerSaDRtmxHjfJADh3pODGuT7VXAClX8Vwft5a85OcFJrFnwXi9IDNoaPevkPTwFhSvhb4Eal0ZzFHs6dnV833XR4bpeDxSj9Pxlxhdk59Vu721rLnWAqh82FToBOyRUQ41EDTuIZ3Pw80nhkwDRD20yqaT4GGAG9ZymCjRu-iBJSc60HsMuciq8iCNPl9MUnaUuLuomV5TrSXFWK-FL2qRbRxfJTYF7v8E-ylyYOafyt7gc7f7IzoYzBY84ipMiioJIV19_srNrZ25Pzzi2kDN05KOOS3RrBZsun3WcSjdcC54B49R3K8fawYfxkylM5HzFC_fRvHNF2k-XGF9m3x27JbG13KgVSZWsQBQUiREo1TfZVu4Dd2aTNpx1cQp8zDLtuvoZPtpZuoUwTH-aCLQM_vViuKFoFvGjZCX41WyYP4tB-5tmo9i6xKpIaNuPf0bKuKAOP_uLUHVgVQZ1pBcDeaSAzDzz-novFvFW_zodiLQvp4Ys3--Oww_wStlSo6Rk5kVTgrOAuU3qZbC9IJGpPbdmJIirwdDoiJIqovoBXGP4FXZasjvSMptO10wGQ_aESpMhm_KLK-oeHN645y2MtK_Q9GsQpcLnw9UNinN4O8b-TT4SOnOItreMlkuFm8A";
    if (!token) return;

    const wsUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&formatted_finals=true&token=${token}`;
    socket.current = new WebSocket(wsUrl);

    const turns = {}; // for storing transcript updates per turn

    socket.current.onopen = async () => {
      console.log('WebSocket connection established');

      mediaStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext.current = new AudioContext({ sampleRate: 16000 });

      const source = audioContext.current.createMediaStreamSource(mediaStream.current);
      scriptProcessor.current = audioContext.current.createScriptProcessor(4096, 1, 1);

      source.connect(scriptProcessor.current);
      scriptProcessor.current.connect(audioContext.current.destination);

      scriptProcessor.current.onaudioprocess = (event) => {
        if (!socket.current || socket.current.readyState !== WebSocket.OPEN) return;

        const input = event.inputBuffer.getChannelData(0);
        const buffer = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          buffer[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
        }
        socket.current.send(buffer.buffer);
      };
    };

    socket.current.onmessage = (event: MessageEvent) => {
      const message = JSON.parse(event.data);

      if (message.type === 'Turn') {
        const { turn_order, transcript } = message;
        turns[turn_order] = transcript;

        const ordered = Object.keys(turns)
          .sort((a, b) => Number(a) - Number(b))
          .map((k) => turns[k])
          .join(' ');

        console.log({ ...turns })
        setTranscripts({ ...turns });
      }
    };

    socket.current.onerror = (err) => {
      console.error('WebSocket error:', err);
      stopRecording();
    };

    socket.current.onclose = () => {
      console.log('WebSocket closed');
      socket.current = null;
    };
  };

  const stopRecording = () => {
    setIsRecording(false);

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

  const orderedTranscript = Object.keys(transcripts)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => transcripts[k])
    .join(' ');

  useEffect(() => {
    startRecording()
  }, [])


  return { transcripts };
}
