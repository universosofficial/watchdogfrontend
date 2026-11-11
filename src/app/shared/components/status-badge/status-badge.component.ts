import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'dw-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="dw-badge" [ngClass]="badgeClass">
      <span class="dw-badge-dot"></span>
      <span>{{ label }}</span>
    </span>
  `
})
export class StatusBadgeComponent {
  @Input() status: string = 'draft';
  @Input() customLabel?: string;

  get badgeClass(): string {
    switch (this.status) {
      case 'active':
        return 'dw-badge-active';
      case 'completed':
      case 'verified':
      case 'confirmed':
        return 'dw-badge-success';
      case 'draft':
      case 'awaiting_acceptance':
      case 'pending':
        return 'dw-badge-warning';
      case 'disputed':
      case 'cancelled':
      case 'rejected':
        return 'dw-badge-danger';
      default:
        return 'dw-badge-neutral';
    }
  }

  get label(): string {
    if (this.customLabel) return this.customLabel;
    switch (this.status) {
      case 'active':
        return 'In Progress';
      case 'awaiting_acceptance':
        return 'Needs Signature';
      case 'draft':
        return 'Pending Invite';
      case 'disputed':
        return 'Issue Reported';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return this.status.replace(/_/g, ' ');
    }
  }
}
