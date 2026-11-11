import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Deal,
  DashboardSummary,
  CreateDealRequest,
  DealDetailsResponse,
  Obligation,
  EvidenceRecord,
  PaymentSummary,
  PaymentRecord,
  DeliveryRecord,
  DisputeRecord,
  ActivityLog
} from '../models/deal.model';
import { ApiResponse } from '../models/api-response.model';

@Injectable({
  providedIn: 'root'
})
export class DealService {
  private http = inject(HttpClient);
  public apiUrl = `${environment.apiUrl}/deals`;

  getDashboardSummary(): Observable<DashboardSummary> {
    return this.http.get<ApiResponse<DashboardSummary>>(`${this.apiUrl}/dashboard/summary`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed loading dashboard summary');
        return res.data;
      })
    );
  }

  listDeals(params: { status?: string; page?: number; limit?: number } = {}): Observable<{ deals: Deal[]; pagination: any }> {
    let httpParams = new HttpParams();
    if (params.status && params.status !== 'all') {
      httpParams = httpParams.set('status', params.status);
    }
    if (params.page) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params.limit) {
      httpParams = httpParams.set('limit', params.limit.toString());
    }

    return this.http.get<ApiResponse<{ deals: Deal[]; pagination: any }>>(this.apiUrl, { params: httpParams }).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed loading deals');
        return res.data;
      })
    );
  }

  getDealById(dealId: string): Observable<DealDetailsResponse> {
    return this.http.get<ApiResponse<DealDetailsResponse>>(`${this.apiUrl}/${dealId}`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed loading deal details');
        return res.data;
      })
    );
  }

  getPublicDealPreview(dealId: string): Observable<any> {
    return this.http.get<ApiResponse<any>>(`${this.apiUrl}/public/${dealId}`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed loading deal preview');
        return res.data;
      })
    );
  }

  createDeal(payload: CreateDealRequest): Observable<Deal> {
    return this.http.post<ApiResponse<Deal>>(this.apiUrl, payload).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed creating deal');
        return res.data;
      })
    );
  }

  updateTerms(dealId: string, termsText: string): Observable<any> {
    return this.http.put<ApiResponse<any>>(`${this.apiUrl}/${dealId}/terms`, { terms_text: termsText }).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed updating terms');
        return res.data;
      })
    );
  }

  acceptDeal(dealId: string): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/${dealId}/accept`, {}).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed accepting deal');
        return res.data;
      })
    );
  }

  simulatePartnerAccept(dealId: string): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/${dealId}/simulate-accept`, {}).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed simulating accept');
        return res.data;
      })
    );
  }

  sendInvitation(dealId: string, invitedEmail: string): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/${dealId}/invite`, { invited_email: invitedEmail }).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed sending invitation');
        return res.data;
      })
    );
  }

  completeDeal(dealId: string, reason?: string): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/${dealId}/complete`, { reason }).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed completing deal');
        return res.data;
      })
    );
  }

  transitionDealStatus(dealId: string, targetStatus: string, reason?: string): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/${dealId}/transition`, { target_status: targetStatus, reason }).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed transitioning deal status');
        return res.data;
      })
    );
  }

  // --- Obligations ---
  listObligations(dealId: string): Observable<Obligation[]> {
    return this.http.get<ApiResponse<any>>(`${this.apiUrl}/${dealId}/obligations`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed listing obligations');
        return res.data?.obligations || res.data || [];
      })
    );
  }

  createObligation(dealId: string, payload: {
    title: string;
    description?: string;
    responsible_business_id: string;
    type: string;
    due_date: string;
  }): Observable<Obligation> {
    return this.http.post<ApiResponse<Obligation>>(`${this.apiUrl}/${dealId}/obligations`, payload).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed creating obligation');
        return res.data;
      })
    );
  }

  updateObligationStatus(dealId: string, obligationId: string, status: string, notes?: string): Observable<any> {
    return this.http.patch<ApiResponse<any>>(`${this.apiUrl}/${dealId}/obligations/${obligationId}/status`, { status, notes }).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed updating obligation status');
        return res.data;
      })
    );
  }

  extendObligationDeadline(dealId: string, obligationId: string, newDueDate: string, reason: string): Observable<any> {
    return this.http.patch<ApiResponse<any>>(`${this.apiUrl}/${dealId}/obligations/${obligationId}/extend-deadline`, {
      new_due_date: newDueDate,
      reason
    }).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed extending deadline');
        return res.data;
      })
    );
  }

  // --- Evidence ---
  listEvidence(dealId: string): Observable<EvidenceRecord[]> {
    return this.http.get<ApiResponse<any>>(`${this.apiUrl}/${dealId}/evidence`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed listing evidence');
        return res.data?.evidence || res.data || [];
      })
    );
  }

  uploadEvidence(dealId: string, formData: FormData): Observable<EvidenceRecord> {
    return this.http.post<ApiResponse<EvidenceRecord>>(`${this.apiUrl}/${dealId}/evidence`, formData).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed uploading evidence');
        return res.data;
      })
    );
  }

  downloadEvidenceBlob(dealId: string, evidenceId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${dealId}/evidence/${evidenceId}/download`, {
      responseType: 'blob'
    });
  }

  // --- Payments ---
  getPaymentSummary(dealId: string): Observable<PaymentSummary> {
    return this.http.get<ApiResponse<PaymentSummary>>(`${this.apiUrl}/${dealId}/payments`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed loading payment records');
        return res.data;
      })
    );
  }

  recordPayment(dealId: string, payload: {
    expected_amount?: number;
    reported_amount: number;
    currency?: string;
    reference_no?: string;
    external_reference?: string;
    payment_method?: string;
    sending_institution?: string;
    recipient_institution?: string;
    paid_at?: string;
    transfer_timestamp?: string;
    destination_bank_name?: string;
    destination_account_number?: string;
    destination_account_name?: string;
    beneficiary_match_confirmed?: boolean;
    obligation_id?: string;
    evidence_id?: string;
    payer_notes?: string;
    notes?: string;
  }): Observable<PaymentRecord> {
    return this.http.post<ApiResponse<PaymentRecord>>(`${this.apiUrl}/${dealId}/payments`, payload).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed recording payment');
        return res.data;
      })
    );
  }

  updatePaymentStatus(
    dealId: string, 
    paymentId: string, 
    status: 'acknowledged' | 'confirmed' | 'disputed', 
    confirmationNotes?: string,
    attestationStatement?: string
  ): Observable<any> {
    return this.http.patch<ApiResponse<any>>(`${this.apiUrl}/${dealId}/payments/${paymentId}/status`, {
      status,
      confirmation_notes: confirmationNotes,
      attestation_statement: attestationStatement
    }).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed updating payment status');
        return res.data;
      })
    );
  }

  // --- Deliveries ---
  listDeliveries(dealId: string): Observable<DeliveryRecord[]> {
    return this.http.get<ApiResponse<any>>(`${this.apiUrl}/${dealId}/deliveries`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed listing delivery records');
        return res.data?.deliveries || res.data || [];
      })
    );
  }

  recordDelivery(dealId: string, payload: {
    tracking_ref?: string;
    delivery_reference?: string;
    carrier?: string;
    dispatch_date: string;
    items: Array<{ name: string; quantity: number; unit?: string }>;
    obligation_id?: string;
    evidence_id?: string;
    notes?: string;
  }): Observable<DeliveryRecord> {
    const postBody = {
      ...payload,
      delivery_reference: payload.delivery_reference || payload.tracking_ref || `WAYBILL-${Date.now()}`
    };
    return this.http.post<ApiResponse<DeliveryRecord>>(`${this.apiUrl}/${dealId}/deliveries`, postBody).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed recording delivery dispatch');
        return res.data;
      })
    );
  }

  updateDeliveryStatus(dealId: string, deliveryId: string, status: string, discrepancyNotes?: string): Observable<any> {
    return this.http.patch<ApiResponse<any>>(`${this.apiUrl}/${dealId}/deliveries/${deliveryId}/status`, {
      status,
      discrepancy_notes: discrepancyNotes
    }).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed updating delivery status');
        return res.data;
      })
    );
  }

  // --- Disputes ---
  listDisputes(dealId: string): Observable<DisputeRecord[]> {
    return this.http.get<ApiResponse<any>>(`${this.apiUrl}/${dealId}/disputes`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed listing disputes');
        return res.data?.disputes || res.data || [];
      })
    );
  }

  openDispute(dealId: string, payload: {
    category: string;
    description: string;
    obligation_id?: string;
    evidence_ids?: string[];
  }): Observable<DisputeRecord> {
    return this.http.post<ApiResponse<DisputeRecord>>(`${this.apiUrl}/${dealId}/disputes`, payload).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed raising dispute');
        return res.data;
      })
    );
  }

  raiseDispute(dealId: string, payload: {
    category: string;
    description: string;
    obligation_id?: string;
    evidence_ids?: string[];
  }): Observable<DisputeRecord> {
    return this.openDispute(dealId, payload);
  }

  respondToDispute(dealId: string, disputeId: string, payload: {
    response_notes: string;
    counter_proposals?: string;
    target_status?: string;
  }): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/${dealId}/disputes/${disputeId}/response`, payload).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed submitting dispute response');
        return res.data;
      })
    );
  }

  resolveDispute(dealId: string, disputeId: string, payload: {
    resolution_notes: string;
    target_deal_status?: string;
  }): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.apiUrl}/${dealId}/disputes/${disputeId}/resolve`, payload).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed resolving dispute');
        return res.data;
      })
    );
  }

  // --- World Wide Security (WWS) Global Escalation ---
  escalateToWws(dealId: string, disputeId: string, payload: {
    escalationReason: string;
    incidentCategory?: string;
    approvedFields?: string[];
    authorityConfirmed: boolean;
  }): Observable<{ success: boolean; case_reference: string; receipt: any; message: string }> {
    return this.http.post<ApiResponse<any>>(
      `${environment.apiUrl}/enforcement/deals/${dealId}/disputes/${disputeId}/escalate-wws`,
      payload
    ).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed escalating dispute to WWS');
        return res.data;
      })
    );
  }

  getWwsStatus(dealId: string): Observable<any> {
    return this.http.get<ApiResponse<any>>(
      `${environment.apiUrl}/enforcement/deals/${dealId}/wws-status`
    ).pipe(
      map(res => res.data)
    );
  }

  // --- Audit Timeline & Cryptographic Verification ---
  getDealActivity(dealId: string): Observable<ActivityLog[]> {
    return this.http.get<ApiResponse<any[]>>(`${this.apiUrl}/${dealId}/activity`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed loading deal activity timeline');
        const list = res.data || [];
        return list.map(item => ({
          ...item,
          details: typeof item.details_json === 'string' ? JSON.parse(item.details_json) : (item.details_json || item.details)
        }));
      })
    );
  }

  verifyAuditChain(dealId: string): Observable<{ valid: boolean; totalVerified?: number; brokenAtIndex?: number }> {
    return this.http.get<ApiResponse<any>>(`${this.apiUrl}/${dealId}/audit-chain/verify`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed verifying cryptographic audit chain');
        return res.data;
      })
    );
  }

  getSignedEvidenceUrl(dealId: string, evidenceId: string): Observable<{ url: string; expires_at: string }> {
    return this.http.get<ApiResponse<{ url: string; expires_at: string }>>(`${this.apiUrl}/${dealId}/evidence/${evidenceId}/signed-url`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed obtaining pre-signed media link');
        return res.data;
      })
    );
  }
}
