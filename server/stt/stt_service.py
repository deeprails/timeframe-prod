import threading
import websocket
import json
from utils.mic_manager import open_mic, close_mic, listen_to_audio
from config.stt import API_ENDPOINT, ASSEMBLYAI_API_KEY, SILENCE_LIMIT
from presence_detection.detect_person import detect_person
from utils.websocket_manager import manager
import time
from threading import Event
from thinking.index import think
from utils.logs_manager import LogManager, Log

log = LogManager()


class STTService:
    _instance = None
    _initialized = False

    def __new__(cls, *args, **kwargs):
        # Only create one instance ever
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        # __init__ runs on every call to STTService(), so guard it
        if STTService._initialized:
            return
        STTService._initialized = True

        self.ws_app = None
        self.connected = True
        self.audio_thread = None
        self.exception: Exception | None = None
        self.stt_start_time = None
        self.muted = False
        self.stop_event: Event | None = None
        self.user_speak = False  # whether we've received any transcription yet
        self.buffered_transcripts = []      # stores EOT transcriptions during 2s window
        self.eot_timer = None               # holds reference to timer thread
        self.eot_active = False             # whether the 2s collection window is active
        self.accepting = True
        self.eot_deadline = None
        self.lock = threading.Lock()

    @classmethod
    def get_instance(cls):
        """Global access point to the single STTService."""
        return cls()

    def reset(self):
        with self.lock:
            self.muted = False
            self.user_speak = False
            self.stt_start_time = time.time()

            # Reset EOT collection state
            self.accepting = True
            self.eot_deadline = None
            self.eot_active = False
            self.buffered_transcripts = []
            if self.eot_timer:
                self.eot_timer.cancel()
                self.eot_timer = None

            log.add_log(Log(
                event="Reset STT triggered",
                detail="N/A",
            ))

    def on_open(self, ws):
        def stream_audio():
            open_mic()
            manager.broadcast("listening")
            print("STT started")
            self.stt_start_time = time.time()

            try:
                while self.connected and not self.stop_event.is_set():
                    # silence → presence logic
                    if not self.user_speak and (time.time() - self.stt_start_time > SILENCE_LIMIT):
                        if detect_person():
                            print("person detected, resetting timer")
                            self.stt_start_time = time.time()
                        else:
                            self.stop()
                            break

                    # if muted, skip sending
                    if self.muted:
                        continue

                    chunk = listen_to_audio()
                    ws.send(chunk, websocket.ABNF.OPCODE_BINARY)
                print(
                    f"audio streaming stop {self.connected} {not self.stop_event.is_set()}")
            except Exception as e:
                self.exception = e
                print(f"audio exception: {self.exception}")
                self.stop()
            finally:
                close_mic()

        self.audio_thread = threading.Thread(target=stream_audio, daemon=True)
        self.connected = True
        log.add_log(Log(
            event="AAI Connection Established",
            detail="N/A",
        ))
        self.audio_thread.start()

    def on_message(self, ws, message):
        # Drop anything that arrives after the 2s cutoff (strongest guarantee)
        if self.eot_active and self.eot_deadline and time.time() >= self.eot_deadline:
            return

        if not self.accepting:
            return  # ignore entirely after cutoff (fallback to the above)

        try:
            data = json.loads(message)
            if 'transcript' not in data:
                return

            transcript = data['transcript']
            self.user_speak = True

            # Always broadcast live transcription
            manager.broadcast(event="stt-transcription", data=transcript)

            # Handle end of turn (EOT)
            if data.get('end_of_turn', False):
                # First EOT in this segment
                with self.lock:
                    if not self.eot_active:
                        self.eot_deadline = time.time() + 2.0
                        self.eot_active = True
                        self.muted = True
                        self.buffered_transcripts = [transcript]

                        log.add_log(Log(
                            event="First EOT received",
                            detail=f"[PAYLOAD]:{message}",
                        ))

                        print(
                            "🛑 First EOT detected — mic muted, waiting 2s for late chunks...")
                        print("🧾 Transcript:", transcript)

                        # Start 2s grace window
                        self.eot_timer = threading.Timer(
                            2.0, self._finalize_transcription)
                        self.eot_timer.start()

                    else:
                        log.add_log(Log(
                            event="Subsequent EOT received",
                            detail=f"[PAYLOAD]:{message}",
                        ))
                        # Subsequent EOTs within grace window
                        print(
                            "🕒 Additional EOT received within 2s window — appending text...")
                        print("🧾 Transcript:", transcript)
                        self.buffered_transcripts.append(transcript)

        except Exception as e:
            self.exception = e
            self.stop()

    def on_error(self, ws, error):
        print(error)
        log.add_log(Log(
            event="AAI error",
            detail=str(error),
            type="error"
        ))
        self.exception = error

    def on_close(self, ws, code, reason):
        self.connected = False
        log.add_log(Log(
            event="AAI Connection closed",
            detail="N/A",
        ))
        print("STT stopped")

    def start(self, stop_event: Event):
        self.stop_event = stop_event
        self.ws_app = websocket.WebSocketApp(
            API_ENDPOINT,
            header={'Authorization': ASSEMBLYAI_API_KEY},
            on_open=self.on_open,
            on_message=self.on_message,
            on_error=self.on_error,
            on_close=self.on_close
        )
        wst = threading.Thread(target=self.ws_app.run_forever, daemon=True)
        wst.start()

        while not stop_event.is_set() and wst.is_alive():
            time.sleep(0.1)

        self.stop()
        if self.audio_thread:
            self.audio_thread.join()
        if self.exception:
            self.stop()
            raise self.exception

    def stop(self):
        self.connected = False
        if self.ws_app:
            self.ws_app.close()
            manager.broadcast(event="stop-video-connection")

    def _finalize_transcription(self):
        global log
        with self.lock:
            self.accepting = False  # do not accept transcription after this point
            full_text = " ".join(self.buffered_transcripts).strip()
            print(f"🧠 Final combined transcript: {full_text}")

        # Log & Think
        log.add_log(Log(
            event="Transcription finalized",
            detail=f"[ONLINE]:{full_text}",
        ))
        think(full_text)
