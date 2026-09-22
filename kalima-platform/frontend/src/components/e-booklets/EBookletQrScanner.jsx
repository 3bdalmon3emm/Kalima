import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function EBookletQrScanner({ onDetected, onClose, t }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationFrameRef = useRef(null);
  const barcodeDetectorRef = useRef(null);
  const [status, setStatus] = useState("starting");

  useEffect(() => {
    let cancelled = false;

    // Prefer the platform QR engine (same one the native camera uses on
    // Android Chrome) — jsQR alone often fails to lock on where the OS camera
    // succeeds. Fall back to jsQR when BarcodeDetector is unavailable.
    if ("BarcodeDetector" in window) {
      try {
        barcodeDetectorRef.current = new window.BarcodeDetector({ formats: ["qr_code"] });
      } catch {
        barcodeDetectorRef.current = null;
      }
    }

    const stopStream = () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };

    const scanFrame = async () => {
      if (cancelled) return;

      const video = videoRef.current;
      if (video?.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
        let detectedValue = null;

        if (barcodeDetectorRef.current) {
          try {
            const codes = await barcodeDetectorRef.current.detect(video);
            if (codes?.length) detectedValue = codes[0].rawValue;
          } catch {
            // Detector hiccup on a frame — fall through to jsQR.
          }
        }

        const canvas = canvasRef.current;
        if (!detectedValue && canvas) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" });
          if (result?.data) detectedValue = result.data;
        }

        if (cancelled) return;
        if (detectedValue) {
          onDetected(detectedValue);
          stopStream();
          return;
        }
      }

      animationFrameRef.current = requestAnimationFrame(scanFrame);
    };

    const startCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            height: { ideal: 1280 },
            width: { ideal: 1280 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus("scanning");
        scanFrame();
      } catch {
        setStatus("error");
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      stopStream();
    };
  }, [onDetected]);

  const statusMessage = {
    starting: t("inviteAccept.codeRedemption.scannerStarting"),
    scanning: t("inviteAccept.codeRedemption.scannerHint"),
    unsupported: t("inviteAccept.codeRedemption.scannerUnsupported"),
    error: t("inviteAccept.codeRedemption.scannerError"),
  }[status];

  return (
    <div className="space-y-3 rounded-lg border bg-slate-950 p-3 text-white" data-testid="e-booklet-code-qr-scanner">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-semibold">
          <ScanLine className="h-4 w-4" />
          {t("inviteAccept.codeRedemption.scannerTitle")}
        </div>
        <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" onClick={onClose} aria-label={t("inviteAccept.codeRedemption.scannerClose")}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative overflow-hidden rounded-md bg-black">
        <video ref={videoRef} className="aspect-video w-full object-cover" autoPlay playsInline muted data-testid="e-booklet-code-qr-scanner-video" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-40 w-40 rounded-xl border-2 border-white shadow-[0_0_0_999px_rgba(0,0,0,0.28)] sm:h-52 sm:w-52" />
        </div>
        {status === "starting" && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm">{statusMessage}</div>}
      </div>

      <div className="flex items-start gap-2 text-sm text-slate-200">
        {status === "error" || status === "unsupported" ? <CameraOff className="mt-0.5 h-4 w-4 shrink-0" /> : <Camera className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>{statusMessage}</span>
      </div>
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}
