import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { DealService } from '../../../core/services/deal.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { VerificationService } from '../../../core/services/verification.service';

export interface PrePaymentPhoto {
  file: File;
  previewUrl: string;
  name: string;
}

@Component({
  selector: 'app-deal-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './deal-create.component.html',
  styleUrls: ['./deal-create.component.css']
})
export class DealCreateComponent implements OnInit {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private dealService = inject(DealService);
  authService = inject(AuthService);
  verificationService = inject(VerificationService);
  private router = inject(Router);
  private notificationService = inject(NotificationService);

  loading = signal(false);
  statusFeedback = signal<string>('Creating Protected Deal...');
  errorMessage = signal<string | null>(null);
  showAdvancedOptions = signal(false);
  showDetailedFlawsAndSerial = signal(false);
  selectedPreset = signal<'software' | 'procurement' | 'construction' | null>(null);
  selectedInspectionWindow = signal<'24h' | '48h' | '7d'>('48h');
  selectedArbitration = signal<'fast_track' | 'lca' | 'icc'>('fast_track');
  selectedTranche = signal<'single' | 'two_stage' | 'three_stage'>('three_stage');

  // Pre-Payment Condition & Photo Locking (Core USP)
  itemPhotos = signal<PrePaymentPhoto[]>([]);
  serialNumber = signal<string>('');
  disclosedFlaws = signal<string>('');
  selectedAccessories = signal<string[]>([]);
  availableAccessories = [
    'Original Packaging / Box',
    'Original Power Charger / Cable',
    'Official Purchase Receipt',
    'Manufacturer Warranty Slip',
    'Protective Sleeve / Cover',
    'Spare Keys / Components'
  ];

  // Dual Initiator Support: Seller initiating to Buyer, or Buyer initiating to Seller
  initiatorRole = signal<'seller' | 'buyer'>(this.authService.activePersona() || 'seller');

  currencies = [
    { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
    { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
    { code: 'ZAR', symbol: 'R', name: 'South African Rand' }
  ];

  dealForm: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    counterparty_phone: ['', [Validators.required, Validators.pattern(/^[0-9\+\s\-]{7,18}$/)]],
    invited_email: [''],
    amount: ['', [Validators.required, Validators.min(0.01)]],
    currency: [this.authService.currentUser()?.default_currency || 'NGN', [Validators.required]],
    expected_end_date: [''],
    terms_text: [
      `1. ITEM & CONDITION: Seller agrees to deliver the item or service exactly as described above.\n2. HANDOVER & PHOTOS: Seller uploads delivery or dispatch photos; Buyer inspects upon handover.\n3. ACCOUNTABILITY: Both parties must confirm completion. If either side breaks the agreement, Digital Watchdog steps in with the recorded evidence.`,
      [Validators.required]
    ]
  });

  get f() {
    return this.dealForm.controls;
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['partner']) {
        const partnerName = String(params['partner']).trim();
        this.dealForm.patchValue({
          title: `Deal with ${partnerName}`,
          description: `Protected trade agreement with ${partnerName}. Condition and photos locked before payment.`
        });
      }
    });
  }

  setInitiatorRole(role: 'seller' | 'buyer'): void {
    if (this.initiatorRole() === role) return;
    this.initiatorRole.set(role);

    if (this.authService.activePersona() !== role) {
      this.authService.switchPersona(role).subscribe({
        next: () => {},
        error: (e) => console.warn('Could not sync persona preference:', e)
      });
    }

    if (role === 'seller') {
      this.dealForm.patchValue({
        terms_text: `1. ITEM & CONDITION: Seller agrees to deliver the item or service exactly as described above.\n2. HANDOVER & PHOTOS: Seller uploads delivery or dispatch photos; Buyer inspects upon handover.\n3. ACCOUNTABILITY: Both parties must confirm completion. If either side breaks the agreement, Digital Watchdog steps in with the recorded evidence.`
      });
    } else {
      this.dealForm.patchValue({
        terms_text: `1. DELIVERABLES: Seller provides the agreed item or service matching the stated condition.\n2. PAYMENT & RECEIPT: Buyer pays via verified transfer and attaches payment confirmation.\n3. INSPECTION: Buyer inspects the item within the agreed inspection window before final sign-off.`
      });
    }
  }

  toggleAdvanced(): void {
    this.showAdvancedOptions.update(v => !v);
  }

  toggleDetailedFlaws(): void {
    this.showDetailedFlawsAndSerial.update(v => !v);
  }

  setInspectionWindow(val: '24h' | '48h' | '7d'): void {
    this.selectedInspectionWindow.set(val);
    const windowText = val === '24h' ? '24 hours' : val === '48h' ? '48 hours (standard)' : '7 calendar days';
    this.appendOrReplaceCovenant('INSPECTION WINDOW', `Buyer shall have a mandatory inspection window of ${windowText} upon delivery notification.`);
  }

  setArbitration(val: 'fast_track' | 'lca' | 'icc'): void {
    this.selectedArbitration.set(val);
    const tribunal = val === 'fast_track' 
      ? 'Digital Watchdog Expedited Mediation & Automated Smart Ledger Enforcement' 
      : val === 'lca' 
        ? 'Lagos Court of Arbitration (LCA Rules)' 
        : 'International Chamber of Commerce (ICC Rules)';
    this.appendOrReplaceCovenant('ARBITRATION VENUE', `Unresolved disputes shall be submitted exclusively to ${tribunal}.`);
  }

  setTranche(val: 'single' | 'two_stage' | 'three_stage'): void {
    this.selectedTranche.set(val);
    const schedule = val === 'single'
      ? '100% full settlement upon final verified delivery inspection.'
      : val === 'two_stage'
        ? '50% initial advance transfer; 50% upon verified delivery sign-off.'
        : '30% deposit; 40% intermediate verified milestone; 30% final sign-off.';
    this.appendOrReplaceCovenant('SETTLEMENT TRANCHES', schedule);
  }

  private appendOrReplaceCovenant(title: string, content: string): void {
    let current = this.dealForm.get('terms_text')?.value || '';
    const regex = new RegExp(`(?:\\[|\n|^)(${title}:.*?)(?:\n|$)`, 'i');
    const newEntry = `\n[${title}]: ${content}`;
    if (regex.test(current)) {
      current = current.replace(regex, `\n[${title}]: ${content}`);
    } else {
      current = current.trim() + newEntry;
    }
    this.dealForm.patchValue({ terms_text: current });
  }

  applyTemplate(type: 'software' | 'procurement' | 'construction'): void {
    this.selectedPreset.set(type);
    const isSeller = this.initiatorRole() === 'seller';

    if (type === 'software') {
      this.dealForm.patchValue({
        title: isSeller 
          ? 'Web Application & Design Handover' 
          : 'Freelance Website & App Milestone',
        description: isSeller
          ? 'Complete design and source-code delivery with 48-hour client review window.'
          : 'Delivery of agreed project milestones and source files with review sign-off.',
        amount: 1200,
        currency: 'USD',
        terms_text: `1. DELIVERABLES: Complete design files, working deployment, and source code handover.\n2. REVIEW WINDOW: Buyer has 48 hours to test and verify all features.\n3. SUPPORT: 14 days of bug-fix support included after handover.`
      });
    } else if (type === 'procurement') {
      this.dealForm.patchValue({
        title: isSeller
          ? 'iPhone 15 Pro 256GB (Unlocked, Factory Sealed)'
          : 'MacBook Pro 16" M3 Max (Mint Condition)',
        description: isSeller
          ? 'Factory unlocked, 94%+ battery health, original box and charging cable included.'
          : 'No screen scratches, original charger included, serial number verified before dispatch.',
        amount: 850,
        currency: 'USD',
        terms_text: `1. CONDITION CHECK: Seller uploads clear photos of serial number, screen condition, and packaging before dispatch.\n2. HANDOVER: Buyer inspects the item upon arrival to confirm it matches the photos.\n3. PROTECTION: Both sides sign off to complete the deal.`
      });
    } else {
      this.dealForm.patchValue({
        title: isSeller
          ? 'Commercial Inventory & Equipment Supply'
          : 'Wholesale Stock & Equipment Order',
        description: isSeller
          ? 'Batch supply of commercial equipment with dispatch manifest and delivery confirmation.'
          : 'Staged delivery of wholesale inventory with inspection sign-off on arrival.',
        amount: 4500,
        currency: 'USD',
        terms_text: `1. DISPATCH PROOF: Seller uploads packing list and dispatch photos before transit.\n2. INSPECTION: Buyer verifies quantity and condition within 48 hours of delivery.`
      });
    }
  }

  toggleAccessory(acc: string): void {
    this.selectedAccessories.update(list => {
      if (list.includes(acc)) {
        return list.filter(item => item !== acc);
      } else {
        return [...list, acc];
      }
    });
  }

  onPhotosSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const currentCount = this.itemPhotos().length;
    const remainingSlots = 8 - currentCount;
    if (remainingSlots <= 0) {
      this.notificationService.showError('Maximum 8 photos allowed per agreement baseline.');
      return;
    }

    const filesToAdd = Array.from(input.files).slice(0, remainingSlots);
    const newPhotos: PrePaymentPhoto[] = [];

    for (const file of filesToAdd) {
      if (!file.type.startsWith('image/')) {
        continue;
      }
      const previewUrl = URL.createObjectURL(file);
      newPhotos.push({
        file,
        previewUrl,
        name: file.name
      });
    }

    this.itemPhotos.update(existing => [...existing, ...newPhotos]);
    input.value = '';
  }

  removePhoto(index: number): void {
    this.itemPhotos.update(list => {
      const updated = [...list];
      const removed = updated.splice(index, 1);
      if (removed[0]?.previewUrl) {
        URL.revokeObjectURL(removed[0].previewUrl);
      }
      return updated;
    });
  }

  onSubmit(): void {
    const isSeller = this.initiatorRole() === 'seller';

    if (this.dealForm.invalid) {
      this.dealForm.markAllAsTouched();
      return;
    }

    const val = this.dealForm.value;
    const amount = Number(val.amount) || 0;

    // Enforce Tier Limit for Sellers: Tier 1 allows up to ₦500,000 without ID!
    if (isSeller) {
      const tier = this.verificationService.activeTier(); // 'tier_1', 'tier_2', 'tier_3'
      const limits: Record<string, number> = { tier_1: 500000, tier_2: 5000000, tier_3: Infinity };
      const max = limits[tier] ?? 500000;

      if (val.currency === 'NGN' && amount > max) {
        this.verificationService.openWarningModal({
          title: 'Contract Exceeds Tier Limit',
          message: `This deal value (₦${amount.toLocaleString()}) exceeds your current ${tier.toUpperCase()} limit (₦${max.toLocaleString()}). Anchor your settlement bank account or complete 3D facial verification to unlock higher contract limits.`,
          currentTier: tier,
          requiredTier: amount > 5000000 ? 'tier_3' : 'tier_2'
        });
        return;
      }
    }

    this.loading.set(true);
    this.statusFeedback.set('Registering deal on ledger...');
    this.errorMessage.set(null);

    // Build tamper-proof terms with locked condition details
    let finalTerms = val.terms_text.trim();
    const photosToUpload = this.itemPhotos();
    const serial = this.serialNumber().trim();
    const flaws = this.disclosedFlaws().trim();
    const accessories = this.selectedAccessories();

    if (serial) {
      finalTerms += `\n[VERIFIED SERIAL/IMEI/MODEL]: ${serial}`;
    }
    if (flaws) {
      finalTerms += `\n[DISCLOSED FLAWS / WEAR]: ${flaws}`;
    }
    if (accessories.length > 0) {
      finalTerms += `\n[INCLUDED ACCESSORIES]: ${accessories.join(', ')}`;
    }
    if (photosToUpload.length > 0) {
      finalTerms += `\n[PRE-PAYMENT EVIDENCE]: ${photosToUpload.length} item baseline photos sealed to contract ledger.`;
    }

    const payload = {
      title: val.title.trim(),
      description: val.description ? val.description.trim() : null,
      counterparty_phone: val.counterparty_phone.trim(),
      invited_phone: val.counterparty_phone.trim(),
      invited_email: val.invited_email ? val.invited_email.trim() : undefined,
      amount: Number(val.amount),
      currency: val.currency.toUpperCase(),
      expected_delivery_date: val.expected_end_date || undefined,
      terms_text: finalTerms,
      creator_role: this.initiatorRole()
    };

    this.dealService.createDeal(payload).subscribe({
      next: (created) => {
        const recipient = isSeller ? 'Buyer' : 'Seller';

        if (photosToUpload.length === 0) {
          this.loading.set(false);
          this.notificationService.showSuccess(`Deal created successfully & dispatched to ${recipient}! Ref: ${created.reference_no}`);
          this.router.navigate(['/deals', created.id]);
          return;
        }

        this.statusFeedback.set(`Sealing ${photosToUpload.length} baseline photos to evidence ledger...`);

        // Upload baseline photos sequentially/in-parallel to evidence ledger
        const uploadObservables = photosToUpload.map((p, idx) => {
          const fd = new FormData();
          fd.append('file', p.file, p.name);
          fd.append('notes', `Pre-Payment Baseline Proof #${idx + 1} (${p.name})`);
          return this.dealService.uploadEvidence(created.id, fd).pipe(
            catchError(err => {
              console.warn(`Failed uploading evidence photo ${p.name}:`, err);
              return of(null);
            })
          );
        });

        forkJoin(uploadObservables).subscribe({
          next: () => {
            this.loading.set(false);
            this.notificationService.showSuccess(
              `Deal created with ${photosToUpload.length} locked photos & dispatched to ${recipient}! Ref: ${created.reference_no}`
            );
            this.router.navigate(['/deals', created.id]);
          },
          error: () => {
            this.loading.set(false);
            this.router.navigate(['/deals', created.id]);
          }
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.error?.error?.message || 
          err.error?.message || 
          'Failed to create transaction agreement. Please verify details.'
        );
      }
    });
  }
}
