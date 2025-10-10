import React, { useEffect, useRef, useState } from "react";

const WebcamView: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream;

    const startWebcam = async () => {
      try {
        // Request access to webcam
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err: any) {
        console.error("Error accessing webcam:", err);
        setError("Failed to access webcam. Please check permissions.");
      }
    };

    startWebcam();

    // Cleanup when component unmounts
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <div style={{ textAlign: "center", padding: "20px" }}>
      <h2>Live Webcam Feed</h2>
      {error ? (
        <p style={{ color: "red" }}>{error}</p>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            width: "100%",
            maxWidth: "600px",
            borderRadius: "12px",
            border: "2px solid #ccc",
          }}
        />
      )}
    </div>
  );
};

export default WebcamView;
