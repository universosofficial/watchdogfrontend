import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DealService } from '../../../core/services/deal.service';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationService } from '../../../core/services/notification.service';
import { formatMoneyAmount } from '../../../shared/utils/money.util';

@Component({
  selector: 'app-deal-public-preview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './deal-public-preview.component.html',
  styleUrls: ['./deal-public-preview.component.css']
})
export class DealPublicPreviewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private dealService = inject(DealService);
  authService = inject(AuthService);
  private notificationService = inject(NotificationService);

  dealId = signal<string | null>(null);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  previewData = signal<any | null>(null);

  // Photo Lightbox State
  lightboxPhotoUrl = signal<string | null>(null);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('dealId');
    if (!id) {
      this.error.set('No deal reference provided in link.');
      this.loading.set(false);
      return;
    }

    this.dealId.set(id);
    this.loadPublicPreview(id);
  }

  loadPublicPreview(dealId: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.dealService.getPublicDealPreview(dealId).subscribe({
      next: (data) => {
        this.previewData.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err.error?.error?.message || 
          err.error?.message || 
          'Agreement link not found or has expired. Please ask the sender to share a new link.'
        );
      }
    });
  }

  openLightbox(url: string): void {
    this.lightboxPhotoUrl.set(url);
  }

  closeLightbox(): void {
    this.lightboxPhotoUrl.set(null);
  }

  formatPrice(amount: number, currency: string): string {
    return formatMoneyAmount(amount, currency || 'USD', 0);
  }

  formatDate(isoStr?: string | null): string {
    if (!isoStr) return 'Upon Agreement';
    const d = new Date(isoStr);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  onAcceptAndClaim(): void {
    const deal = this.previewData()?.deal;
    if (!deal) return;

    if (this.authService.isAuthenticated()) {
      // User is already logged in: jump straight to deal workspace to sign
      this.router.navigate(['/deals', deal.id]);
    } else {
      // Prompt quick sign-in or register with returnUrl
      this.notificationService.showInfo('Please sign in or create a quick free account to seal this agreement.');
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/deals/${deal.id}` }
      });
    }
  }

  openWhatsAppWithCreator(): void {
    const data = this.previewData();
    const deal = data?.deal;
    const phone = data?.creator?.phone || deal?.invited_phone;
    const ref = deal?.reference_no || '';

    const text = encodeURIComponent(
      `Hello, I am reviewing our Digital Watchdog agreement for "${deal?.title}" (Ref: ${ref}). I have a question before signing:`
    );

    if (phone) {
      const cleanPhone = phone.replace(/[^0-9+]/g, '');
      window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
    } else {
      window.open(`https://wa.me/?text=${text}`, '_blank');
    }
  }

  copyLink(): void {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href);
    this.notificationService.showSuccess('Agreement link copied to clipboard!');
  }
}
