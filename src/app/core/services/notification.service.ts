import { Injectable, signal } from '@angular/core';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  durationMs?: number;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  messages = signal<ToastMessage[]>([]);

  show(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', durationMs: number = 4000): void {
    const id = Math.random().toString(36).substring(2, 9);
    const toast: ToastMessage = { id, type, message, durationMs };

    this.messages.update(prev => [...prev, toast]);

    if (durationMs > 0) {
      setTimeout(() => {
        this.dismiss(id);
      }, durationMs);
    }
  }

  showSuccess(message: string, durationMs: number = 4000): void {
    this.show(message, 'success', durationMs);
  }

  showError(message: string, durationMs: number = 6000): void {
    this.show(message, 'error', durationMs);
  }

  showWarning(message: string, durationMs: number = 5000): void {
    this.show(message, 'warning', durationMs);
  }

  showInfo(message: string, durationMs: number = 4000): void {
    this.show(message, 'info', durationMs);
  }

  dismiss(id: string): void {
    this.messages.update(prev => prev.filter(m => m.id !== id));
  }

  clear(): void {
    this.messages.set([]);
  }
}
