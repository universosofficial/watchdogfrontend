import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User, AuthSession, TrustRadarResult } from '../models/user.model';
import { Business } from '../models/business.model';
import { ApiResponse } from '../models/api-response.model';
import { NotificationService } from './notification.service';

const TOKEN_KEY = 'dw_auth_token';
const USER_KEY = 'dw_auth_user';
const ACTIVE_BUSINESS_KEY = 'dw_active_business';
const AVAILABLE_BUSINESSES_KEY = 'dw_available_businesses';
const ACTIVE_PERSONA_KEY = 'dw_active_persona';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private notificationService = inject(NotificationService);

  private apiUrl = `${environment.apiUrl}/auth`;

  // Reactive state signals
  readonly token = signal<string | null>(this.getStoredToken());
  readonly currentUser = signal<User | null>(this.getStoredUser());
  readonly activeBusiness = signal<Business | null>(this.getStoredBusiness());
  readonly availableBusinesses = signal<Business[]>(this.getStoredAvailableBusinesses());
  readonly activePersona = signal<'buyer' | 'seller'>(this.getStoredPersona());
  readonly trustRadar = signal<TrustRadarResult | null>(null);

  readonly isAuthenticated = computed(() => !!this.token() && !!this.currentUser());
  readonly isBuyer = computed(() => this.activePersona() === 'buyer');
  readonly isSeller = computed(() => this.activePersona() === 'seller');

  constructor() {
    // If token exists, sync profile on startup
    if (this.token()) {
      this.getMe().subscribe({
        error: () => {
          this.logout();
        }
      });
    }
  }

  /**
   * Request 6-digit SMS OTP for phone verification or password reset
   */
  requestOtp(phone: string, purpose: 'registration' | 'password_reset' | 'login' = 'registration'): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/request-otp`, { phone, purpose }).pipe(
      map(res => {
        if (!res.success) {
          throw new Error(res.error?.message || 'Failed to send verification code');
        }
        return res.data;
      })
    );
  }

  /**
   * Phone registration with OTP verification
   */
  registerPhone(payload: {
    phone: string;
    otp: string;
    full_name: string;
    password?: string;
    country_code?: string;
    default_currency?: string;
    active_persona?: 'buyer' | 'seller';
    business_name?: string;
  }): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/register-phone`, payload).pipe(
      map(res => {
        if (!res.success) {
          throw new Error(res.error?.message || 'Registration failed');
        }
        return res.data;
      }),
      tap(data => {
        this.setSession({
          user: data.user,
          business: data.business || null,
          available_businesses: data.available_businesses || (data.business ? [data.business] : []),
          active_persona: data.active_persona || payload.active_persona || 'buyer',
          trust_radar: data.trust_radar || null,
          token: data.token
        });
      })
    );
  }

  /**
   * Phone-only login with password
   */
  loginPhone(credentials: { phone: string; password: string }): Observable<AuthSession> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/login-phone`, credentials).pipe(
      map(res => {
        if (!res.success) {
          throw new Error(res.error?.message || 'Login failed');
        }
        return res.data;
      }),
      tap(data => {
        this.setSession({
          user: data.user,
          business: data.business || null,
          available_businesses: data.available_businesses || (data.business ? [data.business] : []),
          active_persona: data.active_persona || 'buyer',
          trust_radar: data.trust_radar || null,
          token: data.token
        });
      })
    );
  }

  /**
   * Legacy universal login
   */
  login(credentials: { email?: string; phone?: string; password: string }): Observable<AuthSession> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/login`, credentials).pipe(
      map(res => {
        if (!res.success) {
          throw new Error(res.error?.message || 'Login failed');
        }
        return res.data;
      }),
      tap(data => {
        this.setSession({
          user: data.user,
          business: data.business || null,
          available_businesses: data.available_businesses || (data.business ? [data.business] : []),
          active_persona: data.active_persona || 'buyer',
          trust_radar: data.trust_radar || null,
          token: data.token
        });
      })
    );
  }

  /**
   * Switch between Buyer and Seller mode dynamically
   */
  switchPersona(persona: 'buyer' | 'seller'): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/switch-persona`, { persona }).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed switching workspace mode');
        return res.data;
      }),
      tap(data => {
        this.activePersona.set(persona);
        localStorage.setItem(ACTIVE_PERSONA_KEY, persona);
        if (data.token) {
          this.token.set(data.token);
          localStorage.setItem(TOKEN_KEY, data.token);
        }
        if (data.trust_radar) {
          this.trustRadar.set(data.trust_radar);
        }
        const user = this.currentUser();
        if (user) {
          const updatedUser = { ...user, active_persona: persona };
          this.currentUser.set(updatedUser);
          localStorage.setItem(USER_KEY, JSON.stringify(updatedUser));
        }
        this.notificationService.showSuccess(`Switched to ${persona === 'buyer' ? '🛒 Buyer Workspace' : '📦 Seller Command'}`);
      })
    );
  }

  /**
   * Request password reset code via SMS
   */
  forgotPasswordRequestOtp(phone: string): Observable<any> {
    return this.requestOtp(phone, 'password_reset');
  }

  /**
   * Reset password with SMS OTP code
   */
  resetPassword(payload: { phone: string; otp: string; new_password: string }): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/reset-password`, payload).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed resetting password');
        return res.data;
      })
    );
  }

  /**
   * Fetch current authenticated user session
   */
  getMe(): Observable<any> {
    return this.http.get<ApiResponse<any>>(`${this.apiUrl}/me`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed retrieving profile');
        return res.data;
      }),
      tap(data => {
        if (data.user) {
          this.currentUser.set(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          if (data.user.active_persona) {
            this.activePersona.set(data.user.active_persona);
            localStorage.setItem(ACTIVE_PERSONA_KEY, data.user.active_persona);
          }
        }

        if (data.trust_radar) {
          this.trustRadar.set(data.trust_radar);
        }

        const businesses: Business[] = data.businesses || [];
        this.availableBusinesses.set(businesses);
        localStorage.setItem(AVAILABLE_BUSINESSES_KEY, JSON.stringify(businesses));

        if (data.active_business_id) {
          const matched = businesses.find(b => b.id === data.active_business_id);
          if (matched) {
            this.activeBusiness.set(matched);
            localStorage.setItem(ACTIVE_BUSINESS_KEY, JSON.stringify(matched));
          }
        }
      })
    );
  }

  switchBusiness(businessId: string): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/switch-business`, { businessId }).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed switching business context');
        return res.data;
      }),
      tap(data => {
        if (data.token) {
          this.token.set(data.token);
          localStorage.setItem(TOKEN_KEY, data.token);
        }
        if (data.business) {
          this.activeBusiness.set(data.business);
          localStorage.setItem(ACTIVE_BUSINESS_KEY, JSON.stringify(data.business));
        }
        if (data.trust_radar) {
          this.trustRadar.set(data.trust_radar);
        }
        this.notificationService.showSuccess(`Switched context to ${data.business?.name || 'new business'}`);
      })
    );
  }

  updateProfile(payload: {
    full_name?: string;
    email?: string;
    phone?: string;
    default_currency?: string;
    business_name?: string;
    address?: string;
  }): Observable<any> {
    return this.http.put<ApiResponse<any>>(`${this.apiUrl}/me`, payload).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed updating profile');
        return res.data;
      }),
      tap(data => {
        if (data.user) {
          this.currentUser.set(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        }
        if (data.business) {
          this.activeBusiness.set(data.business);
          localStorage.setItem(ACTIVE_BUSINESS_KEY, JSON.stringify(data.business));
        }
        this.notificationService.showSuccess('Profile information saved successfully');
      })
    );
  }

  uploadAvatar(file: File): Observable<{ avatar_url: string; user: User }> {
    const formData = new FormData();
    formData.append('avatar', file);
    return this.http.post<ApiResponse<{ avatar_url: string; user: User }>>(`${this.apiUrl}/avatar`, formData).pipe(
      map(res => {
        if (!res.success || !res.data) throw new Error(res.error?.message || 'Failed uploading profile photo to Cloudinary');
        return res.data;
      }),
      tap(data => {
        if (data.user) {
          this.currentUser.set(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        } else if (data.avatar_url && this.currentUser()) {
          const updated = { ...this.currentUser()!, avatar_url: data.avatar_url };
          this.currentUser.set(updated);
          localStorage.setItem(USER_KEY, JSON.stringify(updated));
        }
        this.notificationService.showSuccess('Profile photo uploaded to Cloudinary');
      })
    );
  }

  removeAvatar(): Observable<any> {
    return this.http.delete<ApiResponse<{ avatar_url: null; user: User }>>(`${this.apiUrl}/avatar`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed removing profile photo');
        return res.data;
      }),
      tap(data => {
        if (data?.user) {
          this.currentUser.set(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        } else if (this.currentUser()) {
          const updated = { ...this.currentUser()!, avatar_url: null };
          this.currentUser.set(updated);
          localStorage.setItem(USER_KEY, JSON.stringify(updated));
        }
        this.notificationService.showSuccess('Profile photo removed');
      })
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(ACTIVE_BUSINESS_KEY);
    localStorage.removeItem(AVAILABLE_BUSINESSES_KEY);
    localStorage.removeItem(ACTIVE_PERSONA_KEY);

    this.token.set(null);
    this.currentUser.set(null);
    this.activeBusiness.set(null);
    this.availableBusinesses.set([]);
    this.activePersona.set('buyer');
    this.trustRadar.set(null);

    this.router.navigate(['/auth/login']);
  }

  getToken(): string | null {
    return this.token();
  }

  setSession(session: AuthSession): void {
    this.token.set(session.token);
    this.currentUser.set(session.user);
    this.activeBusiness.set(session.business);
    this.availableBusinesses.set(session.available_businesses);
    const persona = session.active_persona || session.user?.active_persona || 'buyer';
    this.activePersona.set(persona);
    if (session.trust_radar) {
      this.trustRadar.set(session.trust_radar);
    }

    localStorage.setItem(TOKEN_KEY, session.token);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    localStorage.setItem(ACTIVE_PERSONA_KEY, persona);

    if (session.business) {
      localStorage.setItem(ACTIVE_BUSINESS_KEY, JSON.stringify(session.business));
    }
    if (session.available_businesses) {
      localStorage.setItem(AVAILABLE_BUSINESSES_KEY, JSON.stringify(session.available_businesses));
    }
  }

  private getStoredToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private getStoredUser(): User | null {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private getStoredBusiness(): Business | null {
    try {
      const data = localStorage.getItem(ACTIVE_BUSINESS_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  private getStoredAvailableBusinesses(): Business[] {
    try {
      const data = localStorage.getItem(AVAILABLE_BUSINESSES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private getStoredPersona(): 'buyer' | 'seller' {
    try {
      const data = localStorage.getItem(ACTIVE_PERSONA_KEY);
      return data === 'seller' ? 'seller' : 'buyer';
    } catch {
      return 'buyer';
    }
  }
}
