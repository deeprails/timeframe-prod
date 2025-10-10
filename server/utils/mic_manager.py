import pyaudio
from pyaudio import PyAudio
from config.stt import *

stream = None
audio: PyAudio | None = None


def open_mic():
    global stream, audio
    audio = pyaudio.PyAudio()
    try:
        stream = audio.open(
            input=True,
            frames_per_buffer=FRAMES_PER_BUFFER,
            channels=CHANNELS,
            format=FORMAT,
            rate=SAMPLE_RATE,
        )
        print('Microphone is open')
    except Exception as e:
        audio.terminate()
        raise IOError("Failed to open microphone")


def listen_to_audio():
    if stream:
        return stream.read(
            FRAMES_PER_BUFFER, exception_on_overflow=False)
    else:
        raise IOError(
            "Tried to read audio stream while microphone was not open")


def close_mic():
    global stream, audio
    if stream:
        try:
            stream.stop_stream()
        except:
            pass
            stream.close()
        stream = None

    if audio:
        audio.terminate()
        audio = None
        print('Microphone is closed')
