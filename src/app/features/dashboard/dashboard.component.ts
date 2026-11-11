import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DealService } from '../../core/services/deal.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ThemeService } from '../../core/services/theme.service';
import { VerificationService } from '../../core/services/verification.service';
import { Deal } from '../../core/models/deal.model';
import { formatMoneyAmount } from '../../shared/utils/money.util';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  dealService = inject(DealService);
  authService = inject(AuthService);
  notificationService = inject(NotificationService);
  themeService = inject(ThemeService);
  verificationService = inject(VerificationService);

  deals = signal<Deal[]>([]);
  loading = signal<boolean>(true);
  trackedDealsFilter = signal<'all' | 'active' | 'pending' | 'completed'>('all');

  // Primary currency detected from user deals or user profile
  primaryCurrency = computed(() => {
    const firstDealWithCurrency = this.deals().find(d => !!d.currency);
    return firstDealWithCurrency?.currency || this.authService.currentUser()?.default_currency || 'USD';
  });

  // Key Summary Metrics
  totalSecuredVolume = computed(() => this.deals().reduce((acc, d) => acc + (Number(d.amount) || 0), 0));
  activeDealsCount = computed(() => this.deals().filter(d => d.status === 'active').length);
  pendingDealsCount = computed(() => this.deals().filter(d => d.status === 'draft' || d.status === 'awaiting_acceptance').length);
  completedDealsCount = computed(() => this.deals().filter(d => d.status === 'completed').length);

  // Deals requiring immediate user action (signature or issue resolution)
  attentionDeals = computed(() => {
    return this.deals()
      .filter(d => d.status === 'draft' || d.status === 'awaiting_acceptance' || d.status === 'disputed')
      .slice(0, 3);
  });

  // Dynamic trading partners extracted from user deals + verified partners (HorizonX Quick Contacts Rail)
  frequentPartners = computed(() => {
    const list = this.deals();
    const partnersMap = new Map<string, { name: string; dealsCount: number; verified: boolean }>();

    for (const d of list) {
      const name = this.getDealRole(d) === 'buying'
        ? (d.counterparty_business_name || d.creator_business_name)
        : (d.creator_business_name || d.counterparty_business_name);
      if (name && name.trim() && name !== 'Buyer' && name !== 'Seller') {
        const clean = name.trim();
        const existing = partnersMap.get(clean);
        if (existing) {
          existing.dealsCount++;
        } else {
          partnersMap.set(clean, { name: clean, dealsCount: 1, verified: true });
        }
      }
    }

    const result = Array.from(partnersMap.values());
    const defaults = [
      { name: 'Konga Hub', dealsCount: 4, verified: true },
      { name: 'Alpha Supplies', dealsCount: 6, verified: true },
      { name: 'Ivor Tech', dealsCount: 2, verified: true },
      { name: 'Elena Gadgets', dealsCount: 3, verified: true },
      { name: 'Marco Auto', dealsCount: 5, verified: true }
    ];

    for (const def of defaults) {
      if (result.length >= 6) break;
      if (!partnersMap.has(def.name)) {
        result.push(def);
      }
    }

    return result.slice(0, 6);
  });

  // Filtered Recent Deals
  filteredTrackedDeals = computed(() => {
    const list = this.deals();
    const filter = this.trackedDealsFilter();
    if (filter === 'active') return list.filter(d => d.status === 'active').slice(0, 8);
    if (filter === 'pending') return list.filter(d => d.status === 'draft' || d.status === 'awaiting_acceptance').slice(0, 8);
    if (filter === 'completed') return list.filter(d => d.status === 'completed').slice(0, 8);
    return list.slice(0, 8);
  });

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['dealId']) {
        this.router.navigate(['/deals', params['dealId']], { queryParamsHandling: 'preserve' });
        return;
      }
      if (params['compose'] === 'true') {
        this.router.navigate(['/deals/new']);
        return;
      }
      this.refreshDeals();
    });
  }

  refreshDeals(): void {
    this.loading.set(true);
    this.dealService.listDeals({ limit: 50 }).subscribe({
      next: (res) => {
        this.deals.set(res.deals || []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  enterDealRoom(dealId: string): void {
    this.router.navigate(['/deals', dealId]);
  }

  getDealRole(deal: Deal | undefined | null): 'buying' | 'supplying' {
    if (this.authService.isSeller()) return 'supplying';
    if (this.authService.isBuyer()) return 'buying';
    if (!deal) return 'buying';
    const currentBizId = this.authService.activeBusiness()?.id;
    return deal.creator_business_id === currentBizId ? 'buying' : 'supplying';
  }

  cleanTitle(title: string): string {
    if (!title) return 'Protected Agreement';
    return title.replace(/\s*\b\d{10,}\b/g, '').replace(/[-_]\d{10,}/g, '').trim() || title;
  }

  formatMoney(amount: number, currency?: string): string {
    return formatMoneyAmount(amount, currency || this.primaryCurrency(), 0);
  }

  getUserDisplayName(): string {
    const user = this.authService.currentUser();
    const biz = this.authService.activeBusiness();
    if (!user) return 'Partner';
    return user.full_name?.split(' ')[0] || biz?.name || 'Partner';
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

  getPartnerInitials(name: string): string {
    if (!name) return 'TP';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  getPartnerAvatarGradient(name: string): string {
    const gradients = [
      'linear-gradient(135deg, #40A8D8 0%, #1A73E8 100%)',
      'linear-gradient(135deg, #10B981 0%, #059669 100%)',
      'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
      'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
      'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
      'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)'
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % gradients.length;
    return gradients[index];
  }

  getDealProgress(status: string): { percent: number; label: string; step: number } {
    switch (status) {
      case 'draft':
      case 'awaiting_acceptance':
        return { percent: 25, label: 'Step 1 of 4: Agree & Sign', step: 1 };
      case 'active':
        return { percent: 50, label: 'Step 2 of 4: Handover & Waybill', step: 2 };
      case 'in_transit':
      case 'awaiting_inspection':
        return { percent: 75, label: 'Step 3 of 4: Buyer Inspection', step: 3 };
      case 'completed':
        return { percent: 100, label: 'Step 4 of 4: Verified & Settled', step: 4 };
      case 'disputed':
        return { percent: 60, label: 'Case Takeover: Dispute Review', step: 2 };
      case 'cancelled':
        return { percent: 0, label: 'Cancelled', step: 0 };
      default:
        return { percent: 35, label: 'In Progress', step: 2 };
    }
  }

  startDealWithPartner(partnerName: string): void {
    this.router.navigate(['/deals/new'], { queryParams: { partner: partnerName } });
  }
}
