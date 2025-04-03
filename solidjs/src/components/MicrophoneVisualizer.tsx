import { Component, createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";

interface Props {
  isListening: boolean;
  onClose: () => void;
  onMute: () => void;
}

const MicrophoneVisualizer: Component<Props> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  let audioContextRef: AudioContext | null = null;
  let analyserRef: AnalyserNode | null = null;
  let animationFrameRef: number = 0;
  let mediaStreamRef: MediaStream | null = null;

  const startVisualization = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef = stream;
      audioContextRef = new AudioContext();
      analyserRef = audioContextRef.createAnalyser();
      const source = audioContextRef.createMediaStreamSource(stream);
      source.connect(analyserRef);
      analyserRef.fftSize = 256;

      animate();
    } catch (err) {
      console.error("Error accessing microphone:", err);
    }
  };

  const animate = () => {
    if (!canvasRef || !analyserRef) return;

    const canvas = canvasRef;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dataArray = new Uint8Array(analyserRef.frequencyBinCount);

    const draw = () => {
      if (!props.isListening) return;

      analyserRef!.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Calculate average volume with more weight on lower frequencies
      const average =
        dataArray.reduce((a, b, i) => {
          // Give more weight to lower frequencies
          const weight = 1 - (i / dataArray.length) * 0.5;
          return a + b * weight;
        }, 0) / dataArray.length;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const minRadius = 60;
      const maxRadius = 140;
      // Make radius more responsive with exponential scaling
      const radius =
        minRadius + Math.pow(average / 256, 1.5) * (maxRadius - minRadius);

      // Add glow effect
      ctx.shadowBlur = 15;
      ctx.shadowColor = "#818CF8";

      // Draw multiple circles for layered effect
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - i * 5, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(129, 140, 248, ${1 - i * 0.2})`;
        ctx.lineWidth = 3 - i;
        ctx.stroke();
      }

      // Dynamic fill with pulse effect
      const pulseIntensity = Math.sin(Date.now() * 0.005) * 0.2 + 0.8;
      ctx.fillStyle = `rgba(165, 180, 252, ${
        (average / 512) * pulseIntensity
      })`;
      ctx.fill();

      animationFrameRef = requestAnimationFrame(draw);
    };

    draw();
  };

  createEffect(() => {
    if (props.isListening) {
      startVisualization();
    }
  });

  onCleanup(() => {
    if (animationFrameRef) {
      cancelAnimationFrame(animationFrameRef);
    }
    if (mediaStreamRef) {
      mediaStreamRef.getTracks().forEach((track: MediaStreamTrack) => track.stop());
      mediaStreamRef = null;
    }
    if (audioContextRef) {
      audioContextRef.close();
      audioContextRef = null;
    }
  });

  return (
    <div class="flex flex-col items-center justify-center w-full h-full relative">
      <canvas
        ref={canvasRef}
        width="300"
        height="300"
        class="max-w-full max-h-full"
      />

      <div class="flex gap-8 mt-8">
        <button
          onClick={props.onClose}
          class="p-6 rounded-full bg-gray-800 hover:bg-gray-700 transition-colors"
          aria-label="Stop recording"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-8 w-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <button
          onClick={props.onMute}
          class={`p-6 rounded-full transition-colors ${
            props.isListening
              ? "bg-gray-800 hover:bg-gray-700"
              : "bg-red-800 hover:bg-red-700"
          }`}
          aria-label={props.isListening ? "Mute microphone" : "Unmute microphone"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-8 w-8 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
            <Show when={!props.isListening}>
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 3l18 18"
              />
            </Show>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default MicrophoneVisualizer;
