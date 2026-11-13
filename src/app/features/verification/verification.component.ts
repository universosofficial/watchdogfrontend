import { Component, inject, signal, computed, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { VerificationService } from '../../core/services/verification.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { LivenessService } from '../../core/services/liveness.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-verification',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './verification.component.html',
  styleUrls: ['./verification.component.css']
})
export class VerificationComponent implements OnInit, OnDestroy {
  readonly isProduction = environment.production;

  verificationService = inject(VerificationService);
  authService = inject(AuthService);
  livenessService = inject(LivenessService);
  private notificationService = inject(NotificationService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  private querySub?: Subscription;

  // Active Tab: 1 = Biometric Face Verification, 2 = Bank Settlement Anchor
  currentStep = computed(() => this.verificationService.activeStep());

  // WebRTC Biometric Liveness State
  @ViewChild('videoElement') videoElement?: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasElement') canvasElement?: ElementRef<HTMLCanvasElement>;

  mediaStream: MediaStream | null = null;
  cameraActive = signal<boolean>(false);
  cameraLoading = signal<boolean>(false);
  cameraError = signal<string | null>(null);
  capturedSelfieBase64 = signal<string | null>(null);
  livenessRunning = signal<boolean>(false);
  livenessPassed = signal<boolean>(false);
  livenessScore = signal<number | null>(null);
  isRescanning = signal<boolean>(false);

  isBiometricVerified = computed(() => {
    return this.verificationService.isBiometricVerified() || this.livenessPassed();
  });

  // Bank Identity Anchor (NUBAN) State
  supportedBanks = signal<Array<{ name: string; code: string; slug?: string }>>([]);
  banksLoading = signal<boolean>(false);
  selectedBankCode = signal<string>('');
  bankSearchQuery = signal<string>('');
  isBankMenuOpen = signal<boolean>(false);
  bankAccountNumber = signal<string>('');
  bankVerifying = signal<boolean>(false);
  bankVerificationError = signal<string | null>(null);
  resolvedNamePreview = signal<string | null>(null);
  resolvingName = signal<boolean>(false);
  isEditingBank = signal<boolean>(false);

  selectedBankName = computed(() => {
    const code = this.selectedBankCode();
    if (!code) return '';
    const match = this.supportedBanks().find(b => b.code === code);
    return match ? match.name : '';
  });

  startEditingBank(): void {
    this.isEditingBank.set(true);
    const curr = this.anchoredBankDetails();
    if (curr) {
      this.selectedBankCode.set(curr.bankCode);
      this.bankAccountNumber.set(curr.accountNumber);
      this.resolvedNamePreview.set(curr.accountName);
    }
  }

  cancelEditingBank(): void {
    this.isEditingBank.set(false);
    this.bankVerificationError.set(null);
    this.isBankMenuOpen.set(false);
  }

  // Filtered banks for assisted smart search
  filteredSupportedBanks = computed(() => {
    const query = this.bankSearchQuery().toLowerCase().trim();
    const banks = this.supportedBanks();
    if (!query) return banks;
    return banks.filter(b => b.name.toLowerCase().includes(query) || b.code.includes(query));
  });

  toggleBankMenu(): void {
    this.isBankMenuOpen.update(v => !v);
  }

  openBankMenu(): void {
    this.isBankMenuOpen.set(true);
  }

  closeBankMenu(): void {
    setTimeout(() => {
      this.isBankMenuOpen.set(false);
    }, 250);
  }

  selectBank(bank: { name: string; code: string }): void {
    this.selectedBankCode.set(bank.code);
    this.bankSearchQuery.set('');
    this.isBankMenuOpen.set(false);
    this.onBankOrAccountChange();
  }

  quickPickBank(code: string): void {
    this.selectedBankCode.set(code);
    this.bankSearchQuery.set('');
    this.isBankMenuOpen.set(false);
    this.onBankOrAccountChange();
  }

  clearBankSelection(): void {
    this.selectedBankCode.set('');
    this.bankSearchQuery.set('');
    this.resolvedNamePreview.set(null);
    this.bankVerificationError.set(null);
  }

  isBankVerified = computed(() => {
    return this.verificationService.isBankVerified();
  });

  anchoredBankDetails = computed(() => {
    const s = this.verificationService.status();
    const biz = s?.business || this.authService.activeBusiness();
    if (!biz?.is_bank_verified) return null;
    return {
      bankName: biz.bank_name || 'Commercial Bank',
      bankCode: biz.bank_code || '',
      accountNumber: biz.verified_account_number || '',
      accountName: biz.verified_account_name || '',
      verifiedAt: biz.bank_verified_at
    };
  });

  // Status Signals
  status = computed(() => this.verificationService.status());
  activeTier = computed(() => this.verificationService.activeTier());
  trustRadar = computed(() => this.authService.trustRadar());
  isDualVerified = computed(() => this.verificationService.isCompleteDualVerified());

  ngOnInit(): void {
    this.verificationService.fetchStatus().subscribe();
    this.loadTrustRadar();
    this.loadBanks();

    this.querySub = this.route.queryParams.subscribe(params => {
      if (params['step']) {
        const stepNum = parseInt(params['step'], 10);
        if ([1, 2].includes(stepNum)) {
          this.setStep(stepNum);
        }
      }
    });
  }

  ngOnDestroy(): void {
    if (this.querySub) this.querySub.unsubscribe();
    this.stopCamera();
  }

  loadTrustRadar(): void {
    this.verificationService.getTrustRadar().subscribe({
      next: (data) => {
        if (data) {
          this.authService.trustRadar.set(data);
        }
      },
      error: () => {}
    });
  }

  setStep(step: number): void {
    if (step !== 1) {
      this.stopCamera();
    }
    this.verificationService.activeStep.set(step);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step },
      queryParamsHandling: 'merge'
    });
  }

  // --- Form 1: Biometric Face Verification ---

  onInitiateRescan(): void {
    this.isRescanning.set(true);
    this.capturedSelfieBase64.set(null);
    this.livenessPassed.set(false);
    this.startCamera();
  }

  cancelRescan(): void {
    this.stopCamera();
    this.isRescanning.set(false);
    this.capturedSelfieBase64.set(null);
  }

  async startCamera(): Promise<void> {
    this.cameraError.set(null);
    this.cameraLoading.set(true);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('WebRTC camera is not supported in this browser environment.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        },
        audio: false
      });

      this.mediaStream = stream;
      this.cameraActive.set(true);
      this.cameraLoading.set(false);

      setTimeout(async () => {
        if (this.videoElement?.nativeElement) {
          const video = this.videoElement.nativeElement;
          video.srcObject = stream;
          try {
            await video.play();
            if (this.canvasElement?.nativeElement) {
              this.livenessService.startLivenessSession(
                video,
                this.canvasElement.nativeElement,
                (dataUrl: string) => {
                  this.capturedSelfieBase64.set(dataUrl);
                  this.stopCamera();
                  this.notificationService.showSuccess('3D Liveness Verified! Auto-initiating facial analysis...');
                  this.runBiometricLiveness();
                }
              );
            }
          } catch (err: any) {
            console.warn('[Camera Play Warning]:', err.message);
          }
        }
      }, 100);
    } catch (err: any) {
      this.cameraLoading.set(false);
      this.cameraActive.set(false);
      const msg = err.name === 'NotAllowedError' 
        ? 'Camera permission denied. Please allow camera access in your browser settings.'
        : (err.message || 'Unable to access web camera.');
      this.cameraError.set(msg);
      this.notificationService.showWarning(msg);
    }
  }

  stopCamera(): void {
    this.livenessService.stopLivenessSession();
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.cameraActive.set(false);
    this.cameraLoading.set(false);
  }

  capturePhoto(): void {
    this.livenessService.stopLivenessSession();
    if (!this.videoElement || !this.canvasElement) return;

    const video = this.videoElement.nativeElement;
    const canvas = this.canvasElement.nativeElement;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Rescale down to 640 max width to ensure snappy transmission and low memory
    let targetWidth = video.videoWidth || 640;
    let targetHeight = video.videoHeight || 480;
    const maxWidth = 640;
    if (targetWidth > maxWidth) {
      const ratio = maxWidth / targetWidth;
      targetWidth = maxWidth;
      targetHeight = Math.round(targetHeight * ratio);
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;

    context.drawImage(video, 0, 0, targetWidth, targetHeight);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    this.capturedSelfieBase64.set(dataUrl);
    this.stopCamera();
    this.notificationService.showSuccess('Facial frame captured! Ready for 3D liveness analysis.');
  }

  retakePhoto(): void {
    this.capturedSelfieBase64.set(null);
    this.livenessPassed.set(false);
    this.startCamera();
  }

  useSimulatedSnapshot(): void {
    this.livenessService.stopLivenessSession();
    // Deterministic lightweight dummy image for testing / development
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, 320, 240);
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(160, 120, 60, 0, Math.PI * 2);
      ctx.fill();
    }
    const mockDataUrl = canvas.toDataURL('image/jpeg', 0.8);
    this.capturedSelfieBase64.set(mockDataUrl);
    this.notificationService.showInfo('Using simulated 3D test snapshot.');
  }

  runBiometricLiveness(): void {
    const selfie = this.capturedSelfieBase64();
    if (!selfie) {
      this.notificationService.showError('Please capture your facial snapshot first.');
      return;
    }

    this.livenessRunning.set(true);
    this.verificationService.verifyBiometricLiveness({
      selfie_image: selfie
    }).subscribe({
      next: (res) => {
        this.livenessRunning.set(false);
        this.livenessPassed.set(true);
        this.isRescanning.set(false);
        this.livenessScore.set(res.liveness_score || 97);
        this.notificationService.showSuccess('✓ 3D Facial Liveness Verified! Anchor 1 Secured.');
        this.loadTrustRadar();
        this.authService.getMe().subscribe({ error: () => {} });
        this.verificationService.fetchStatus().subscribe({ error: () => {} });

        // Auto-navigate to step 2 after brief celebration if bank is not yet verified
        setTimeout(() => {
          if (this.currentStep() === 1 && !this.isBankVerified()) {
            this.setStep(2);
          }
        }, 1800);
      },
      error: (err) => {
        this.livenessRunning.set(false);
        this.notificationService.showError(err.error?.error?.message || err.message || 'Biometric liveness check failed. Please retry.');
      }
    });
  }

  // --- Form 2: Bank Settlement Anchor (NUBAN) ---

  loadBanks(): void {
    this.banksLoading.set(true);
    this.verificationService.getSupportedBanks().subscribe({
      next: (banks) => {
        this.supportedBanks.set(banks);
        this.banksLoading.set(false);
      },
      error: () => {
        this.banksLoading.set(false);
      }
    });
  }

  onBankOrAccountChange(): void {
    const rawAccount = this.bankAccountNumber().replace(/\D/g, '').trim();
    if (rawAccount !== this.bankAccountNumber()) {
      this.bankAccountNumber.set(rawAccount);
    }
    const bankCode = this.selectedBankCode();
    this.bankVerificationError.set(null);

    if (rawAccount.length === 10 && bankCode) {
      this.resolvingName.set(true);
      this.verificationService.resolveBankAccount(rawAccount, bankCode).subscribe({
        next: (res) => {
          this.resolvingName.set(false);
          this.resolvedNamePreview.set(res.account_name);
        },
        error: (err) => {
          this.resolvingName.set(false);
          this.resolvedNamePreview.set(null);
          this.bankVerificationError.set(err.error?.error?.message || 'Unable to resolve account beneficiary.');
        }
      });
    } else {
      this.resolvedNamePreview.set(null);
    }
  }

  fillTestAccount(): void {
    if (!this.selectedBankCode()) {
      this.selectedBankCode.set('058'); // GTBank
    }
    this.bankAccountNumber.set('0123456789');
    this.onBankOrAccountChange();
  }

  submitBankAnchor(): void {
    const accountNumber = this.bankAccountNumber().trim();
    const bankCode = this.selectedBankCode();
    const bank = this.supportedBanks().find(b => b.code === bankCode);
    const bankName = bank ? bank.name : '';

    if (accountNumber.length !== 10) {
      this.notificationService.showError('NUBAN Account Number must be exactly 10 digits.');
      return;
    }

    this.bankVerifying.set(true);
    this.bankVerificationError.set(null);

    this.verificationService.anchorBankAccount({
      accountNumber,
      bankCode,
      bankName
    }).subscribe({
      next: (res) => {
        this.bankVerifying.set(false);
        this.isEditingBank.set(false);
        this.notificationService.showSuccess(res.message || 'Legal identity confirmed via bank verification!');
        this.loadTrustRadar();
      },
      error: (err) => {
        this.bankVerifying.set(false);
        const errorMsg = err.error?.error?.message || err.message || 'Bank account verification failed';
        this.bankVerificationError.set(errorMsg);
        this.notificationService.showError(errorMsg);
      }
    });
  }
}
