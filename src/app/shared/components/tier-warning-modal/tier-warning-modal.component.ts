import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { VerificationService } from '../../../core/services/verification.service';

@Component({
  selector: 'app-tier-warning-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tier-warning-modal.component.html',
  styleUrls: ['./tier-warning-modal.component.css']
})
export class TierWarningModalComponent {
  verificationService = inject(VerificationService);

  ctx = computed(() => this.verificationService.warningModalContext());

  close() {
    this.verificationService.closeWarningModal();
  }

  upgrade() {
    this.verificationService.upgradeFromModal();
  }
}
