import { Component, inject, signal, HostListener, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { ThemeService } from '../core/services/theme.service';
import { VerificationService } from '../core/services/verification.service';
import { DealService } from '../core/services/deal.service';
import { TierWarningModalComponent } from '../shared/components/tier-warning-modal/tier-warning-modal.component';
import { environment } from '../../environments/environment';
import { filter } from 'rxjs';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    TierWarningModalComponent
  ],
  templateUrl: './main-layout.component.html',
  styleUrls: ['./main-layout.component.css']
})
export class MainLayoutComponent implements OnInit {
  authService = inject(AuthService);
  notificationService = inject(NotificationService);
  themeService = inject(ThemeService);
  verificationService = inject(VerificationService);
  dealService = inject(DealService);
  private router = inject(Router);
  readonly websiteUrl = environment.websiteUrl;

  sidebarCollapsed = signal(false);
  mobileMenuOpen = signal(false);
  userMenuOpen = signal(false);
  notificationsOpen = signal(false);
  showCommandPalette = signal(false);
  devToolsOpen = signal(false);
  dealsCount = signal(0);
  currentUrl = signal('/dashboard');

  toggleDevTools(): void {
    this.devToolsOpen.update(v => !v);
  }

  switchWorkspaceMode(persona: 'buyer' | 'seller'): void {
    if (this.authService.activePersona() !== persona) {
      this.authService.switchPersona(persona).subscribe({
        next: () => {
          this.loadDealsCount();
        }
      });
    }
  }

  recentNotifications = signal<Array<{ id: string; title: string; ref: string; time: string; icon: string; type: string }>>([]);

  ngOnInit(): void {
    this.currentUrl.set(this.router.url);
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentUrl.set(event.urlAfterRedirects || event.url);
      this.mobileMenuOpen.set(false);
    });

    this.loadDealsCount();
  }

  loadDealsCount(): void {
    this.dealService.getDashboardSummary().subscribe({
      next: (summary) => {
        if (summary?.metrics?.active_deals !== undefined) {
          this.dealsCount.set(summary.metrics.active_deals);
        }
      },
      error: () => {
        // Fallback default
      }
    });

    this.dealService.listDeals({ limit: 4 }).subscribe({
      next: (res) => {
        const list = res.deals || [];
        const notifs = list.map(d => ({
          id: d.id,
          title: d.status === 'active' ? 'Active Protected Deal' : (d.status === 'draft' ? 'Awaiting Partner Signature' : 'Deal Completed'),
          ref: `REF: ${d.reference_no}`,
          time: d.created_at ? new Date(d.created_at).toLocaleDateString() : 'Recent',
          icon: d.status === 'active' ? '⚡' : (d.status === 'draft' ? '📨' : '✓'),
          type: d.status === 'active' ? 'success' : 'info'
        }));
        this.recentNotifications.set(notifs);
      },
      error: () => {}
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalShortcuts(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

    // Cmd+K or Ctrl+K -> Command Palette
    if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault();
      this.showCommandPalette.update(v => !v);
      return;
    }

    // Cmd+B or Ctrl+B -> Toggle Sidebar Collapse
    if ((event.metaKey || event.ctrlKey) && (event.key === 'b' || event.key === 'B')) {
      event.preventDefault();
      this.toggleSidebar();
      return;
    }

    // Escape -> Close Command Palette & Menus
    if (event.key === 'Escape') {
      this.showCommandPalette.set(false);
      this.userMenuOpen.set(false);
      this.notificationsOpen.set(false);
      this.mobileMenuOpen.set(false);
      return;
    }

    // Single-key shortcuts when NOT inside an input:
    if (!isInput && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (event.key === 't' || event.key === 'T') {
        event.preventDefault();
        this.themeService.toggleTheme();
      } else if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        this.navigateToNewDeal();
      }
    }
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(v => !v);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  toggleUserMenu(): void {
    this.notificationsOpen.set(false);
    this.userMenuOpen.update(v => !v);
  }

  closeUserMenu(): void {
    this.userMenuOpen.set(false);
  }

  toggleNotifications(): void {
    this.userMenuOpen.set(false);
    this.notificationsOpen.update(v => !v);
  }

  closeNotifications(): void {
    this.notificationsOpen.set(false);
  }

  navigateToNewDeal(): void {
    this.closeMobileMenu();
    this.router.navigate(['/deals/new']);
  }

  getBreadcrumbPage(): string {
    const url = this.currentUrl();
    if (url.includes('/deals/new')) return 'New Deal';
    if (url.includes('/deals/')) return 'Deal Room';
    if (url.includes('/deals')) return 'All Deals';
    if (url.includes('/verification')) return 'Verification';
    if (url.includes('/settings')) return 'Settings';
    return 'Overview';
  }

  quickSwitchBusiness(businessId: string): void {
    if (businessId && businessId !== this.authService.activeBusiness()?.id) {
      this.authService.switchBusiness(businessId).subscribe({
        next: () => {
          this.closeUserMenu();
          this.notificationService.showSuccess(`Switched active entity to ${this.authService.activeBusiness()?.name}`);
          this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
            this.router.navigate(['/dashboard']);
          });
        }
      });
    }
  }

  openCommandPalette(): void {
    this.showCommandPalette.set(true);
  }

  closeCommandPalette(): void {
    this.showCommandPalette.set(false);
  }

  runCommand(action: string): void {
    this.closeCommandPalette();
    if (action === 'new-deal') {
      this.navigateToNewDeal();
    } else if (action === 'attach-proof') {
      this.router.navigate(['/dashboard'], { queryParams: { action: 'waybill' } });
    } else if (action === 'log-transfer') {
      this.router.navigate(['/dashboard'], { queryParams: { action: 'payment' } });
    } else if (action === 'report-issue') {
      this.router.navigate(['/dashboard'], { queryParams: { action: 'dispute' } });
    } else if (action === 'toggle-theme') {
      this.themeService.toggleTheme();
    } else if (action === 'settings') {
      this.router.navigate(['/settings']);
    }
  }

  logout(): void {
    this.userMenuOpen.set(false);
    this.closeMobileMenu();
    this.authService.logout();
  }
}
