import { Component, OnInit, OnDestroy, ViewChild, ElementRef, NgZone, ChangeDetectorRef } from "@angular/core";
import { Router } from "@angular/router";
import { CommonModule } from "@angular/common";
import { AuthService } from "../../services/auth.service";
import { ApiService } from "../../services/api.service";
import Swal from "sweetalert2";
import * as faceapi from 'face-api.js';

@Component({
  selector: "app-face-registration",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./face-registration.html",
  styleUrls: ["./face-registration.css"]
})
export class FaceRegistrationComponent implements OnInit, OnDestroy {
  @ViewChild("videoElement") videoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild("canvasElement") canvasElement!: ElementRef<HTMLCanvasElement>;

  stream: MediaStream | null = null;
  phase: "LOADING" | "CAPTURE_BASELINE" | "VALIDATING" | "SUCCESS" | "ERROR" = "LOADING";
  statusMessage = "Loading face recognition models...";
  cameraError = false;
  cameraErrorMessage = "";
  isSaving = false;

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
    try {
      // ── SECURITY: Check if intern already has a face enrolled ──────────────
      // If yes, show a locked message and prevent re-enrollment entirely.
      // Only an admin can clear the face via the admin panel.
      const faceStatus = await this.api.get<any>('interns/me/face-status').toPromise().catch(() => null);
      if (faceStatus && faceStatus.hasFaceData === true) {
        this.phase = 'SUCCESS';
        this.statusMessage = 'Face already registered.';
        this.cdr.detectChanges();
        await Swal.fire({
          icon: 'info',
          title: 'Face Already Enrolled',
          text: 'Your face has already been registered and locked to your account. For security reasons it cannot be changed. If you need to re-register, please contact your administrator.',
          confirmButtonText: 'OK'
        });
        this.router.navigate(['/intern/intern-dashboard']);
        return;
      }
      // ──────────────────────────────────────────────────────────────────────

      await this.loadModels();
      await this.getVideoDevices();
      this.phase = "CAPTURE_BASELINE";
      this.statusMessage = "Camera ready. Position your face and click Capture.";
      this.cdr.detectChanges();
      await new Promise(resolve => setTimeout(resolve, 50));
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
          this.statusMessage = "Camera ready. Position your face in the frame and click Capture.";
          this.cdr.detectChanges();
        };
      }
    } catch (err: any) {
      console.error("Camera access failed:", err);
      this.cameraError = true;
      this.phase = "CAPTURE_BASELINE";
      if (err.name === "NotAllowedError") {
        this.cameraErrorMessage = "Camera permission denied. Please allow camera access and click Turn on Camera.";
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        this.cameraErrorMessage = "No camera found. Please connect a webcam and click Turn on Camera.";
      } else {
        this.cameraErrorMessage = "Could not access webcam. Click Turn on Camera to retry.";
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

  async captureAndSave() {
    if (this.isSaving) return;
    if (!this.videoElement || !this.videoElement.nativeElement || !this.canvasElement || !this.canvasElement.nativeElement) {
      Swal.fire({ icon: "warning", title: "Camera not ready", text: "Please wait for the camera to initialize." });
      return;
    }

    const video = this.videoElement.nativeElement;
    
    // Ensure video is streaming
    if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
      Swal.fire({ icon: "warning", title: "Camera warming up", text: "Please wait a moment and try again." });
      return;
    }

    this.isSaving = true;
    this.statusMessage = "Detecting face...";
    this.phase = "VALIDATING";
    this.cdr.detectChanges();

    try {
      const detection = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
                                     .withFaceLandmarks()
                                     .withFaceDescriptor();

      if (!detection) {
        this.isSaving = false;
        this.phase = "CAPTURE_BASELINE";
        this.statusMessage = "Please try again.";
        Swal.fire({
          icon: "error",
          title: "No Face Detected",
          text: "Could not detect a face in the image. Please ensure good lighting and look directly at the camera."
        });
        return;
      }

      const descriptor = Array.from(detection.descriptor);
      this.statusMessage = "Saving facial profile...";
      this.cdr.detectChanges();

      this.api.post<any>("interns/me/face", { descriptor }).subscribe({
        next: () => {
          this.stopCamera();
          this.phase = "SUCCESS";
          Swal.fire({
            icon: "success",
            title: "Enrollment Complete",
            text: "Your facial profile has been securely saved.",
            timer: 2000,
            showConfirmButton: false
          }).then(() => {
            this.router.navigate(["/intern/intern-dashboard"]);
          });
        },
        error: (err) => {
          console.error("Face registration error response:", err);
          this.isSaving = false;
          this.phase = "CAPTURE_BASELINE";
          this.statusMessage = "Please try again.";
          
          let errorText = "Could not save your facial profile. Please try again.";
          if (err.error && err.error.message) {
             errorText = err.error.message;
          } else if (err.error && err.error.error) {
             errorText = err.error.error;
          } else if (err.message) {
             errorText = err.message;
          }

          Swal.fire({ icon: "error", title: "Capture Failed", text: errorText });
          this.cdr.detectChanges();
        }
      });
    } catch (error) {
      console.error(error);
      this.isSaving = false;
      this.phase = "CAPTURE_BASELINE";
      this.statusMessage = "Please try again.";
      Swal.fire({ icon: "error", title: "Error", text: "An error occurred during face processing." });
      this.cdr.detectChanges();
    }
  }

  async retryCamera() {
    this.cameraError = false;
    this.cameraErrorMessage = "";
    await this.startCamera();
  }
}
