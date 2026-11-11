import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'dw-empty-state',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="dw-empty-box">
      <div class="dw-empty-icon-wrap" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
      </div>
      <h3 class="dw-empty-title">{{ title }}</h3>
      <p class="dw-empty-desc">{{ description }}</p>
      <div class="dw-empty-actions">
        @if (actionLabel && actionRoute) {
          <a [routerLink]="actionRoute" class="dw-btn dw-btn-primary">
            {{ actionLabel }}
          </a>
        } @else if (actionLabel) {
          <button type="button" class="dw-btn dw-btn-primary" (click)="actionClick.emit()">
            {{ actionLabel }}
          </button>
        }
        @if (secondaryActionLabel && secondaryActionRoute) {
          <a [routerLink]="secondaryActionRoute" class="dw-btn dw-btn-secondary">
            {{ secondaryActionLabel }}
          </a>
        } @else if (secondaryActionLabel) {
          <button type="button" class="dw-btn dw-btn-secondary" (click)="secondaryActionClick.emit()">
            {{ secondaryActionLabel }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .dw-empty-box {
      padding: 48px 24px;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .dw-empty-icon-wrap {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-sm);
      background: var(--bg-elevated);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 4px;
    }
    .dw-empty-title {
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--text-primary);
      margin: 0;
    }
    .dw-empty-desc {
      font-size: 0.8125rem;
      color: var(--text-secondary);
      max-width: 380px;
      margin: 0 0 12px;
      line-height: 1.5;
    }
    .dw-empty-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      flex-wrap: wrap;
    }
  `]
})
export class EmptyStateComponent {
  @Input() title: string = 'No deals found';
  @Input() description: string = 'There are no records matching your current view.';
  @Input() actionLabel?: string;
  @Input() actionRoute?: string;
  @Input() secondaryActionLabel?: string;
  @Input() secondaryActionRoute?: string;
  @Output() actionClick = new EventEmitter<void>();
  @Output() secondaryActionClick = new EventEmitter<void>();
}
