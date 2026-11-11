import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RegistryService, RegistryEntity, BlacklistRecord, RegistryStats } from '../../core/services/registry.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-registry',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './registry.component.html',
  styleUrls: ['./registry.component.css']
})
export class RegistryComponent implements OnInit {
  registryService = inject(RegistryService);
  private notificationService = inject(NotificationService);

  searchQuery = signal<string>('');
  isSearching = signal<boolean>(false);
  searchResults = signal<RegistryEntity[]>([]);
  hasSearched = signal<boolean>(false);

  activeTab = signal<'search' | 'blacklist' | 'cleared'>('blacklist');

  selectedBlacklistRecord = signal<BlacklistRecord | null>(null);
  showDossierModal = signal<boolean>(false);

  ngOnInit(): void {
    this.registryService.fetchStats().subscribe();
    this.loadBlacklist();
  }

  loadBlacklist(): void {
    this.registryService.fetchBlacklist().subscribe({
      error: (err) => {
        this.notificationService.showError(err.message || 'Failed to load Blacklist Directory');
      }
    });
  }

  onSearch(): void {
    const q = this.searchQuery().trim();
    if (!q || q.length < 2) {
      this.notificationService.showError('Please enter at least 2 characters to search.');
      return;
    }

    this.isSearching.set(true);
    this.hasSearched.set(true);
    this.activeTab.set('search');

    this.registryService.searchRegistry(q).subscribe({
      next: (res) => {
        this.searchResults.set(res.results);
        this.isSearching.set(false);
      },
      error: (err) => {
        this.isSearching.set(false);
        this.notificationService.showError(err.message || 'Search execution failed');
      }
    });
  }

  quickSearch(keyword: string): void {
    this.searchQuery.set(keyword);
    this.onSearch();
  }

  clearSearch(): void {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.hasSearched.set(false);
    this.activeTab.set('blacklist');
  }

  openDossierModal(record: BlacklistRecord): void {
    this.selectedBlacklistRecord.set(record);
    this.showDossierModal.set(true);
  }

  closeDossierModal(): void {
    this.showDossierModal.set(false);
    this.selectedBlacklistRecord.set(null);
  }

  formatMoney(amount: number, currency = 'NGN'): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: currency,
      maximumFractionDigits: 0
    }).format(amount);
  }
}
