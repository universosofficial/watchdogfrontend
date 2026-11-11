import { Component, inject, signal, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ThemeService } from '../../../core/services/theme.service';

interface CountryOption {
  code: string;
  dialCode: string;
  name: string;
  flag: string;
  currency: string;
}

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private notificationService = inject(NotificationService);
  themeService = inject(ThemeService);

  countries: CountryOption[] = [
    { code: 'NG', dialCode: '+234', name: 'Nigeria', flag: '🇳🇬', currency: 'NGN' },
    { code: 'US', dialCode: '+1', name: 'United States', flag: '🇺🇸', currency: 'USD' },
    { code: 'GB', dialCode: '+44', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP' },
    { code: 'GH', dialCode: '+233', name: 'Ghana', flag: '🇬🇭', currency: 'GHS' },
    { code: 'KE', dialCode: '+254', name: 'Kenya', flag: '🇰🇪', currency: 'KES' },
    { code: 'ZA', dialCode: '+27', name: 'South Africa', flag: '🇿🇦', currency: 'ZAR' }
  ];

  selectedCountry = signal<CountryOption>(this.countries[0]);
  registrationStep = signal<1 | 2>(1); // 1 = Details, 2 = SMS OTP
  activePersona = signal<'buyer' | 'seller'>('buyer');
  accountType = signal<'individual' | 'corporate'>('individual');
  showPassword = signal(false);

  loading = signal(false);
  errorMessage = signal<string | null>(null);
  countdown = signal(600); // 10 minutes
  private timerInterval: any = null;

  formattedPhone = signal('');

  // Terms & Privacy Policy Interactive Modal
  showLegalModal = signal(false);
  legalModalTab = signal<'terms' | 'privacy'>('terms');

  step1Form: FormGroup = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(2)]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9\s\-]{7,15}$/)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    business_name: [''],
    terms_accepted: [false, [Validators.requiredTrue]]
  });

  otpForm: FormGroup = this.fb.group({
    otp: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]]
  });

  get f1() {
    return this.step1Form.controls;
  }

  get fOtp() {
    return this.otpForm.controls;
  }

  ngOnDestroy(): void {
    this.clearCountdown();
  }

  setCountry(country: CountryOption): void {
    this.selectedCountry.set(country);
  }

  setPersona(persona: 'buyer' | 'seller'): void {
    this.activePersona.set(persona);
  }

  setAccountType(type: 'individual' | 'corporate'): void {
    this.accountType.set(type);
    const bizCtrl = this.step1Form.get('business_name');
    if (type === 'corporate') {
      bizCtrl?.setValidators([Validators.required, Validators.minLength(2)]);
    } else {
      bizCtrl?.clearValidators();
    }
    bizCtrl?.updateValueAndValidity();
  }

  toggleShowPassword(): void {
    this.showPassword.update(v => !v);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  openLegalModal(tab: 'terms' | 'privacy', event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.legalModalTab.set(tab);
    this.showLegalModal.set(true);
  }

  setLegalTab(tab: 'terms' | 'privacy'): void {
    this.legalModalTab.set(tab);
  }

  closeLegalModal(): void {
    this.showLegalModal.set(false);
  }

  acceptLegalAndClose(): void {
    this.step1Form.patchValue({ terms_accepted: true });
    this.showLegalModal.set(false);
  }

  getFullPhoneNumber(rawPhone: string): string {
    const cleaned = rawPhone.replace(/[\s\-]/g, '');
    const dial = this.selectedCountry().dialCode;
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('0')) return `${dial}${cleaned.substring(1)}`;
    return `${dial}${cleaned}`;
  }

  onStep1Submit(): void {
    if (this.step1Form.invalid) {
      this.step1Form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    const fullPhone = this.getFullPhoneNumber(this.step1Form.value.phone);
    this.formattedPhone.set(fullPhone);

    this.authService.requestOtp(fullPhone, 'registration').subscribe({
      next: () => {
        this.loading.set(false);
        this.registrationStep.set(2);
        this.otpForm.reset();
        this.startCountdown();
        this.notificationService.showSuccess(`Verification code sent to ${fullPhone}`);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.error?.message || err.error?.message || 'Failed to dispatch SMS verification code.');
      }
    });
  }

  onOtpSubmit(): void {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    const step1Val = this.step1Form.value;
    const otp = this.otpForm.value.otp.trim();
    const isInd = this.accountType() === 'individual';
    const country = this.selectedCountry();

    const payload = {
      phone: this.formattedPhone(),
      otp,
      full_name: step1Val.full_name.trim(),
      password: step1Val.password,
      country_code: country.code,
      default_currency: country.currency,
      active_persona: this.activePersona(),
      account_type: this.accountType(),
      terms_accepted: !!step1Val.terms_accepted,
      business_name: isInd
        ? (step1Val.business_name?.trim() || `${step1Val.full_name.trim()} (Trading)`)
        : step1Val.business_name?.trim()
    };

    this.authService.registerPhone(payload).subscribe({
      next: () => {
        this.loading.set(false);
        this.clearCountdown();
        this.notificationService.showSuccess(
          'Account created successfully! Welcome to Digital Watchdog.'
        );
        const returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.error?.message || err.error?.message || 'Invalid code. Please re-check the 6 digits.');
      }
    });
  }

  resendCode(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.authService.requestOtp(this.formattedPhone(), 'registration').subscribe({
      next: () => {
        this.loading.set(false);
        this.otpForm.reset();
        this.startCountdown();
        this.notificationService.showSuccess(`New code sent to ${this.formattedPhone()}`);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(err.error?.error?.message || err.error?.message || 'Failed to resend code.');
      }
    });
  }

  backToStep1(): void {
    this.registrationStep.set(1);
    this.clearCountdown();
  }

  private startCountdown(): void {
    this.clearCountdown();
    this.countdown.set(600);
    this.timerInterval = setInterval(() => {
      const cur = this.countdown();
      if (cur <= 1) {
        this.clearCountdown();
        this.countdown.set(0);
      } else {
        this.countdown.set(cur - 1);
      }
    }, 1000);
  }

  private clearCountdown(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  get formattedCountdown(): string {
    const total = this.countdown();
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
}
