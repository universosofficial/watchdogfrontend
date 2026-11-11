import { Injectable, signal } from '@angular/core';
import { FilesetResolver, FaceLandmarker, DrawingUtils } from '@mediapipe/tasks-vision';

export type LivenessChallengeType = 'ALIGN_FACE' | 'BLINK' | 'TURN_LEFT' | 'TURN_RIGHT' | 'SMILE';

export interface LivenessChallenge {
  type: LivenessChallengeType;
  title: string;
  instruction: string;
  icon: string;
}

@Injectable({
  providedIn: 'root'
})
export class LivenessService {
  private faceLandmarker: FaceLandmarker | null = null;
  private isInitializing = false;
  private animFrameId: number | null = null;

  // Reactive State Signals
  readonly isModelReady = signal<boolean>(false);
  readonly isModelLoading = signal<boolean>(false);
  readonly faceDetected = signal<boolean>(false);
  readonly faceAligned = signal<boolean>(false);
  
  readonly currentChallenge = signal<LivenessChallenge | null>(null);
  readonly currentStepIndex = signal<number>(0);
  readonly totalSteps = signal<number>(2);
  readonly challengeProgress = signal<number>(0); // 0 to 100
  
  readonly livenessPassed = signal<boolean>(false);
  readonly feedbackMessage = signal<string>('Initializing 3D neural vision...');
  readonly livenessError = signal<string | null>(null);

  // Active challenge sequence
  private challengeQueue: LivenessChallenge[] = [];
  private consecutiveBlinkFrames = 0;
  private hadEyeClosed = false;
  private consecutiveTurnFrames = 0;
  private consecutiveSmileFrames = 0;
  private consecutiveAlignedFrames = 0;

  // Completion callback
  private onCompleteCallback?: (capturedSelfieDataUrl: string) => void;

  /**
   * Pre-load or initialize Google MediaPipe FaceLandmarker
   */
  async initLandmarker(): Promise<boolean> {
    if (this.faceLandmarker) {
      this.isModelReady.set(true);
      return true;
    }

    if (this.isInitializing) return false;
    this.isInitializing = true;
    this.isModelLoading.set(true);
    this.feedbackMessage.set('Loading 3D face mesh neural engine...');

    try {
      // 1. Resolve WASM assets (local first, CDN fallback)
      let filesetResolver: any;
      try {
        filesetResolver = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      } catch (e) {
        console.warn('[LivenessService] Local wasm failed, falling back to CDN:', e);
        filesetResolver = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
      }

      // 2. Initialize FaceLandmarker
      let modelPath = '/mediapipe/face_landmarker.task';
      try {
        this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'GPU'
          },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: 'VIDEO',
          numFaces: 1
        });
      } catch (gpuError) {
        console.warn('[LivenessService] GPU delegate failed, falling back to CPU:', gpuError);
        this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: modelPath,
            delegate: 'CPU'
          },
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          runningMode: 'VIDEO',
          numFaces: 1
        });
      }

      this.isModelReady.set(true);
      this.isModelLoading.set(false);
      this.isInitializing = false;
      this.feedbackMessage.set('Neural vision engine ready.');
      return true;
    } catch (err: any) {
      console.error('[LivenessService] Failed to initialize FaceLandmarker:', err);
      this.isModelLoading.set(false);
      this.isInitializing = false;
      this.livenessError.set('Could not load 3D neural tracker. Manual photo capture is available.');
      return false;
    }
  }

  /**
   * Start an interactive liveness session on a live video stream
   */
  async startLivenessSession(
    videoEl: HTMLVideoElement,
    canvasEl: HTMLCanvasElement,
    onComplete: (dataUrl: string) => void
  ): Promise<void> {
    this.resetState();
    this.onCompleteCallback = onComplete;

    const ready = await this.initLandmarker();
    if (!ready || !this.faceLandmarker) {
      return;
    }

    // Prepare randomized challenge queue to prevent spoof replays
    this.generateChallengeQueue();
    this.advanceToNextChallenge();

    // Start video detection loop
    let lastVideoTime = -1;
    const ctx = canvasEl.getContext('2d');

    const processLoop = () => {
      if (!this.faceLandmarker || videoEl.paused || videoEl.ended || this.livenessPassed()) {
        return;
      }

      if (videoEl.currentTime !== lastVideoTime && videoEl.readyState >= 2) {
        lastVideoTime = videoEl.currentTime;

        // Sync canvas size with video feed
        if (canvasEl.width !== videoEl.videoWidth || canvasEl.height !== videoEl.videoHeight) {
          canvasEl.width = videoEl.videoWidth || 640;
          canvasEl.height = videoEl.videoHeight || 480;
        }

        const startTimeMs = performance.now();
        const results = this.faceLandmarker.detectForVideo(videoEl, startTimeMs);

        if (ctx) {
          ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
          this.drawAestheticOverlay(ctx, canvasEl, results);
        }

        this.evaluateChallenge(results, videoEl);
      }

      if (!this.livenessPassed()) {
        this.animFrameId = requestAnimationFrame(processLoop);
      }
    };

    this.animFrameId = requestAnimationFrame(processLoop);
  }

  /**
   * Generate a randomized challenge sequence
   */
  private generateChallengeQueue(): void {
    // Stage 1 is always face alignment
    const initialChallenge: LivenessChallenge = {
      type: 'ALIGN_FACE',
      title: 'Center Your Face',
      instruction: 'Fit your face inside the oval guide and hold steady',
      icon: '🎯'
    };

    // Stage 2 is randomized: Blink, Turn Head, or Smile
    const dynamicOptions: LivenessChallenge[] = [
      {
        type: 'BLINK',
        title: 'Blink Naturally',
        instruction: 'Close both eyes and open them naturally',
        icon: '👀'
      },
      {
        type: 'TURN_RIGHT',
        title: 'Turn Head Slowly Right',
        instruction: 'Turn your head slightly to your right side',
        icon: '➡️'
      },
      {
        type: 'TURN_LEFT',
        title: 'Turn Head Slowly Left',
        instruction: 'Turn your head slightly to your left side',
        icon: '⬅️'
      },
      {
        type: 'SMILE',
        title: 'Smile Gently',
        instruction: 'Give a gentle smile towards the camera',
        icon: '😊'
      }
    ];

    // Pick 1 dynamic challenge at random
    const randomIndex = Math.floor(Math.random() * dynamicOptions.length);
    const chosenDynamic = dynamicOptions[randomIndex];

    this.challengeQueue = [initialChallenge, chosenDynamic];
    this.totalSteps.set(this.challengeQueue.length);
    this.currentStepIndex.set(0);
  }

  private advanceToNextChallenge(): boolean {
    if (this.challengeQueue.length === 0) {
      return false;
    }

    const next = this.challengeQueue.shift()!;
    this.currentChallenge.set(next);
    this.currentStepIndex.update(idx => idx + 1);
    this.challengeProgress.set(0);
    this.feedbackMessage.set(next.instruction);

    // Reset counters
    this.consecutiveBlinkFrames = 0;
    this.hadEyeClosed = false;
    this.consecutiveTurnFrames = 0;
    this.consecutiveSmileFrames = 0;
    this.consecutiveAlignedFrames = 0;

    return true;
  }

  /**
   * Evaluate user actions against the current challenge
   */
  private evaluateChallenge(results: any, videoEl: HTMLVideoElement): void {
    const landmarks = results.faceLandmarks?.[0];
    const blendshapes = results.faceBlendshapes?.[0]?.categories || [];

    if (!landmarks || landmarks.length === 0) {
      this.faceDetected.set(false);
      this.faceAligned.set(false);
      this.feedbackMessage.set('No face detected. Please face the camera.');
      return;
    }

    this.faceDetected.set(true);
    const challenge = this.currentChallenge();
    if (!challenge) return;

    // Check face alignment metrics (Bounding position & scale)
    const nose = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const chin = landmarks[152];
    const forehead = landmarks[10];

    const faceWidth = Math.abs(rightCheek.x - leftCheek.x);
    const faceHeight = Math.abs(chin.y - forehead.y);
    const faceCenterX = (leftCheek.x + rightCheek.x) / 2;
    const faceCenterY = (chin.y + forehead.y) / 2;

    const isCentered = Math.abs(faceCenterX - 0.5) < 0.18 && Math.abs(faceCenterY - 0.5) < 0.20;
    const isGoodDistance = faceWidth > 0.22 && faceWidth < 0.65;

    // Challenge 1: Face Alignment
    if (challenge.type === 'ALIGN_FACE') {
      if (isCentered && isGoodDistance) {
        this.faceAligned.set(true);
        this.consecutiveAlignedFrames++;
        const pct = Math.min(100, Math.round((this.consecutiveAlignedFrames / 18) * 100));
        this.challengeProgress.set(pct);
        this.feedbackMessage.set('Face locked. Hold steady...');

        if (this.consecutiveAlignedFrames >= 18) {
          if (!this.advanceToNextChallenge()) {
            this.finalizeLiveness(videoEl);
          }
        }
      } else {
        this.faceAligned.set(false);
        this.consecutiveAlignedFrames = Math.max(0, this.consecutiveAlignedFrames - 1);
        this.challengeProgress.set(0);
        if (!isGoodDistance) {
          this.feedbackMessage.set(faceWidth <= 0.22 ? 'Move slightly closer' : 'Step slightly back');
        } else {
          this.feedbackMessage.set('Center your face in the oval');
        }
      }
      return;
    }

    // Blendshape helpers
    const getShapeScore = (name: string): number => {
      const match = blendshapes.find((b: any) => b.categoryName === name);
      return match ? match.score : 0;
    };

    // Challenge 2: Blink
    if (challenge.type === 'BLINK') {
      const blinkLeft = getShapeScore('eyeBlinkLeft');
      const blinkRight = getShapeScore('eyeBlinkRight');
      const isBlinking = blinkLeft > 0.38 && blinkRight > 0.38;

      if (isBlinking) {
        this.hadEyeClosed = true;
        this.challengeProgress.set(50);
        this.feedbackMessage.set('Blink detected! Open eyes...');
      } else if (this.hadEyeClosed && blinkLeft < 0.25 && blinkRight < 0.25) {
        // Eyes opened after blink
        this.consecutiveBlinkFrames++;
        this.challengeProgress.set(100);
        this.feedbackMessage.set('✓ Blink verified! Human liveness confirmed.');

        if (this.consecutiveBlinkFrames >= 4) {
          if (!this.advanceToNextChallenge()) {
            this.finalizeLiveness(videoEl);
          }
        }
      }
      return;
    }

    // Challenge 3: Turn Right
    if (challenge.type === 'TURN_RIGHT') {
      // Relative nose position between left & right cheeks
      const totalWidth = rightCheek.x - leftCheek.x;
      const noseRatio = totalWidth > 0 ? (nose.x - leftCheek.x) / totalWidth : 0.5;

      // When turning head to user's right (camera's left/right depending on mirror)
      const isTurned = noseRatio > 0.65 || noseRatio < 0.35;
      if (isTurned) {
        this.consecutiveTurnFrames++;
        const pct = Math.min(100, Math.round((this.consecutiveTurnFrames / 12) * 100));
        this.challengeProgress.set(pct);
        this.feedbackMessage.set('Motion recognized! Hold steady...');

        if (this.consecutiveTurnFrames >= 12) {
          if (!this.advanceToNextChallenge()) {
            this.finalizeLiveness(videoEl);
          }
        }
      } else {
        this.consecutiveTurnFrames = Math.max(0, this.consecutiveTurnFrames - 1);
        this.feedbackMessage.set(challenge.instruction);
      }
      return;
    }

    // Challenge 4: Turn Left
    if (challenge.type === 'TURN_LEFT') {
      const totalWidth = rightCheek.x - leftCheek.x;
      const noseRatio = totalWidth > 0 ? (nose.x - leftCheek.x) / totalWidth : 0.5;

      const isTurned = noseRatio < 0.35 || noseRatio > 0.65;
      if (isTurned) {
        this.consecutiveTurnFrames++;
        const pct = Math.min(100, Math.round((this.consecutiveTurnFrames / 12) * 100));
        this.challengeProgress.set(pct);
        this.feedbackMessage.set('Motion recognized! Hold steady...');

        if (this.consecutiveTurnFrames >= 12) {
          if (!this.advanceToNextChallenge()) {
            this.finalizeLiveness(videoEl);
          }
        }
      } else {
        this.consecutiveTurnFrames = Math.max(0, this.consecutiveTurnFrames - 1);
        this.feedbackMessage.set(challenge.instruction);
      }
      return;
    }

    // Challenge 5: Smile
    if (challenge.type === 'SMILE') {
      const smileLeft = getShapeScore('mouthSmileLeft');
      const smileRight = getShapeScore('mouthSmileRight');
      const isSmiling = (smileLeft + smileRight) / 2 > 0.40;

      if (isSmiling) {
        this.consecutiveSmileFrames++;
        const pct = Math.min(100, Math.round((this.consecutiveSmileFrames / 10) * 100));
        this.challengeProgress.set(pct);
        this.feedbackMessage.set('Smile detected! Capturing biometric frame...');

        if (this.consecutiveSmileFrames >= 10) {
          if (!this.advanceToNextChallenge()) {
            this.finalizeLiveness(videoEl);
          }
        }
      } else {
        this.consecutiveSmileFrames = Math.max(0, this.consecutiveSmileFrames - 1);
        this.feedbackMessage.set(challenge.instruction);
      }
      return;
    }
  }

  /**
   * Finalize the liveness session, capture pristine frame, and notify subscriber
   */
  private finalizeLiveness(videoEl: HTMLVideoElement): void {
    this.livenessPassed.set(true);
    this.challengeProgress.set(100);
    this.feedbackMessage.set('3D Liveness Verified! Capturing biometric signature...');

    // High quality uncompressed snapshot
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = videoEl.videoWidth || 640;
    captureCanvas.height = videoEl.videoHeight || 480;
    const cCtx = captureCanvas.getContext('2d');
    if (cCtx) {
      cCtx.drawImage(videoEl, 0, 0, captureCanvas.width, captureCanvas.height);
      const dataUrl = captureCanvas.toDataURL('image/jpeg', 0.92);

      setTimeout(() => {
        if (this.onCompleteCallback) {
          this.onCompleteCallback(dataUrl);
        }
      }, 700);
    }

    this.stopLivenessSession();
  }

  /**
   * Draw high-precision institutional biometric HUD overlay on the canvas
   */
  private drawAestheticOverlay(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, results: any): void {
    const w = canvas.width;
    const h = canvas.height;
    const landmarks = results.faceLandmarks?.[0];

    const cx = w / 2;
    const cy = h / 2;
    const rx = w * 0.23;
    const ry = h * 0.35;

    const isAligned = this.faceAligned();
    const isPassed = this.livenessPassed();
    const progress = this.challengeProgress() / 100;
    const now = performance.now();

    ctx.save();

    // 1. Subtle Outer Focus Vignette (Directs focus to biometric target aperture)
    const vignette = ctx.createRadialGradient(cx, cy, Math.min(rx, ry) * 0.75, cx, cy, Math.max(w, h) * 0.7);
    vignette.addColorStop(0, 'rgba(3, 11, 28, 0)');
    vignette.addColorStop(0.6, 'rgba(3, 11, 28, 0.45)');
    vignette.addColorStop(1, 'rgba(3, 11, 28, 0.88)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    // 2. High-Tech Corner Reticle Brackets [ ] around the viewport perimeter
    const pad = 20;
    const cornerLen = 24;
    ctx.strokeStyle = isPassed ? '#10B981' : isAligned ? '#0EA5E9' : 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 2;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(pad, pad + cornerLen);
    ctx.lineTo(pad, pad);
    ctx.lineTo(pad + cornerLen, pad);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(w - pad - cornerLen, pad);
    ctx.lineTo(w - pad, pad);
    ctx.lineTo(w - pad, pad + cornerLen);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(pad, h - pad - cornerLen);
    ctx.lineTo(pad, h - pad);
    ctx.lineTo(pad + cornerLen, h - pad);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(w - pad - cornerLen, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.lineTo(w - pad, h - pad - cornerLen);
    ctx.stroke();

    // 3. Biometric Target Oval Guide Ring
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

    if (isPassed) {
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#10B981';
      ctx.shadowBlur = 14;
    } else if (isAligned) {
      ctx.strokeStyle = '#0EA5E9';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#0EA5E9';
      ctx.shadowBlur = 10;
    } else {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 8]);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.setLineDash([]);

    // 4. Smooth Challenge Progress Arc hugging the oval aperture
    if (progress > 0 && !isPassed) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#10B981';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 5. Dynamic Biometric Laser Sweep Line
    if (!isPassed) {
      const scanPeriod = 2400; // ms per sweep cycle
      const scanPhase = (now % scanPeriod) / scanPeriod;
      const scanY = cy - ry * 0.85 + (Math.sin(scanPhase * Math.PI * 2) * 0.5 + 0.5) * (ry * 1.7);

      const scanGradient = ctx.createLinearGradient(cx - rx * 0.8, scanY, cx + rx * 0.8, scanY);
      scanGradient.addColorStop(0, 'rgba(14, 165, 233, 0)');
      scanGradient.addColorStop(0.5, isAligned ? 'rgba(16, 185, 129, 0.7)' : 'rgba(14, 165, 233, 0.5)');
      scanGradient.addColorStop(1, 'rgba(14, 165, 233, 0)');

      ctx.beginPath();
      ctx.moveTo(cx - rx * 0.8, scanY);
      ctx.lineTo(cx + rx * 0.8, scanY);
      ctx.strokeStyle = scanGradient;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 6. Neural Constellation Face Mesh & Key Topological Vectors
    if (landmarks && landmarks.length > 0) {
      const primaryColor = isPassed ? '#10B981' : isAligned ? '#0EA5E9' : '#38BDF8';

      // Key landmark chains
      const noseBridge = [168, 6, 197, 195, 5, 4, 1, 2];
      const leftEye = [33, 160, 158, 133, 153, 144, 33];
      const rightEye = [362, 385, 387, 263, 373, 380, 362];
      const lips = [61, 39, 0, 269, 291, 405, 17, 181, 61];
      const jaw = [234, 136, 150, 149, 176, 152, 377, 400, 378, 365, 454];

      const drawChain = (indices: number[], alpha: number) => {
        ctx.beginPath();
        let started = false;
        for (const idx of indices) {
          const pt = landmarks[idx];
          if (!pt) continue;
          if (!started) {
            ctx.moveTo(pt.x * w, pt.y * h);
            started = true;
          } else {
            ctx.lineTo(pt.x * w, pt.y * h);
          }
        }
        ctx.strokeStyle = isPassed 
          ? `rgba(16, 185, 129, ${alpha})` 
          : `rgba(14, 165, 233, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      };

      drawChain(noseBridge, 0.4);
      drawChain(leftEye, 0.45);
      drawChain(rightEye, 0.45);
      drawChain(lips, 0.35);
      drawChain(jaw, 0.3);

      // Key Nodal Nodes
      const highlightNodes = [1, 10, 33, 133, 152, 234, 263, 362, 454, 61, 291];
      for (const idx of highlightNodes) {
        const pt = landmarks[idx];
        if (pt) {
          ctx.beginPath();
          ctx.arc(pt.x * w, pt.y * h, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = primaryColor;
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  stopLivenessSession(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  resetState(): void {
    this.stopLivenessSession();
    this.livenessPassed.set(false);
    this.faceDetected.set(false);
    this.faceAligned.set(false);
    this.currentChallenge.set(null);
    this.currentStepIndex.set(0);
    this.challengeProgress.set(0);
    this.livenessError.set(null);
    this.consecutiveBlinkFrames = 0;
    this.hadEyeClosed = false;
    this.consecutiveTurnFrames = 0;
    this.consecutiveSmileFrames = 0;
    this.consecutiveAlignedFrames = 0;
  }
}
