import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DealService } from '../../../core/services/deal.service';
import { AuthService } from '../../../core/services/auth.service';
import { Deal } from '../../../core/models/deal.model';
import { NotificationService } from '../../../core/services/notification.service';
import { formatMoneyAmount } from '../../../shared/utils/money.util';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-deal-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, StatusBadgeComponent, EmptyStateComponent],
  templateUrl: './deal-list.component.html',
  styleUrls: ['./deal-list.component.css']
})
export class DealListComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dealService = inject(DealService);
  private router = inject(Router);
  authService = inject(AuthService);
  private notificationService = inject(NotificationService);

  loading = signal(true);
  deals = signal<Deal[]>([]);
  totalCount = signal(0);

  // Filters
  selectedStatus = signal<string>('all');
  selectedRole = signal<'all' | 'buying' | 'selling'>('all');
  searchQuery = signal<string>('');

  statusTabs = [
    { label: 'All Deals', value: 'all' },
    { label: 'In Progress', value: 'active' },
    { label: 'Needs Signature', value: 'awaiting_acceptance' },
    { label: 'Pending Invite', value: 'draft' },
    { label: 'Issue Reported', value: 'disputed' },
    { label: 'Completed', value: 'completed' }
  ];

  primaryCurrency = computed(() => {
    const first = this.deals().find(d => !!d.currency);
    return first?.currency || this.authService.currentUser()?.default_currency || 'USD';
  });

  totalSecuredVolume = computed(() => {
    return this.deals().reduce((acc, d) => acc + Number(d.amount || 0), 0);
  });

  activeDealsCount = computed(() => {
    return this.deals().filter(d => d.status === 'active').length;
  });

  pendingDealsCount = computed(() => {
    return this.deals().filter(d => d.status === 'draft' || d.status === 'awaiting_acceptance').length;
  });

  completedDealsCount = computed(() => {
    return this.deals().filter(d => d.status === 'completed').length;
  });

  getDealRole(deal: Deal): 'buying' | 'selling' {
    if (this.authService.isSeller()) return 'selling';
    if (this.authService.isBuyer()) return 'buying';
    const currentBizId = this.authService.activeBusiness()?.id;
    return deal.creator_business_id === currentBizId ? 'buying' : 'selling';
  }

  filteredDeals = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const roleFilter = this.selectedRole();
    let list = this.deals();

    if (roleFilter !== 'all') {
      list = list.filter(d => this.getDealRole(d) === roleFilter);
    }

    if (!query) return list;

    return list.filter(deal =>
      deal.title.toLowerCase().includes(query) ||
      deal.reference_no.toLowerCase().includes(query) ||
      (deal.counterparty_business_name && deal.counterparty_business_name.toLowerCase().includes(query)) ||
      (deal.creator_business_name && deal.creator_business_name.toLowerCase().includes(query))
    );
  });

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const statusParam = params['status'];
      if (statusParam && this.statusTabs.some(t => t.value === statusParam)) {
        this.selectedStatus.set(statusParam);
      } else if (!statusParam) {
        this.selectedStatus.set('all');
      }
      this.fetchDeals();
    });
  }

  fetchDeals(): void {
    this.loading.set(true);
    const status = this.selectedStatus() === 'all' ? undefined : this.selectedStatus();

    this.dealService.listDeals({ status, limit: 50 }).subscribe({
      next: (res) => {
        this.deals.set(res.deals || []);
        this.totalCount.set(res.pagination?.total || (res.deals ? res.deals.length : 0));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  onStatusChange(status: string): void {
    this.selectedStatus.set(status);
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: status === 'all' ? { status: null } : { status },
      queryParamsHandling: 'merge'
    });
  }

  onSearchChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  hasActiveFilters = computed(() => {
    return this.selectedStatus() !== 'all' || this.selectedRole() !== 'all' || !!this.searchQuery().trim();
  });

  resetAllFilters(): void {
    this.selectedRole.set('all');
    this.searchQuery.set('');
    this.onStatusChange('all');
  }

  openDeal(dealId: string): void {
    this.router.navigate(['/deals', dealId]);
  }

  copyDealLink(dealId: string, event: Event): void {
    event.stopPropagation();
    const url = `${window.location.origin}/d/${dealId}`;
    navigator.clipboard?.writeText(url);
    this.notificationService.showSuccess('Protected deal preview link copied to clipboard.');
  }

  formatCurrency(amount: number, currency?: string): string {
    return formatMoneyAmount(amount, currency || this.primaryCurrency(), 2);
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric'
    });
  }
}
