import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';

export interface BlacklistRecord {
  id: string;
  business_id: string;
  deal_id?: string;
  reference_no: string;
  business_name: string;
  rc_number?: string;
  director_name?: string;
  phone?: string;
  deal_amount: number;
  currency: string;
  covenant_breached: string;
  default_summary: string;
  cure_period_expired_at: string;
  reported_to_fccpc: boolean;
  fccpc_dossier_ref: string;
  reported_to_police_sfu: boolean;
  reported_to_lasrera: boolean;
  reported_to_credit_bureau: boolean;
  status: 'active_default' | 'rectified_settled' | 'disputed_appeal';
  created_at: string;
}

export interface RegistryEntity {
  id: string;
  name: string;
  rc_number?: string;
  entity_type: string;
  verification_status: string;
  reputation_status: 'good_standing' | 'watchdog_cleared' | 'under_cure_review' | 'blacklisted';
  covenants_fulfilled_count: number;
  covenants_defaulted_count: number;
  is_blacklisted: boolean;
  trust_badge: {
    label: string;
    variant: 'success' | 'danger' | 'neutral';
    icon: string;
  };
  default_records: BlacklistRecord[];
}

export interface RegistryStats {
  total_monitored_entities: number;
  watchdog_cleared_entities: number;
  active_blacklisted_defaults: number;
  total_covenants_honored: number;
  total_volume_watched: number;
  enforcement_agencies_integrated: string[];
}

export interface RegulatoryDossier {
  dossier_reference: string;
  statutory_bodies: string[];
  legal_statutes_invoked: string[];
  complainant: {
    business_name: string;
    rc_number: string;
    reported_by_user_id: string;
  };
  respondent_defaulting_entity: {
    business_id: string;
    business_name: string;
    rc_number: string;
    entity_type: string;
    address: string;
  };
  deal_particulars: {
    deal_id: string;
    reference_no: string;
    title: string;
    amount: number;
    currency: string;
    agreement_version: number;
    breach_summary: string;
    cure_initiated_at: string;
    cure_expired_at: string;
  };
  evidence_trail_hash: string;
  generated_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class RegistryService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/registry`;
  private enforcementApiUrl = `${environment.apiUrl}/enforcement`;

  // Signals
  readonly stats = signal<RegistryStats | null>(null);
  readonly blacklistRecords = signal<BlacklistRecord[]>([]);
  readonly loading = signal<boolean>(false);

  /**
   * Search registry for counterparty risk check by name, RC number, or phone
   */
  searchRegistry(query: string): Observable<{ query: string; total_matches: number; results: RegistryEntity[] }> {
    return this.http.get<ApiResponse<{ query: string; total_matches: number; results: RegistryEntity[] }>>(
      `${this.apiUrl}/search`,
      { params: { q: query } }
    ).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Failed to search Watchdog Registry');
        }
        return res.data;
      })
    );
  }

  /**
   * Fetch public blacklist directory of defaulted companies
   */
  fetchBlacklist(limit = 25, offset = 0): Observable<{ total: number; records: BlacklistRecord[] }> {
    this.loading.set(true);
    return this.http.get<ApiResponse<{ total: number; limit: number; offset: number; records: BlacklistRecord[] }>>(
      `${this.apiUrl}/blacklist`,
      { params: { limit, offset } }
    ).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Failed to fetch blacklist records');
        }
        return { total: res.data.total, records: res.data.records };
      }),
      tap(data => {
        this.blacklistRecords.set(data.records);
        this.loading.set(false);
      }),
      catchError(err => {
        this.loading.set(false);
        return throwError(() => err);
      })
    );
  }

  /**
   * Fetch ecosystem statistics
   */
  fetchStats(): Observable<RegistryStats> {
    return this.http.get<ApiResponse<RegistryStats>>(`${this.apiUrl}/stats`).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Failed to fetch registry stats');
        }
        return res.data;
      }),
      tap(data => this.stats.set(data))
    );
  }

  /**
   * Initiate formal 7-Day Cure Notice for a deal
   */
  initiateCureNotice(dealId: string, reason: string, obligationId?: string): Observable<any> {
    return this.http.post<ApiResponse<any>>(
      `${this.enforcementApiUrl}/deals/${dealId}/breach`,
      { reason, obligationId }
    ).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Failed to initiate 7-day cure window');
        }
        return res.data;
      })
    );
  }

  /**
   * Resolve an active cure period amicably
   */
  resolveCure(dealId: string, resolutionNotes: string): Observable<any> {
    return this.http.post<ApiResponse<any>>(
      `${this.enforcementApiUrl}/deals/${dealId}/resolve-cure`,
      { resolutionNotes }
    ).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Failed to resolve cure period');
        }
        return res.data;
      })
    );
  }

  /**
   * Escalate expired cure window to public blacklisting & FCCPC dossier dispatch
   */
  escalateToBlacklist(dealId: string): Observable<{ success: boolean; fccpc_dossier_ref: string; dossier_hash: string; dossier: RegulatoryDossier }> {
    return this.http.post<ApiResponse<any>>(
      `${this.enforcementApiUrl}/deals/${dealId}/escalate-blacklist`,
      {}
    ).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Failed to escalate to blacklisting and FCCPC filing');
        }
        return res.data;
      })
    );
  }

  /**
   * Fetch generated regulatory dossier for a deal
   */
  getRegulatoryDossier(dealId: string): Observable<{ deal_id: string; deal_reference: string; dossier_hash: string; dossier: RegulatoryDossier }> {
    return this.http.get<ApiResponse<any>>(
      `${this.enforcementApiUrl}/deals/${dealId}/dossier`
    ).pipe(
      map(res => {
        if (!res.success || !res.data) {
          throw new Error(res.error?.message || 'Failed to fetch regulatory dossier');
        }
        return res.data;
      })
    );
  }
}
