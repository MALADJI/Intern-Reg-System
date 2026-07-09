import { Component, OnInit, OnDestroy, ViewChild, ElementRef, NgZone, ChangeDetectorRef } from "@angular/core";
import { Router } from "@angular/router";
import { CommonModule } from "@angular/common";
import { AuthService } from "../../services/auth.service";
import { ApiService } from "../../services/api.service";
import Swal from "sweetalert2";
import * as faceapi from 'face-api.js';

@Component({
  selector: "app-face-verification",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./face-verification.html",
  styleUrls: ["./face-verification.css"]
})
export class FaceVerificationComponent implements OnInit, OnDestroy {
  @ViewChild("videoElement") videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild("canvasElement") canvasElement!: ElementRef<HTMLCanvasElement>;

  stream: MediaStream | null = null;
  phase: "LOADING" | "READY" | "SCANNING" | "SUCCESS" | "ERROR" = "LOADING";
  statusMessage = "Loading face recognition models...";
  cameraError = false;
  cameraErrorMessage = "";
  isScanning = false;

  confidence: number | null = null;
  attemptCount = 0;
  readonly MAX_ATTEMPTS = 5;

  private internEmail: string | null = null;

  videoDevices: MediaDeviceInfo[] = [];
  currentCameraIndex = 0;

  constructor(
    private router: Router,
    private api: ApiService,
    private authService: AuthService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) { }

  async ngOnInit() {
    const user = this.authService.currentUser;
    if (user) {
      this.internEmail = user.email || user.username;
    }
    
    try {
      await this.loadModels();
      await this.getVideoDevices();
      this.phase = "READY";
      this.statusMessage = "Camera ready. Position your face and click Scan My Face.";
      this.cdr.detectChanges();
      await this.startCamera();
    } catch (err) {
      console.error("Initialization error", err);
      this.statusMessage = "Error initializing camera or models.";
      this.cameraError = true;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  async loadModels() {
    const modelPath = '/models';
    await faceapi.nets.tinyFaceDetector.loadFromUri(modelPath);
    await faceapi.nets.faceLandmark68Net.loadFromUri(modelPath);
    await faceapi.nets.faceRecognitionNet.loadFromUri(modelPath);
  }

  async getVideoDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.videoDevices = devices.filter(device => device.kind === 'videoinput' && device.deviceId);
    } catch (e) {
      console.warn("Could not enumerate devices", e);
      this.videoDevices = [];
    }
  }

  async switchCamera() {
    // Re-enumerate cameras in case new ones are now visible after permission granted
    await this.getVideoDevices();
    if (this.videoDevices.length === 0) {
      // No cameras found — just restart with default
      await this.startCamera();
      return;
    }
    this.currentCameraIndex = (this.currentCameraIndex + 1) % this.videoDevices.length;
    await this.startCamera();
  }

  async startCamera() {
    this.stopCamera();
    try {
      this.cameraError = false;
      this.cameraErrorMessage = "";
      this.statusMessage = "Accessing camera...";
      this.cdr.detectChanges();

      const activeDeviceId = this.videoDevices.length > 0 && this.videoDevices[this.currentCameraIndex]?.deviceId
        ? this.videoDevices[this.currentCameraIndex].deviceId
        : null;

      const constraints: MediaStreamConstraints = {
        video: activeDeviceId
          ? { deviceId: { exact: activeDeviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
          : { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Once permission is granted, enumerate devices to get valid IDs and labels.
      await this.getVideoDevices();

      // Keep currentCameraIndex in sync with active stream device
      if (this.stream) {
        const activeTrack = this.stream.getVideoTracks()[0];
        if (activeTrack) {
          const settings = activeTrack.getSettings();
          const activeId = settings.deviceId;
          if (activeId) {
            const index = this.videoDevices.findIndex(d => d.deviceId === activeId);
            if (index !== -1) {
              this.currentCameraIndex = index;
            }
          }
        }
      }

      if (this.videoElement && this.videoElement.nativeElement) {
        const video = this.videoElement.nativeElement;
        video.srcObject = this.stream;
        video.onloadedmetadata = () => {
          video.play().catch(() => {});
          // Give camera a full 1 second to warm up before user can scan
          setTimeout(() => {
            this.ngZone.run(() => {
              this.phase = "READY";
              this.statusMessage = "Camera ready. Position your face and click Scan My Face.";
              this.cdr.detectChanges();
            });
          }, 1000);
        };
      }
    } catch (err: any) {
      console.error("Camera access failed:", err);
      this.cameraError = true;
      this.phase = "READY";
      if (err.name === "NotAllowedError") {
        this.cameraErrorMessage = "Camera permission denied. Please allow camera access and retry.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        this.cameraErrorMessage = "No camera found. Please connect a webcam and retry.";
      } else {
        this.cameraErrorMessage = "Could not access webcam. Please retry.";
      }
      this.statusMessage = "Camera error.";
      this.cdr.detectChanges();
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }

  async scanFace() {
    if (this.isScanning) return;
    if (!this.videoElement?.nativeElement) {
      Swal.fire({ icon: "warning", title: "Camera not ready", text: "Please wait for the camera to initialize." });
      return;
    }
    if (!this.internEmail) {
      this.handleVerificationFailure("Could not determine your user email. Please log out and log in again.");
      return;
    }

    const video = this.videoElement.nativeElement;

    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
      Swal.fire({ icon: "warning", title: "Camera warming up", text: "Please wait a moment and try again." });
      return;
    }

    this.isScanning = true;
    this.phase = "SCANNING";
    this.statusMessage = "Detecting face...";
    this.confidence = null;
    this.cdr.detectChanges();

    try {
      const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
                                     .withFaceLandmarks()
                                     .withFaceDescriptor();

      if (!detection) {
        this.isScanning = false;
        this.attemptCount++;
        this.phase = "READY";
        this.statusMessage = `Could not scan face (${this.attemptCount}/${this.MAX_ATTEMPTS}). Ensure your face is clearly visible.`;
        if (this.attemptCount >= this.MAX_ATTEMPTS) {
          this.handleVerificationFailure("Verification failed. Please try again in a well-lit area facing the camera directly.");
        }
        this.cdr.detectChanges();
        return;
      }

      const descriptor = Array.from(detection.descriptor);
      this.statusMessage = "Verifying with server...";
      this.cdr.detectChanges();

      this.api.post<any>("auth/face-verify", { email: this.internEmail, descriptor }).subscribe({
        next: (result) => {
          this.ngZone.run(() => {
            this.isScanning = false;
            this.confidence = result.confidence;
            this.attemptCount++;

            if (result.verified) {
              this.handleVerificationSuccess();
            } else {
              this.phase = "READY";
              const conf = result.confidence ? result.confidence.toFixed(1) + "%" : "N/A";
              this.statusMessage = `Face mismatch (${this.attemptCount}/${this.MAX_ATTEMPTS}). Match rating: ${conf}. Try again.`;

              if (this.attemptCount >= this.MAX_ATTEMPTS) {
                this.handleVerificationFailure(
                  `Verification failed after ${this.MAX_ATTEMPTS} attempts. ` +
                  `Best match rating was ${conf}. Please ensure:\n• Good lighting on your face\n• Camera is at eye level\n• You're looking directly at the camera`
                );
              }
              this.cdr.detectChanges();
            }
          });
        },
        error: (err) => {
          this.ngZone.run(() => {
            this.isScanning = false;
            this.attemptCount++;
            const errMsg = err.error?.message || err.message || "Unknown error";

            if (errMsg.includes("No face profile enrolled")) {
              this.handleVerificationFailure("No face profile found. Please register your face first.");
            } else {
              this.phase = "READY";
              this.statusMessage = `Server error (${this.attemptCount}/${this.MAX_ATTEMPTS}). Try again.`;

              if (this.attemptCount >= this.MAX_ATTEMPTS) {
                this.handleVerificationFailure("Verification failed due to server error.");
              }
              this.cdr.detectChanges();
            }
          });
        }
      });
    } catch (error) {
      console.error(error);
      this.isScanning = false;
      this.attemptCount++;
      this.phase = "READY";
      this.statusMessage = `Processing error (${this.attemptCount}/${this.MAX_ATTEMPTS}). Try again.`;
      this.cdr.detectChanges();
    }
  }

  handleVerificationSuccess() {
    this.phase = "SUCCESS";
    this.statusMessage = "Identity verified!";
    this.stopCamera();

    Swal.fire({
      icon: "success",
      title: "Verified ✓",
      text: "Welcome back!",
      timer: 1500,
      showConfirmButton: false
    }).then(() => {
      this.router.navigate(["/intern/intern-dashboard"]);
    });
  }

  handleVerificationFailure(reason?: string) {
    this.phase = "ERROR";
    this.statusMessage = "Verification failed.";
    this.stopCamera();

    Swal.fire({
      icon: "error",
      title: "Verification Failed",
      text: reason || "We could not confirm your identity. Please try again.",
      confirmButtonText: "Try Again"
    }).then(() => {
      window.location.reload();
    });
  }

  async retryCamera() {
    this.cameraError = false;
    this.cameraErrorMessage = "";
    this.attemptCount = 0;
    await this.startCamera();
  }

  logout() {
    this.authService.logout();
  }
}
