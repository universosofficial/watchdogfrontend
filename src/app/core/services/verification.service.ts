import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, map, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import {
  VerificationStatus,
  VerificationTier,
  BiometricVerificationResult,
  BankAnchorResult
} from '../models/verification.model';
import { NotificationService } from './notification.service';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class VerificationService {
  private http = inject(HttpClient);
  private notificationService = inject(NotificationService);
  private authService = inject(AuthService);
  private router = inject(Router);

  private apiUrl = `${environment.apiUrl}/verification`;

  // Reactive state signals
  readonly status = signal<VerificationStatus | null>(null);
  readonly loading = signal<boolean>(false);
  readonly drawerOpen = signal<boolean>(false);
  // 1 = Biometric Face Verification, 2 = Bank Settlement Anchor
  readonly activeStep = signal<number>(1);

  // Inline Warning Modal for Tier Threshold Exceeded
  readonly warningModalOpen = signal<boolean>(false);
  readonly warningModalContext = signal<{
    title: string;
    message: string;
    currentTier: VerificationTier;
    requiredTier: VerificationTier;
    dealAmount?: number;
  } | null>(null);

  // Computed helper signals
  readonly activeTier = computed<VerificationTier>(() => {
    return this.status()?.active_tier || 'tier_1';
  });

  readonly accountType = computed<'individual' | 'corporate'>(() => {
    return this.status()?.account_type || this.authService.currentUser()?.account_type || 'corporate';
  });

  readonly isIndividual = computed(() => this.accountType() === 'individual');
  readonly isCorporate = computed(() => this.accountType() === 'corporate');

  readonly isBiometricVerified = computed<boolean>(() => {
    const s = this.status();
    if (s?.user?.is_biometric_verified !== undefined) {
      return Boolean(s.user.is_biometric_verified || s.business?.is_biometric_verified);
    }
    const user = this.authService.currentUser();
    const biz = this.authService.activeBusiness();
    return Boolean(user?.is_biometric_verified || biz?.is_biometric_verified);
  });

  readonly isBankVerified = computed<boolean>(() => {
    const s = this.status();
    if (s?.business?.is_bank_verified !== undefined) {
      return Boolean(s.business.is_bank_verified);
    }
    const biz = this.authService.activeBusiness();
    return Boolean(biz?.is_bank_verified);
  });

  readonly isVerified = computed<boolean>(() => {
    return this.isBankVerified() || this.isBiometricVerified();
  });

  readonly isCompleteDualVerified = computed<boolean>(() => {
    return this.isBankVerified() && this.isBiometricVerified();
  });

  readonly verificationChecklist = computed(() => {
    const phone = Boolean(this.status()?.user?.phone_verified || this.authService.currentUser()?.phone_verified);
    const bio = this.isBiometricVerified();
    const bank = this.isBankVerified();
    const complete = bio && bank;

    let reqStep = 1;
    if (!bio) reqStep = 1;
    else if (!bank) reqStep = 2;

    return {
      account_type: this.status()?.account_type || 'individual',
      phone_verified: phone,
      biometric_verified: bio,
      bank_verified: bank,
      is_complete: complete,
      required_step: reqStep
    };
  });

  readonly isTier1 = computed(() => this.activeTier() === 'tier_1');
  readonly isTier2 = computed(() => this.activeTier() === 'tier_2');
  readonly isTier3 = computed(() => this.activeTier() === 'tier_3');

  readonly tierShieldBadge = computed(() => {
    const tier = this.activeTier();
    const dual = this.isCompleteDualVerified();
    const single = this.isVerified();

    if (dual || tier === 'tier_3') {
      return {
        label: 'TIER 3: DUAL-ANCHOR VERIFIED ✓',
        shortLabel: 'Dual-Anchor Verified ✓',
        themeClass: 'tier-badge-tier3',
        icon: '🛡️',
        unlocked: true,
        limitText: 'Unlimited Ceiling'
      };
    }
    if (single || tier === 'tier_2') {
      return {
        label: this.isBankVerified() ? 'TIER 2: BANK ANCHORED ✓' : 'TIER 2: BIOMETRIC VERIFIED ✓',
        shortLabel: 'Anchored ✓',
        themeClass: 'tier-badge-tier2',
        icon: '🏦',
        unlocked: true,
        limitText: 'Up to ₦5,000,000'
      };
    }
    // Tier 1 (Unverified)
    return {
      label: 'TIER 1: UNVERIFIED SELLER',
      shortLabel: 'Action Restricted',
      themeClass: 'tier-badge-tier1',
      icon: '⚠️',
      unlocked: false,
      limitText: 'Verification Required'
    };
  });

  constructor() {
    // If user is logged in, automatically sync their verification status
    if (this.authService.token()) {
      this.fetchStatus().subscribe({ error: () => {} });
    }
  }

  /**
   * Fetch current dual-anchor status, verified bank details, and transaction limits
   */
  fetchStatus(): Observable<VerificationStatus> {
    this.loading.set(true);
    return this.http.get<ApiResponse<VerificationStatus>>(`${this.apiUrl}/status`).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Failed to fetch verification status');
        }
        return res.data;
      }),
      tap(data => {
        this.status.set(data);
        this.loading.set(false);
      }),
      catchError(err => {
        this.loading.set(false);
        return throwError(() => err);
      })
    );
  }

  /**
   * Navigate to the Verification Center Component
   */
  openDrawer(step?: number) {
    if (step) {
      this.activeStep.set(step);
    } else {
      const checklist = this.verificationChecklist();
      this.activeStep.set(checklist.required_step || 1);
    }
    this.drawerOpen.set(false);
    this.router.navigate(['/verification'], { queryParams: { step: this.activeStep() } });
  }

  goToVerification(step?: number) {
    this.openDrawer(step);
  }

  closeDrawer() {
    this.drawerOpen.set(false);
  }

  /**
   * Warning Modal Controls
   */
  openWarningModal(context: {
    title?: string;
    message?: string;
    currentTier?: VerificationTier;
    requiredTier?: VerificationTier;
    dealAmount?: number;
  }) {
    const curTier = context.currentTier || this.activeTier();
    const reqTier = context.requiredTier || (context.dealAmount && context.dealAmount > 5000000 ? 'tier_3' : 'tier_2');

    this.warningModalContext.set({
      title: context.title || 'Transaction Clearance Required',
      message:
        context.message ||
        `This deal amount exceeds your current clearance tier. Anchor your settlement bank account or complete 3D facial verification to unlock higher deal volumes.`,
      currentTier: curTier,
      requiredTier: reqTier,
      dealAmount: context.dealAmount
    });
    this.warningModalOpen.set(true);
  }

  closeWarningModal() {
    this.warningModalOpen.set(false);
    this.warningModalContext.set(null);
  }

  upgradeFromModal() {
    const ctx = this.warningModalContext();
    this.closeWarningModal();
    const targetStep = !this.isBiometricVerified() ? 1 : 2;
    this.openDrawer(targetStep);
  }

  /**
   * 3D Biometric Facial Liveness Verification
   */
  verifyBiometricLiveness(payload: {
    selfie_image: string;
    id_photo?: string;
  }): Observable<BiometricVerificationResult> {
    return this.http.post<ApiResponse<BiometricVerificationResult>>(`${this.apiUrl}/biometric/liveness`, payload).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Biometric liveness verification failed');
        }
        return res.data;
      }),
      tap(data => {
        if (data.trust_radar) {
          this.authService.trustRadar.set(data.trust_radar);
        }
        this.fetchStatus().subscribe();
      })
    );
  }

  /**
   * Backward-compatible alias for biometric verification
   */
  verifyDojahLiveness(payload: {
    selfie_image: string;
    id_photo?: string;
  }): Observable<BiometricVerificationResult> {
    return this.verifyBiometricLiveness(payload);
  }

  /**
   * High-Profile Deal Biometric Step-Up Authorization (1:1 Face Match)
   * Matches live selfie against enrolled user's baseline face template
   */
  verifyBiometricStepUp(payload: {
    live_selfie: string;
    deal_id?: string;
    action?: string;
    amount?: number;
  }): Observable<{
    success: boolean;
    authorized: boolean;
    auth_id: string;
    reference: string;
    similarity_score: number;
    liveness_score: number;
    user_name: string;
    timestamp: string;
  }> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/biometric/step-up`, payload).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Biometric step-up authorization failed');
        }
        return res.data;
      })
    );
  }

  /**
   * Query Trust Radar badge and risk score
   */
  getTrustRadar(businessId?: string): Observable<any> {
    const url = businessId ? `${this.apiUrl}/trust-radar/${businessId}` : `${this.apiUrl}/trust-radar`;
    return this.http.get<ApiResponse<any>>(url).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Failed fetching trust score');
        }
        return res.data;
      })
    );
  }

  /**
   * Fetch list of supported Nigerian commercial banks & fintech institutions
   */
  getSupportedBanks(): Observable<Array<{ name: string; code: string; slug?: string }>> {
    return this.http.get<ApiResponse<{ banks: Array<{ name: string; code: string; slug?: string }> }>>(`${this.apiUrl}/banks`).pipe(
      map(res => {
        if (!res.success || !res.data?.banks) {
          throw new Error(res.error?.message || 'Failed to fetch supported banks');
        }
        return res.data.banks;
      })
    );
  }

  /**
   * Resolves NUBAN account number against CBN/NIBSS directory
   */
  resolveBankAccount(accountNumber: string, bankCode: string): Observable<{
    account_number: string;
    account_name: string;
    bank_code: string;
    bank_name: string;
  }> {
    return this.http.post<ApiResponse<{
      account_number: string;
      account_name: string;
      bank_code: string;
      bank_name: string;
    }>>(`${this.apiUrl}/bank/resolve`, {
      account_number: accountNumber,
      bank_code: bankCode
    }).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Failed to resolve bank account');
        }
        return res.data;
      })
    );
  }

  /**
   * Anchors and locks verified bank account to current seller profile
   */
  anchorBankAccount(payload: {
    accountNumber: string;
    bankCode: string;
    bankName: string;
  }): Observable<BankAnchorResult> {
    return this.http.post<ApiResponse<BankAnchorResult>>(`${this.apiUrl}/bank`, {
      account_number: payload.accountNumber,
      bank_code: payload.bankCode,
      bank_name: payload.bankName
    }).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Failed to anchor bank account');
        }
        return res.data;
      }),
      tap(data => {
        const activeBiz = this.authService.activeBusiness();
        if (activeBiz && data.bank_anchor) {
          const updatedBiz = {
            ...activeBiz,
            bank_name: data.bank_anchor.bank_name,
            bank_code: data.bank_anchor.bank_code,
            verified_account_number: data.bank_anchor.verified_account_number,
            verified_account_name: data.bank_anchor.verified_account_name,
            is_bank_verified: true,
            trust_status: 'safe' as const
          };
          this.authService.activeBusiness.set(updatedBiz);
        }
        this.fetchStatus().subscribe();
      })
    );
  }
}
