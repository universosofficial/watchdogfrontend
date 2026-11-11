import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { VerificationService } from '../../core/services/verification.service';
import { ThemeService } from '../../core/services/theme.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  private fb = inject(FormBuilder);
  authService = inject(AuthService);
  verificationService = inject(VerificationService);
  themeService = inject(ThemeService);
  private notificationService = inject(NotificationService);

  saving = signal(false);
  uploadingAvatar = signal(false);
  profileForm: FormGroup = this.fb.group({
    full_name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.email]],
    phone: ['', [Validators.required]],
    default_currency: ['USD', [Validators.required]],
    business_name: [''],
    address: ['']
  });

  currencies = [
    { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
    { code: 'USD', symbol: '$', name: 'US Dollar' },
    { code: 'GBP', symbol: '£', name: 'British Pound' },
    { code: 'EUR', symbol: '€', name: 'Euro' },
    { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
    { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
    { code: 'ZAR', symbol: 'R', name: 'South African Rand' }
  ];

  ngOnInit(): void {
    this.populateForm();
  }

  populateForm(): void {
    const user = this.authService.currentUser();
    const biz = this.authService.activeBusiness();

    if (user) {
      this.profileForm.patchValue({
        full_name: user.full_name || '',
        email: user.email || '',
        phone: user.phone || '',
        default_currency: user.default_currency || 'USD',
        business_name: biz?.name || '',
        address: biz?.address || ''
      });
    }
  }

  onSaveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      this.notificationService.showError('Please check the required profile fields.');
      return;
    }

    this.saving.set(true);
    const val = this.profileForm.value;

    this.authService.updateProfile({
      full_name: val.full_name,
      email: val.email,
      phone: val.phone,
      default_currency: val.default_currency,
      business_name: val.business_name,
      address: val.address
    }).subscribe({
      next: () => {
        this.saving.set(false);
      },
      error: (err) => {
        this.saving.set(false);
        this.notificationService.showError(err.message || 'Failed saving profile');
      }
    });
  }

  getUserInitials(): string {
    const user = this.authService.currentUser();
    if (!user || !user.full_name) return 'WD';
    const parts = user.full_name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return user.full_name.slice(0, 2).toUpperCase();
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
      this.notificationService.showError('Image must be under 5MB.');
      input.value = '';
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.notificationService.showError('Please upload a valid image file (JPG, PNG, or WebP).');
      input.value = '';
      return;
    }

    this.uploadingAvatar.set(true);
    this.authService.uploadAvatar(file).subscribe({
      next: () => {
        this.uploadingAvatar.set(false);
        input.value = '';
      },
      error: (err) => {
        this.uploadingAvatar.set(false);
        input.value = '';
        this.notificationService.showError(err.message || 'Failed uploading photo to Cloudinary');
      }
    });
  }

  onRemoveAvatar(): void {
    if (!this.authService.currentUser()?.avatar_url) return;
    this.uploadingAvatar.set(true);
    this.authService.removeAvatar().subscribe({
      next: () => {
        this.uploadingAvatar.set(false);
      },
      error: (err) => {
        this.uploadingAvatar.set(false);
        this.notificationService.showError(err.message || 'Failed removing photo');
      }
    });
  }
}
