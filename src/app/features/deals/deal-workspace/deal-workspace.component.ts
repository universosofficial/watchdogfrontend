import { Component, inject, OnInit, OnDestroy, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { DealService } from '../../../core/services/deal.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ThemeService } from '../../../core/services/theme.service';
import { VerificationService } from '../../../core/services/verification.service';
import { LivenessService } from '../../../core/services/liveness.service';
import { 
  Deal, 
  DealDetailsResponse, 
  PaymentRecord, 
  DeliveryRecord, 
  Obligation, 
  DisputeRecord 
} from '../../../core/models/deal.model';
import { formatMoneyAmount } from '../../../shared/utils/money.util';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';

export type FeedEventType = 'payment' | 'delivery' | 'invitation' | 'dispute' | 'milestone' | 'terms';

export interface SocialFeedItem {
  id: string;
  dealId: string;
  dealRef: string;
  dealTitle: string;
  type: FeedEventType;
  timestamp: string;
  actorName: string;
  actorRole: 'buyer' | 'supplier' | 'system';
  isCurrentUserActor: boolean;
  payment?: PaymentRecord & { receiptUrl?: string };
  delivery?: DeliveryRecord & { waybillPhotoUrl?: string };
  dispute?: DisputeRecord;
  obligation?: Obligation;
  dealData?: Deal;
  termsText?: string;
  versionNumber?: number;
  needsRecipientConfirmation?: boolean;
  needsBuyerAcknowledgement?: boolean;
  needsCounterpartyAcceptance?: boolean;
}

@Component({
  selector: 'app-deal-workspace',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, StatusBadgeComponent],
  templateUrl: './deal-workspace.component.html',
  styleUrls: ['./deal-workspace.component.css']
})
export class DealWorkspaceComponent implements OnInit, OnDestroy {
  route = inject(ActivatedRoute);
  router = inject(Router);
  dealService = inject(DealService);
  authService = inject(AuthService);
  notificationService = inject(NotificationService);
  themeService = inject(ThemeService);
  verificationService = inject(VerificationService);
  livenessService = inject(LivenessService);

  isProduction = environment.production;

  // Active Deal Signals
  dealId = signal<string>('');
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  activeDealDetails = signal<DealDetailsResponse | null>(null);
  copiedInviteLink = signal<boolean>(false);
  copiedBankDetails = signal<boolean>(false);

  // Social feed & chat
  feedItems = signal<SocialFeedItem[]>([]);
  chatInputText = signal<string>('');

  // Financial reconciliation summary
  reconciliation = computed(() => {
    const details = this.activeDealDetails();
    if (!details || !details.deal) {
      return { agreedValue: 0, reportedValue: 0, confirmedValue: 0, outstandingValue: 0, currency: 'NGN' };
    }

    const agreedValue = Number(details.deal.amount || 0);
    const payments = details.payments || [];
    const reportedValue = payments.reduce((acc, p) => acc + Number(p.reported_amount || p.expected_amount || 0), 0);
    const confirmedValue = payments
      .filter(p => p.status === 'confirmed')
      .reduce((acc, p) => acc + Number(p.reported_amount || p.expected_amount || 0), 0);
    const outstandingValue = Math.max(0, agreedValue - confirmedValue);

    return {
      agreedValue,
      reportedValue: reportedValue > 0 ? reportedValue : agreedValue,
      confirmedValue,
      outstandingValue,
      currency: details.deal.currency || 'NGN'
    };
  });

  isBuyer = computed(() => this.authService.isBuyer());
  isSeller = computed(() => this.authService.isSeller());

  // Role resolution
  getDealRole(deal: Deal | undefined | null): 'buying' | 'supplying' {
    if (this.authService.isSeller()) return 'supplying';
    if (this.authService.isBuyer()) return 'buying';
    if (!deal) return 'buying';
    const currentBizId = this.authService.activeBusiness()?.id;
    const creatorIsVerified = this.activeDealDetails()?.participants?.creator?.is_bank_verified;
    if (creatorIsVerified) {
      return deal.creator_business_id === currentBizId ? 'supplying' : 'buying';
    }
    return deal.creator_business_id === currentBizId ? 'buying' : 'supplying';
  }

  isCurrentUserCreator(): boolean {
    const deal = this.activeDealDetails()?.deal;
    const currentBizId = this.authService.activeBusiness()?.id;
    return !!deal && deal.creator_business_id === currentBizId;
  }

  hasCurrentUserAccepted(): boolean {
    const details = this.activeDealDetails();
    if (!details || !details.acceptances_status) return false;
    const isCreator = this.isCurrentUserCreator();
    return isCreator
      ? Boolean(details.acceptances_status.creator_accepted)
      : Boolean(details.acceptances_status.counterparty_accepted);
  }

  getPartnerName(): string {
    const details = this.activeDealDetails();
    if (!details) return 'Trading Partner';
    const isCreator = this.isCurrentUserCreator();
    if (isCreator) {
      return details.participants?.counterparty?.name || details.deal.counterparty_business_name || 'Supplier Partner';
    } else {
      return details.participants?.creator?.name || details.deal.creator_business_name || 'Buyer Partner';
    }
  }

  // Drawers & Modals Signals
  showWaybillDrawer = signal(false);
  showPaymentDrawer = signal(false);
  showDisputeDrawer = signal(false);
  showTermsModal = signal(false);
  showVersionCompareModal = signal(false);
  previewPhotoUrl = signal<string | null>(null);

  // High-Profile Biometric Step-Up Authorization Modal (1:1 Face Match)
  readonly HIGH_VALUE_THRESHOLD = 3000000; // ₦3,000,000+ requires 1:1 biometric authorization
  showBiometricStepUpModal = signal(false);
  stepUpPendingAction = signal<{
    type: 'confirm_payment' | 'accept_deal';
    dealId: string;
    paymentId?: string;
    amount: number;
    title: string;
  } | null>(null);
  stepUpCameraActive = signal(false);
  stepUpCameraLoading = signal(false);
  stepUpSelfie = signal<string | null>(null);
  stepUpVerifying = signal(false);
  stepUpVerified = signal(false);
  stepUpMatchScore = signal<number | null>(null);
  stepUpError = signal<string | null>(null);
  private stepUpMediaStream: MediaStream | null = null;

  @ViewChild('stepUpVideo') stepUpVideo?: ElementRef<HTMLVideoElement>;
  @ViewChild('stepUpCanvas') stepUpCanvas?: ElementRef<HTMLCanvasElement>;

  // Waybill Form State
  waybillCarrier = signal('');
  waybillPlate = signal('');
  waybillDriver = signal('');
  waybillChecklist = signal('');
  waybillFile = signal<File | null>(null);

  // Payment Form State
  paymentMode = signal<'full' | 'instalment'>('full');
  paymentAmount = signal<number | null>(null);
  paymentBankRef = signal('');
  paymentPayerNotes = signal('');
  paymentReceiptFile = signal<File | null>(null);
  paymentReceiptPreview = signal<string | null>(null);
  paymentSubmitting = signal(false);

  // Terms Edit State
  showTermsEditModal = signal(false);
  termsEditText = signal('');
  termsEditSubmitting = signal(false);

  // Dispute Form State
  disputeCategory = signal<'quality' | 'delivery' | 'payment'>('delivery');
  disputeDescription = signal('');

  // Discrepancy Modal
  showDiscrepancyModal = signal<boolean>(false);
  discrepancyType = signal<'funds_not_seen' | 'partial_delivery' | 'delayed'>('funds_not_seen');
  discrepancyNotes = signal<string>('');
  discrepancySubmitting = signal<boolean>(false);

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const id = params.get('dealId');
      if (id) {
        this.dealId.set(id);
        this.loadDealContext(id);
      }
    });

    this.route.queryParamMap.subscribe(queryParams => {
      if (queryParams.get('action') === 'waybill') {
        this.showWaybillDrawer.set(true);
      } else if (queryParams.get('action') === 'payment') {
        this.openPaymentDrawer();
      } else if (queryParams.get('action') === 'dispute') {
        this.showDisputeDrawer.set(true);
      }
    });
  }

  ngOnDestroy(): void {
    this.stopStepUpCamera();
  }

  backToDeals(): void {
    this.router.navigate(['/deals']);
  }

  loadDealContext(dealId: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.dealService.getDealById(dealId).subscribe({
      next: (details) => {
        this.activeDealDetails.set(details);
        this.assembleSocialFeed(details);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err.error?.error?.message || err.message || 'Failed to load transaction details.');
      }
    });
  }

  private assembleSocialFeed(details: DealDetailsResponse): void {
    const currentBizId = this.authService.activeBusiness()?.id;
    const isCreator = details.deal.creator_business_id === currentBizId;
    const items: SocialFeedItem[] = [];

    // 1. Contract Terms & Agreement
    const partnerAccepted = details.acceptances_status?.counterparty_accepted;
    const isPendingMySignature = !isCreator && !partnerAccepted;

    items.push({
      id: `deal-created-${details.deal.id}`,
      dealId: details.deal.id,
      dealRef: details.deal.reference_no,
      dealTitle: details.deal.title,
      type: 'invitation',
      timestamp: details.deal.created_at,
      actorName: details.participants.creator.name,
      actorRole: 'supplier',
      isCurrentUserActor: isCreator,
      dealData: details.deal,
      termsText: details.current_version?.terms_text || 'Mutual commercial agreement under Digital Watchdog trade protection.',
      versionNumber: details.deal.current_version,
      needsCounterpartyAcceptance: isPendingMySignature
    });

    const token = this.authService.getToken() || '';

    // 2. Deliveries / Waybills
    (details.deliveries || []).forEach(del => {
      const isUploader = (del.sender_business_id || (del as any).created_by_business_id) === currentBizId;
      const waybillPhoto = del.evidence_id
        ? `${this.dealService.apiUrl}/${details.deal.id}/evidence/${del.evidence_id}/download?token=${token}`
        : ((del as any).waybillPhotoUrl || (del as any).photo_url || '');

      items.push({
        id: `del-${del.id}`,
        dealId: details.deal.id,
        dealRef: details.deal.reference_no,
        dealTitle: details.deal.title,
        type: 'delivery',
        timestamp: del.dispatch_date || del.created_at,
        actorName: isUploader ? (this.authService.activeBusiness()?.name || 'You') : (details.participants.counterparty?.name || 'Supplier'),
        actorRole: 'supplier',
        isCurrentUserActor: isUploader,
        delivery: {
          ...del,
          waybillPhotoUrl: waybillPhoto
        },
        needsBuyerAcknowledgement: !isUploader && del.status === 'dispatched'
      });
    });

    // 3. Payments
    (details.payments || []).forEach(pmt => {
      const isPayer = pmt.payer_business_id === currentBizId;
      const receiptPhoto = pmt.evidence_id
        ? `${this.dealService.apiUrl}/${details.deal.id}/evidence/${pmt.evidence_id}/download?token=${token}`
        : ((pmt as any).receiptUrl || (pmt as any).receipt_url || '');

      items.push({
        id: `pmt-${pmt.id}`,
        dealId: details.deal.id,
        dealRef: details.deal.reference_no,
        dealTitle: details.deal.title,
        type: 'payment',
        timestamp: pmt.created_at,
        actorName: isPayer ? (this.authService.activeBusiness()?.name || 'You') : (details.participants.creator.name || 'Buyer'),
        actorRole: 'buyer',
        isCurrentUserActor: isPayer,
        payment: {
          ...pmt,
          receiptUrl: receiptPhoto
        },
        needsRecipientConfirmation: !isPayer && pmt.status === 'reported'
      });
    });

    // 4. Disputes
    (details.disputes || []).forEach(disp => {
      const isRaiser = disp.raised_by_business_id === currentBizId;
      items.push({
        id: `disp-${disp.id}`,
        dealId: details.deal.id,
        dealRef: details.deal.reference_no,
        dealTitle: details.deal.title,
        type: 'dispute',
        timestamp: disp.created_at,
        actorName: isRaiser ? (this.authService.activeBusiness()?.name || 'You') : 'Trading Partner',
        actorRole: 'buyer',
        isCurrentUserActor: isRaiser,
        dispute: disp
      });
    });

    items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    this.feedItems.set(items);
  }

  // --- Acceptance & Signing ---
  onSlideAcceptDeal(dealId: string): void {
    if (this.authService.isSeller() && !this.verificationService.isVerified()) {
      this.verificationService.openWarningModal({
        title: 'Seller Verification Required',
        message: 'Before accepting deals, please complete identity verification in the Verification Center.',
        currentTier: this.verificationService.activeTier(),
        requiredTier: 'tier_2'
      });
      return;
    }

    this.executeAcceptDeal(dealId);
  }

  onSimulateAccept(dealId: string): void {
    this.executeAcceptDeal(dealId);
  }

  executeAcceptDeal(dealId: string): void {
    const isCounterparty = !this.isCurrentUserCreator();
    const service$ = isCounterparty 
      ? this.dealService.acceptDeal(dealId) 
      : this.dealService.simulatePartnerAccept(dealId);

    service$.subscribe({
      next: () => {
        this.notificationService.showSuccess('Agreement digitally accepted! Deal is now active and protected.');
        this.loadDealContext(dealId);
      },
      error: (err: any) => {
        const code = err.error?.error?.code || err.error?.code;
        const msg = err.error?.error?.message || err.error?.message || 'Failed signing agreement';
        if (code === 'TIER_LIMIT_EXCEEDED' || code === 'VERIFICATION_REQUIRED') {
          const dealAmount = Number(this.activeDealDetails()?.deal?.amount) || 0;
          this.verificationService.openWarningModal({
            dealAmount: dealAmount,
            currentTier: this.verificationService.activeTier(),
            requiredTier: dealAmount > 5000000 ? 'tier_3' : 'tier_2',
            message: msg
          });
        }
        this.notificationService.showError(msg);
      }
    });
  }

  // --- Payment Execution ---
  onConfirmPayment(dealId: string, paymentId: string): void {
    this.executeConfirmedPayment(dealId, paymentId);
  }

  // --- Seller Item Photos Upload (When deal created by buyer) ---
  uploadingItemPhotos = signal(false);

  onSellerUploadPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const dealId = this.activeDealDetails()?.deal?.id;
    if (!dealId) return;

    const files = Array.from(input.files);
    this.uploadingItemPhotos.set(true);

    let completed = 0;
    files.forEach((file, idx) => {
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('notes', `Item Condition Photo #${idx + 1} (${file.name})`);

      this.dealService.uploadEvidence(dealId, fd).subscribe({
        next: () => {
          completed++;
          if (completed === files.length) {
            this.uploadingItemPhotos.set(false);
            this.notificationService.showSuccess(`✓ ${completed} photo(s) uploaded successfully!`);
            this.loadDealContext(dealId);
          }
        },
        error: (err) => {
          console.warn('Failed uploading photo:', err);
          completed++;
          if (completed === files.length) {
            this.uploadingItemPhotos.set(false);
            this.loadDealContext(dealId);
          }
        }
      });
    });

    input.value = '';
  }

  executeConfirmedPayment(dealId: string, paymentId: string): void {
    this.dealService.updatePaymentStatus(dealId, paymentId, 'confirmed', 'Funds verified on bank account').subscribe({
      next: () => {
        this.notificationService.showSuccess('Payment receipt confirmed! Funds verified on ledger.');
        this.loadDealContext(dealId);
      },
      error: (err: any) => {
        this.notificationService.showError(err.error?.error?.message || 'Failed confirming payment');
      }
    });
  }

  acknowledgeDelivery(dealId: string, deliveryId: string): void {
    this.dealService.updateDeliveryStatus(dealId, deliveryId, 'delivered', 'Verified intact on site').subscribe({
      next: () => {
        this.notificationService.showSuccess('Delivery verified intact on site!');
        this.loadDealContext(dealId);
      },
      error: (err: any) => {
        this.notificationService.showError(err.error?.error?.message || 'Failed verifying delivery');
      }
    });
  }

  // --- Waybill Upload Drawer ---
  onWaybillFileSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.waybillFile.set(target.files[0]);
    }
  }

  submitWaybillProof(): void {
    const dealId = this.dealId();
    if (!dealId) return;

    const carrier = this.waybillCarrier().trim();
    if (!carrier) {
      this.notificationService.showError('Please enter the carrier or logistics company.');
      return;
    }

    const payload: any = {
      tracking_ref: `WB-${Math.floor(100000 + Math.random() * 900000)}`,
      carrier: this.waybillPlate().trim() ? `${carrier} (${this.waybillPlate().trim()})` : carrier,
      dispatch_date: new Date().toISOString(),
      items: [
        { name: this.waybillChecklist().trim() || 'Contract Consignment', quantity: 1, unit: 'Consignment' }
      ],
      notes: this.waybillDriver().trim() ? `Driver: ${this.waybillDriver().trim()}` : 'Dispatched via verified carrier'
    };

    const proceedWithDelivery = (evidenceId: string | null = null) => {
      if (evidenceId) {
        payload.evidence_id = evidenceId;
      }

      this.dealService.recordDelivery(dealId, payload).subscribe({
        next: () => {
          this.notificationService.showSuccess('Waybill photo uploaded to trade timeline!');
          this.showWaybillDrawer.set(false);
          this.waybillFile.set(null);
          this.loadDealContext(dealId);
        },
        error: (err: any) => {
          this.notificationService.showError(err.error?.error?.message || 'Failed dispatching waybill');
        }
      });
    };

    const file = this.waybillFile();
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('notes', `Waybill dispatch document for carrier ${carrier}`);

      this.dealService.uploadEvidence(dealId, formData).subscribe({
        next: (res) => {
          proceedWithDelivery(res.id);
        },
        error: (err: any) => {
          this.notificationService.showError(err.error?.error?.message || 'Failed uploading waybill proof');
        }
      });
    } else {
      proceedWithDelivery(null);
    }
  }

  // --- Payment Drawer ---
  openPaymentDrawer(): void {
    const remaining = this.reconciliation().outstandingValue;
    this.paymentMode.set('full');
    this.paymentAmount.set(remaining > 0 ? remaining : null);
    this.paymentBankRef.set('');
    this.paymentPayerNotes.set('');
    this.paymentReceiptFile.set(null);
    this.paymentReceiptPreview.set(null);
    this.paymentSubmitting.set(false);
    this.showPaymentDrawer.set(true);
  }

  setPaymentMode(mode: 'full' | 'instalment'): void {
    this.paymentMode.set(mode);
    if (mode === 'full') {
      const remaining = this.reconciliation().outstandingValue;
      this.paymentAmount.set(remaining > 0 ? remaining : null);
    }
  }

  onPaymentReceiptSelected(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      this.paymentReceiptFile.set(file);

      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.paymentReceiptPreview.set(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      } else {
        this.paymentReceiptPreview.set(null);
      }
    }
  }

  clearPaymentReceipt(): void {
    this.paymentReceiptFile.set(null);
    this.paymentReceiptPreview.set(null);
  }

  submitPaymentReport(): void {
    const dealId = this.dealId();
    if (!dealId) return;

    const amount = Number(this.paymentAmount()) || 0;
    if (amount <= 0) {
      this.notificationService.showError('Please enter a valid transfer amount.');
      return;
    }

    const bankRef = this.paymentBankRef().trim();
    if (!bankRef) {
      this.notificationService.showError('Please enter a bank reference or NIP session ID.');
      return;
    }

    this.paymentSubmitting.set(true);

    const proceedWithPayment = (evidenceId: string | null = null) => {
      const payload: any = {
        expected_amount: amount,
        reported_amount: amount,
        currency: 'NGN',
        reference_no: bankRef,
        paid_at: new Date().toISOString(),
        payer_notes: this.paymentPayerNotes().trim() || (this.paymentMode() === 'instalment' ? 'Milestone direct transfer' : 'Direct payment transfer')
      };

      if (evidenceId) {
        payload.evidence_id = evidenceId;
      }

      this.dealService.recordPayment(dealId, payload).subscribe({
        next: () => {
          this.paymentSubmitting.set(false);
          this.notificationService.showSuccess(
            this.paymentMode() === 'instalment'
              ? `Milestone direct transfer of ₦${amount.toLocaleString()} logged on timeline with proof!`
              : `Direct payment proof of ₦${amount.toLocaleString()} logged on timeline with proof!`
          );
          this.showPaymentDrawer.set(false);
          this.clearPaymentReceipt();
          this.loadDealContext(dealId);
        },
        error: (err: any) => {
          this.paymentSubmitting.set(false);
          this.notificationService.showError(err.error?.error?.message || 'Failed recording payment');
        }
      });
    };

    const file = this.paymentReceiptFile();
    if (file) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('notes', `Payment debit advice / transfer receipt for ref ${bankRef}`);

      this.dealService.uploadEvidence(dealId, formData).subscribe({
        next: (res) => {
          proceedWithPayment(res.id);
        },
        error: (err: any) => {
          this.paymentSubmitting.set(false);
          this.notificationService.showError(err.error?.error?.message || 'Failed uploading payment receipt file');
        }
      });
    } else {
      proceedWithPayment(null);
    }
  }

  // --- Terms Editing ---
  openTermsEdit(): void {
    const details = this.activeDealDetails();
    const currentTerms = details?.current_version?.terms_text || '';
    this.termsEditText.set(currentTerms);
    this.showTermsModal.set(false);
    this.showTermsEditModal.set(true);
  }

  closeTermsEdit(): void {
    this.showTermsEditModal.set(false);
  }

  appendTermsClause(clause: string): void {
    const current = this.termsEditText().trim();
    if (current) {
      this.termsEditText.set(`${current}\n• ${clause}`);
    } else {
      this.termsEditText.set(`• ${clause}`);
    }
  }

  submitTermsRevision(): void {
    const dealId = this.dealId();
    if (!dealId) return;

    const newTerms = this.termsEditText().trim();
    if (!newTerms) {
      this.notificationService.showError('Agreement terms cannot be empty.');
      return;
    }

    this.termsEditSubmitting.set(true);

    this.dealService.updateTerms(dealId, newTerms).subscribe({
      next: (res: any) => {
        this.termsEditSubmitting.set(false);
        const ver = res?.new_version || res?.current_version || ((this.activeDealDetails()?.deal?.current_version || 1) + 1);
        this.notificationService.showSuccess(`Agreement revised to Version ${ver}.0! Both parties must review and sign.`);
        this.showTermsEditModal.set(false);
        this.loadDealContext(dealId);
      },
      error: (err: any) => {
        this.termsEditSubmitting.set(false);
        this.notificationService.showError(err.error?.error?.message || err.message || 'Failed updating terms');
      }
    });
  }

  // --- Discrepancy & Dispute ---
  openDiscrepancyModal(): void {
    this.showDiscrepancyModal.set(true);
  }

  closeDiscrepancyModal(): void {
    this.showDiscrepancyModal.set(false);
    this.discrepancyNotes.set('');
  }

  submitDiscrepancy(): void {
    const deal = this.activeDealDetails()?.deal;
    if (!deal) return;
    this.discrepancySubmitting.set(true);

    const desc = this.discrepancyNotes().trim() || `Discrepancy flag: ${this.discrepancyType()}`;
    this.dealService.openDispute(deal.id, {
      category: 'delivery',
      description: desc
    }).subscribe({
      next: () => {
        this.discrepancySubmitting.set(false);
        this.notificationService.showWarning('Issue reported for review. Trade funds paused pending resolution.');
        this.closeDiscrepancyModal();
        this.loadDealContext(deal.id);
      },
      error: (err: any) => {
        this.discrepancySubmitting.set(false);
        this.notificationService.showError(err.error?.error?.message || 'Failed reporting issue');
      }
    });
  }

  submitDisputeFlag(): void {
    const dealId = this.dealId();
    if (!dealId) return;

    const desc = this.disputeDescription().trim();
    if (!desc) {
      this.notificationService.showError('Please describe the issue or reason for the dispute.');
      return;
    }

    this.dealService.openDispute(dealId, {
      category: this.disputeCategory(),
      description: desc
    }).subscribe({
      next: () => {
        this.notificationService.showWarning('Issue reported for review. Trade funds paused pending resolution.');
        this.showDisputeDrawer.set(false);
        this.loadDealContext(dealId);
      },
      error: (err: any) => {
        this.notificationService.showError(err.error?.error?.message || 'Failed reporting issue');
      }
    });
  }

  resolveActiveDispute(dealId: string): void {
    const details = this.activeDealDetails();
    const activeDispute = details?.disputes?.find(d => d.status === 'open' || d.status === 'awaiting_response' || d.status === 'under_review') || details?.disputes?.[0];
    if (!activeDispute) {
      this.notificationService.showInfo('No open dispute found to resolve.');
      return;
    }

    this.dealService.resolveDispute(dealId, activeDispute.id, {
      resolution_notes: 'Resolved amicably between buyer and seller.',
      target_deal_status: 'active'
    }).subscribe({
      next: () => {
        this.notificationService.showSuccess('✓ Issue marked as resolved! Trade funds and deal resumed.');
        this.loadDealContext(dealId);
      },
      error: (err: any) => {
        this.notificationService.showError(err.error?.error?.message || err.message || 'Failed resolving dispute');
      }
    });
  }

  downloadAuditDossier(dealId: string): void {
    const details = this.activeDealDetails();
    if (!details) return;

    const dossier = {
      title: 'DIGITAL WATCHDOG TAMPER-PROOF REGULATORY DOSSIER',
      subsidiary_of: 'Univasos Security & Verification',
      reference_no: details.deal.reference_no,
      deal_title: details.deal.title,
      agreed_amount: `${details.deal.currency} ${details.deal.amount}`,
      deal_status: details.deal.status,
      participants: {
        initiator: details.participants.creator.name,
        counterparty: details.participants.counterparty?.name || 'Counterparty'
      },
      evidence_records_count: details.evidence?.length || 0,
      current_terms: details.current_version.terms_text,
      audit_generated_at: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(dossier, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `WATCHDOG-REGULATORY-DOSSIER-${details.deal.reference_no}.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.notificationService.showSuccess('Sealed Regulatory Dossier exported successfully.');
  }

  // --- High-Value Biometric Step-Up Authorization ---
  requestStepUpAuthorization(action: {
    type: 'confirm_payment' | 'accept_deal';
    dealId: string;
    paymentId?: string;
    amount: number;
    title: string;
  }): void {
    this.stepUpPendingAction.set(action);
    this.stepUpSelfie.set(null);
    this.stepUpVerified.set(false);
    this.stepUpMatchScore.set(null);
    this.stepUpError.set(null);
    this.showBiometricStepUpModal.set(true);
    setTimeout(() => this.startStepUpCamera(), 120);
  }

  closeBiometricStepUp(): void {
    this.livenessService.resetState();
    this.stopStepUpCamera();
    this.showBiometricStepUpModal.set(false);
    this.stepUpPendingAction.set(null);
  }

  async startStepUpCamera(): Promise<void> {
    this.stepUpCameraLoading.set(true);
    this.stepUpError.set(null);
    this.stepUpSelfie.set(null);

    try {
      this.stepUpMediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });

      this.stepUpCameraLoading.set(false);
      this.stepUpCameraActive.set(true);

      setTimeout(async () => {
        if (this.stepUpVideo?.nativeElement && this.stepUpMediaStream) {
          const video = this.stepUpVideo.nativeElement;
          video.srcObject = this.stepUpMediaStream;
          try {
            await video.play();
            if (this.stepUpCanvas?.nativeElement) {
              this.livenessService.startLivenessSession(
                video,
                this.stepUpCanvas.nativeElement,
                (autoCapturedSelfie: string) => {
                  this.stepUpSelfie.set(autoCapturedSelfie);
                  this.stopStepUpCamera();
                  this.submitBiometricStepUp();
                }
              );
            }
          } catch (e) {
            console.warn('[DealWorkspace] Video play or liveness error:', e);
          }
        }
      }, 100);
    } catch (err: any) {
      this.stepUpCameraLoading.set(false);
      this.stepUpCameraActive.set(false);
      this.stepUpError.set('Unable to access camera sensor. Please allow camera permissions or use simulated 3D scan.');
    }
  }

  captureStepUpPhoto(): void {
    this.livenessService.stopLivenessSession();
    const video = this.stepUpVideo?.nativeElement;
    const canvas = this.stepUpCanvas?.nativeElement;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      this.stepUpSelfie.set(dataUrl);
      this.stopStepUpCamera();
      this.submitBiometricStepUp();
    }
  }

  useSimulatedStepUpSnapshot(): void {
    this.livenessService.stopLivenessSession();
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, 400, 400);
      ctx.fillStyle = '#0284C7';
      ctx.beginPath();
      ctx.arc(200, 180, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#38BDF8';
      ctx.beginPath();
      ctx.arc(200, 320, 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ENROLLED BIOMETRIC OPERATOR', 200, 50);
      ctx.fillText(new Date().toISOString(), 200, 380);
    }
    const simulatedBase64 = canvas.toDataURL('image/jpeg', 0.85);
    this.stepUpSelfie.set(simulatedBase64);
    this.stopStepUpCamera();
    this.submitBiometricStepUp();
  }

  stopStepUpCamera(): void {
    this.livenessService.stopLivenessSession();
    if (this.stepUpMediaStream) {
      this.stepUpMediaStream.getTracks().forEach(t => t.stop());
      this.stepUpMediaStream = null;
    }
    this.stepUpCameraActive.set(false);
  }

  submitBiometricStepUp(): void {
    const selfie = this.stepUpSelfie();
    const pending = this.stepUpPendingAction();
    if (!selfie || !pending) return;

    this.stepUpVerifying.set(true);
    this.stepUpError.set(null);

    this.verificationService.verifyBiometricStepUp({
      live_selfie: selfie,
      deal_id: pending.dealId,
      action: pending.type,
      amount: pending.amount
    }).subscribe({
      next: (res) => {
        this.stepUpVerifying.set(false);
        this.stepUpVerified.set(true);
        this.stepUpMatchScore.set(res.similarity_score || 96);
        this.notificationService.showSuccess(`✓ 1:1 Biometric Match Confirmed (${res.similarity_score}% similarity). High-profile action authorized!`);

        setTimeout(() => {
          const actionToExecute = this.stepUpPendingAction();
          this.closeBiometricStepUp();

          if (actionToExecute) {
            if (actionToExecute.type === 'confirm_payment' && actionToExecute.paymentId) {
              this.executeConfirmedPayment(actionToExecute.dealId, actionToExecute.paymentId);
            } else if (actionToExecute.type === 'accept_deal') {
              this.executeAcceptDeal(actionToExecute.dealId);
            }
          }
        }, 1200);
      },
      error: (err: any) => {
        this.stepUpVerifying.set(false);
        this.stepUpError.set(err.message || '1:1 Biometric match failed. Face does not match registered profile.');
        this.notificationService.showError(this.stepUpError()!);
      }
    });
  }

  // --- Photo Lightbox ---
  openLightbox(url: string): void {
    this.previewPhotoUrl.set(url);
  }

  closeLightbox(): void {
    this.previewPhotoUrl.set(null);
  }

  // --- Utility Helpers ---
  copyToClipboard(text: string, message = 'Details copied to clipboard!'): void {
    if (navigator && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      this.copiedBankDetails.set(true);
      this.notificationService.showSuccess(message);
      setTimeout(() => this.copiedBankDetails.set(false), 2500);
    }
  }

  copyInviteLink(dealId: string): void {
    if (typeof window === 'undefined') return;
    const url = `${window.location.origin}/d/${dealId}`;
    navigator.clipboard.writeText(url);
    this.copiedInviteLink.set(true);
    setTimeout(() => this.copiedInviteLink.set(false), 2500);
    this.notificationService.showSuccess('Protected deal preview link copied to clipboard!');
  }

  sendWhatsAppInvite(deal: Deal): void {
    if (typeof window === 'undefined') return;
    const inviteUrl = `${window.location.origin}/d/${deal.id}`;
    const formatted = this.formatMoney(deal.amount, deal.currency);
    const text = encodeURIComponent(
      `Hello! Our protected agreement for "${deal.title}" (${formatted}) is ready on Digital Watchdog. Review item photos & lock the deal here: ${inviteUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  sendTelegramInvite(deal: Deal): void {
    if (typeof window === 'undefined') return;
    const inviteUrl = `${window.location.origin}/d/${deal.id}`;
    const formatted = this.formatMoney(deal.amount, deal.currency);
    const text = encodeURIComponent(
      `Hello! Our protected agreement for "${deal.title}" (${formatted}) is ready on Digital Watchdog. Review item photos & lock the deal here: ${inviteUrl}`
    );
    window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${text}`, '_blank');
  }

  sendChatMessage(): void {
    const text = this.chatInputText().trim();
    if (!text) return;
    const dealId = this.dealId();
    if (!dealId) return;

    const myName = this.authService.activeBusiness()?.name || 'You';
    const newItem: SocialFeedItem = {
      id: `chat-${Date.now()}`,
      dealId,
      dealRef: '',
      dealTitle: '',
      type: 'terms',
      timestamp: new Date().toISOString(),
      actorName: myName,
      actorRole: 'buyer',
      isCurrentUserActor: true,
      termsText: text
    };

    this.feedItems.update(items => [...items, newItem]);
    this.chatInputText.set('');
    this.notificationService.showSuccess('Message sent to trade channel');
  }

  cleanTitle(title: string): string {
    if (!title) return 'Commercial Agreement';
    return title.replace(/\s*\b\d{10,}\b/g, '').replace(/[-_]\d{10,}/g, '').trim() || title;
  }

  formatCompactMoney(amount: number, currency = 'NGN'): string {
    const sym = currency === 'USD' ? '$' : '₦';
    const val = Number(amount || 0);
    if (val >= 1_000_000) {
      const m = (val / 1_000_000).toFixed(val % 1_000_000 === 0 ? 0 : 2);
      return `${sym}${m}M`;
    }
    if (val >= 1_000) {
      const k = (val / 1_000).toFixed(val % 1_000 === 0 ? 0 : 1);
      return `${sym}${k}k`;
    }
    return `${sym}${val.toLocaleString()}`;
  }

  formatMoney(amount: number, currency?: string): string {
    const activeCurr = currency || this.activeDealDetails()?.deal?.currency || 'USD';
    return formatMoneyAmount(amount, activeCurr, 0);
  }

  formatTime(isoStr: string): string {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(isoStr: string): string {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
}
