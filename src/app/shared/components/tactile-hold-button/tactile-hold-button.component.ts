import { Component, Input, Output, EventEmitter, signal, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tactile-hold-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      type="button"
      class="tactile-hold-btn"
      [class.holding]="isHolding()"
      [class.completed]="isCompleted()"
      [class.disabled]="disabled"
      [disabled]="disabled || isCompleted()"
      (mousedown)="startHold($event)"
      (mouseup)="cancelHold()"
      (mouseleave)="cancelHold()"
      (touchstart)="startHold($event)"
      (touchend)="cancelHold()"
      (touchcancel)="cancelHold()"
      (keydown.space)="startHold($event)"
      (keyup.space)="cancelHold()"
      (keydown.enter)="startHold($event)"
      (keyup.enter)="cancelHold()"
      [attr.aria-label]="isCompleted() ? (completedLabel || confirmedLabel) : label"
      [attr.aria-valuenow]="holdProgress()"
      aria-valuemin="0"
      aria-valuemax="100"
    >
      <!-- Circular Progress Ring SVG -->
      <svg class="hold-progress-svg" viewBox="0 0 44 44" aria-hidden="true">
        <circle
          class="progress-track"
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke-width="3.5"
        />
        <circle
          class="progress-fill"
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke-width="3.5"
          [style.strokeDashoffset]="dashOffset()"
        />
      </svg>

      <!-- Button Icon & Label Texts -->
      <div class="hold-content">
        @if (isCompleted()) {
          <span class="hold-icon check-icon">✓</span>
          <span class="hold-label">{{ completedLabel || confirmedLabel }}</span>
        } @else {
          <span class="hold-icon" [class.pulse]="isHolding()">{{ icon }}</span>
          <div class="hold-text-cluster">
            <span class="hold-label">{{ isHolding() && holdingLabel ? holdingLabel : label }}</span>
            <span class="hold-sublabel font-mono">
              {{ isHolding() ? 'Holding... (' + Math.round(holdProgress()) + '%)' : 'Press & Hold 2s' }}
            </span>
          </div>
        }
      </div>
    </button>
  `,
  styleUrls: ['./tactile-hold-button.component.css']
})
export class TactileHoldButtonComponent implements OnDestroy {
  @Input() label: string = 'Hold to Confirm';
  @Input() holdingLabel: string = 'Holding...';
  @Input() completedLabel: string = 'Confirmed ✓';
  @Input() confirmedLabel: string = 'Confirmed ✓';
  @Input() icon: string = '₦';
  @Input() durationMs: number = 2000;
  @Input() holdDurationMs: number = 2000;
  @Input() disabled: boolean = false;

  @Output() confirmed = new EventEmitter<void>();

  isHolding = signal<boolean>(false);
  isCompleted = signal<boolean>(false);
  holdProgress = signal<number>(0); // 0 to 100

  // 2 * PI * 18 = ~113.1
  private readonly circumference = 113.1;
  private holdTimer: any = null;
  private animFrame: any = null;
  private startTime: number = 0;

  readonly Math = Math;

  get effectiveDuration(): number {
    return this.holdDurationMs || this.durationMs || 2000;
  }

  dashOffset = () => {
    const progress = this.holdProgress();
    return this.circumference - (progress / 100) * this.circumference;
  };

  startHold(event: Event): void {
    if (this.disabled || this.isCompleted()) return;
    
    // Prevent context menu or text selection
    event.preventDefault();

    this.isHolding.set(true);
    this.holdProgress.set(0);
    this.startTime = Date.now();

    const tick = () => {
      if (!this.isHolding()) return;
      const elapsed = Date.now() - this.startTime;
      const pct = Math.min(100, (elapsed / this.effectiveDuration) * 100);
      this.holdProgress.set(pct);

      if (pct >= 100) {
        this.completeHold();
      } else {
        this.animFrame = requestAnimationFrame(tick);
      }
    };

    this.animFrame = requestAnimationFrame(tick);
  }

  cancelHold(): void {
    if (this.isCompleted()) return;
    this.isHolding.set(false);
    this.holdProgress.set(0);
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }

  private completeHold(): void {
    this.isHolding.set(false);
    this.isCompleted.set(true);
    this.holdProgress.set(100);
    if (this.animFrame) cancelAnimationFrame(this.animFrame);

    // Haptic vibration feedback for physical touchscreens
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([40, 60, 40]);
      } catch (e) {}
    }

    this.confirmed.emit();
  }

  reset(): void {
    this.isCompleted.set(false);
    this.isHolding.set(false);
    this.holdProgress.set(0);
  }

  ngOnDestroy(): void {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}
