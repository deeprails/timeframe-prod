import os
import sys
import json
import time
import threading
import pyaudio
from vosk import Model, KaldiRecognizer
from utils.websocket_manager import manager
from presence_detection.detect_person import detect_person
from config.stt import SILENCE_LIMIT
from thinking.index import think
from utils.mic_manager import open_mic, close_mic
from utils.logs_manager import LogManager


class OfflineSTT:
    _instance = None
    _initialized = False

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if OfflineSTT._initialized:
            return
        OfflineSTT._initialized = True
        self._audio_exception: Exception | None = None

        # self.model_path = "vosk-model-small-en-us-0.15"
        if not os.path.exists(self.model_path):
            print(f"Model not found at '{self.model_path}'")
            print("Download from: https://alphacephei.com/vosk/models")
            sys.exit(1)

        print("Loading Vosk model...")
        # self.model = Model(self.model_path)
        self.recognizer = KaldiRecognizer(self.model, 16000)
        self.recognizer.SetWords(True)
        print("Model loaded.")

        self.stop_event = None
        self.audio_thread = None
        self.stt_start_time = None
        self.user_speak = False
        self.muted = False

    @classmethod
    def get_instance(cls):
        return cls()

    def start(self, stop_event: threading.Event):
        self.stop_event = stop_event
        self.user_speak = False
        self.muted = False
        self.stt_start_time = time.time()

        print("Offline STT started")
        manager.broadcast("listening")
        open_mic()

        self.audio_thread = threading.Thread(
            target=self._listen_loop, daemon=True)
        self.audio_thread.start()
        self.audio_thread.join()

        close_mic()
        print("Offline STT stopped")
        if self._audio_exception:
            raise self._audio_exception

    def reset(self):
        self.muted = False
        self.user_speak = False
        self.stt_start_time = time.time()
        self._audio_exception = None

    def _listen_loop(self):
        FORMAT = pyaudio.paInt16
        CHANNELS = 1
        RATE = 16000
        CHUNK = 1024

        audio = pyaudio.PyAudio()
        stream = audio.open(format=FORMAT,
                            channels=CHANNELS,
                            rate=RATE,
                            input=True,
                            frames_per_buffer=CHUNK)
        stream.start_stream()

        try:
            while not self.stop_event.is_set():
                data = stream.read(CHUNK, exception_on_overflow=False)

                if not self.user_speak and (time.time() - self.stt_start_time > SILENCE_LIMIT):
                    if detect_person():
                        print("Person detected. Resetting timer.")
                        self.stt_start_time = time.time()
                    else:
                        print("No person detected. Stopping STT.")
                        break

                if self.muted:
                    continue

                if self.recognizer.AcceptWaveform(data):
                    result = json.loads(self.recognizer.Result())
                    if result.get("text"):
                        self.muted = True
                        print("Final:", result["text"])
                        print("Shifting to Thinking mode. Mic is now muted.")
                        log = LogManager()
                        log.insert_question(
                            question=f"[OFFLINE]:{result['text']}")
                        think(result["text"])
                else:
                    partial = json.loads(self.recognizer.PartialResult())
                    self.user_speak = True
                    if partial.get("partial"):
                        manager.broadcast(
                            event="stt-transcription", data=partial["partial"])

        except Exception as e:
            self._audio_exception = e
            print(f"Offline STT Error: {e}")
        finally:
            if stream.is_active() or not stream.is_stopped():
                stream.stop_stream()
            stream.close()
            audio.terminate()
