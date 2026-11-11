import { Component, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ThemeService } from '../../../core/services/theme.service';

interface CountryOption {
  code: string;
  dialCode: string;
  name: string;
  flag: string;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private notificationService = inject(NotificationService);
  themeService = inject(ThemeService);

  countries: CountryOption[] = [
    { code: 'NG', dialCode: '+234', name: 'Nigeria', flag: '🇳🇬' },
    { code: 'US', dialCode: '+1', name: 'United States', flag: '🇺🇸' },
    { code: 'GB', dialCode: '+44', name: 'United Kingdom', flag: '🇬🇧' },
    { code: 'GH', dialCode: '+233', name: 'Ghana', flag: '🇬🇭' },
    { code: 'KE', dialCode: '+254', name: 'Kenya', flag: '🇰🇪' },
    { code: 'ZA', dialCode: '+27', name: 'South Africa', flag: '🇿🇦' }
  ];

  selectedCountry = signal<CountryOption>(this.countries[0]);
  showPassword = signal(false);
  loading = signal(false);
  devToolsOpen = signal(false);
  errorMessage = signal<string | null>(null);
  returnUrl = signal<string | null>(null);

  toggleDevTools(): void {
    this.devToolsOpen.update(v => !v);
  }

  constructor() {
    const qUrl = this.route.snapshot.queryParams['returnUrl'];
    if (qUrl) {
      this.returnUrl.set(qUrl);
    }
  }

  // Forgot Password Modal State
  forgotModalOpen = signal(false);
  forgotStep = signal<'request' | 'reset'>('request');
  forgotLoading = signal(false);
  forgotError = signal<string | null>(null);
  forgotSuccess = signal<string | null>(null);
  forgotPhone = signal<string>('');

  loginForm: FormGroup = this.fb.group({
    phone: ['', [Validators.required, Validators.pattern(/^[0-9\s\-]{7,15}$/)]],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  forgotRequestForm: FormGroup = this.fb.group({
    phone: ['', [Validators.required, Validators.pattern(/^[0-9\s\-]{7,15}$/)]]
  });

  forgotResetForm: FormGroup = this.fb.group({
    otp: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
    new_password: ['', [Validators.required, Validators.minLength(8)]]
  });

  get f() {
    return this.loginForm.controls;
  }

  setCountry(country: CountryOption): void {
    this.selectedCountry.set(country);
  }

  fillDevAccount(role: 'buyer' | 'seller'): void {
    this.selectedCountry.set(this.countries[0]); // Nigeria +234
    if (role === 'buyer') {
      this.loginForm.patchValue({
        phone: '08012345678',
        password: 'Password123!'
      });
    } else {
      this.loginForm.patchValue({
        phone: '08098765432',
        password: 'Password123!'
      });
    }
  }

  toggleShowPassword(): void {
    this.showPassword.update(v => !v);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  getFullPhoneNumber(rawPhone: string): string {
    const cleaned = rawPhone.replace(/[\s\-]/g, '');
    const dial = this.selectedCountry().dialCode;
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('0')) return `${dial}${cleaned.substring(1)}`;
    return `${dial}${cleaned}`;
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);

    const { phone, password } = this.loginForm.value;
    const fullPhone = this.getFullPhoneNumber(phone);

    this.authService.loginPhone({ phone: fullPhone, password }).subscribe({
      next: (session) => {
        this.loading.set(false);
        this.notificationService.showSuccess(`Welcome back, ${session.user.full_name}!`);
        const rawReturn = this.route.snapshot.queryParams['returnUrl'];
        const returnUrl = (rawReturn && rawReturn !== '/') ? rawReturn : '/dashboard';
        this.router.navigateByUrl(returnUrl);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(
          err.error?.error?.message || 
          err.error?.message || 
          'Incorrect phone number or password. Please verify and try again.'
        );
      }
    });
  }

  // --- Password Recovery Modal Actions ---
  openForgotModal(): void {
    this.forgotError.set(null);
    this.forgotSuccess.set(null);
    this.forgotStep.set('request');
    const curPhone = this.loginForm.get('phone')?.value;
    if (curPhone) {
      this.forgotRequestForm.patchValue({ phone: curPhone });
    }
    this.forgotModalOpen.set(true);
  }

  closeForgotModal(): void {
    this.forgotModalOpen.set(false);
    this.forgotStep.set('request');
    this.forgotError.set(null);
    this.forgotSuccess.set(null);
  }

  onForgotRequestOtp(): void {
    if (this.forgotRequestForm.invalid) {
      this.forgotRequestForm.markAllAsTouched();
      return;
    }

    this.forgotLoading.set(true);
    this.forgotError.set(null);

    const raw = this.forgotRequestForm.value.phone;
    const full = this.getFullPhoneNumber(raw);
    this.forgotPhone.set(full);

    this.authService.forgotPasswordRequestOtp(full).subscribe({
      next: () => {
        this.forgotLoading.set(false);
        this.forgotStep.set('reset');
        this.forgotResetForm.get('otp')?.reset();
        this.forgotSuccess.set(`A 6-digit verification code was sent to ${full}`);
      },
      error: (err) => {
        this.forgotLoading.set(false);
        this.forgotError.set(err.error?.error?.message || err.error?.message || 'Failed to dispatch reset code.');
      }
    });
  }

  onForgotResetPassword(): void {
    if (this.forgotResetForm.invalid) {
      this.forgotResetForm.markAllAsTouched();
      return;
    }

    this.forgotLoading.set(true);
    this.forgotError.set(null);

    const { otp, new_password } = this.forgotResetForm.value;

    this.authService.resetPassword({
      phone: this.forgotPhone(),
      otp: otp.trim(),
      new_password
    }).subscribe({
      next: () => {
        this.forgotLoading.set(false);
        this.notificationService.showSuccess('Password updated successfully! You can now log in.');
        this.closeForgotModal();
      },
      error: (err) => {
        this.forgotLoading.set(false);
        this.forgotError.set(err.error?.error?.message || err.error?.message || 'Failed to update password.');
      }
    });
  }
}
