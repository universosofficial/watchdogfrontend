import { Injectable, signal, effect } from '@angular/core';

export type AppTheme = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly STORAGE_KEY = 'dw_theme_preference';

  // Active theme signal: 'light' or 'dark'
  readonly currentTheme = signal<AppTheme>(this.getInitialTheme());

  constructor() {
    // Automatically apply theme attribute and class to <html> and <body>
    effect(() => {
      const theme = this.currentTheme();
      this.applyTheme(theme);
    });

    // Listen to OS system theme changes if user hasn't explicitly chosen
    if (typeof window !== 'undefined' && window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem(this.STORAGE_KEY)) {
          this.currentTheme.set(e.matches ? 'dark' : 'light');
        }
      });
    }
  }

  private getInitialTheme(): AppTheme {
    if (typeof window === 'undefined') return 'light';
    const saved = localStorage.getItem(this.STORAGE_KEY) as AppTheme | null;
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    return 'light';
  }

  private applyTheme(theme: AppTheme): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    const body = document.body;

    root.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      root.classList.add('dark', 'theme-dark');
      root.classList.remove('theme-light');
      body.classList.add('dark', 'theme-dark');
      body.classList.remove('theme-light');
    } else {
      root.classList.add('theme-light');
      root.classList.remove('dark', 'theme-dark');
      body.classList.add('theme-light');
      body.classList.remove('dark', 'theme-dark');
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, theme);
    } catch {
      // Ignore in private browsing / sandboxes
    }
  }

  toggleTheme(): AppTheme {
    const next = this.currentTheme() === 'dark' ? 'light' : 'dark';
    this.currentTheme.set(next);
    return next;
  }

  setTheme(theme: AppTheme): void {
    this.currentTheme.set(theme);
  }

  isDark(): boolean {
    return this.currentTheme() === 'dark';
  }
}
