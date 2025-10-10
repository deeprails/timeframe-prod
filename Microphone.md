## List all available devices
```
import pyaudio

p = pyaudio.PyAudio()

for i in range(p.get_device_count()):
    info = p.get_device_info_by_index(i)
    if info["maxInputChannels"] > 0:
        print(f"Input Device id {i} - {info['name']}")
```

Example output on macOS:
```
Input Device id 0 - MacBook Pro Microphone
Input Device id 2 - USB Audio Device
Input Device id 3 - External Bluetooth Mic
```

## Select a specific microphone
`server/utils/mic_manager.py` line `13` onwards
```
stream = audio.open(
    input=True,
    input_device_index=2,  # 👈 your chosen mic
    frames_per_buffer=FRAMES_PER_BUFFER,
    channels=CHANNELS,
    format=FORMAT,
    rate=SAMPLE_RATE,
)
```