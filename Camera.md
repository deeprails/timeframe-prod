`server/utils/camera_manager.py` line `10`
```
cap = cv2.VideoCapture(0)
```
the argument 0 is the camera index — it tells OpenCV which camera device to open.

## 🎥 How camera indices work
- 0 → the default (usually built-in) camera
- 1 → the first external USB or virtual camera
- 2, 3, etc. → additional connected cameras

In order to see all camera indexes use `ffmpeg`
```
brew install ffmpeg
ffmpeg -f avfoundation -list_devices true -i ""
```
You’ll get something like:
```
[AVFoundation video devices]:
[0] FaceTime HD Camera
[1] USB Camera
```
→ So you’d use cv2.VideoCapture(1) to open the USB Camera.