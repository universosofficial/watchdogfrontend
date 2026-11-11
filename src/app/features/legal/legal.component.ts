import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './legal.component.html',
  styleUrls: ['./legal.component.css']
})
export class LegalComponent implements OnInit {
  themeService = inject(ThemeService);
  private route = inject(ActivatedRoute);

  activeTab = signal<'terms' | 'privacy'>('terms');

  ngOnInit(): void {
    const path = this.route.snapshot.routeConfig?.path;
    if (path === 'privacy') {
      this.activeTab.set('privacy');
    } else {
      this.activeTab.set('terms');
    }

    this.route.queryParams.subscribe(params => {
      if (params['tab'] === 'privacy') {
        this.activeTab.set('privacy');
      } else if (params['tab'] === 'terms') {
        this.activeTab.set('terms');
      }
    });
  }

  setTab(tab: 'terms' | 'privacy'): void {
    this.activeTab.set(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
