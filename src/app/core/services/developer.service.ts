import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../models/api-response.model';
import { ApiKey, WebhookEndpoint, WebhookDelivery } from '../models/developer.model';

@Injectable({
  providedIn: 'root'
})
export class DeveloperService {
  private http = inject(HttpClient);
  private developerUrl = `${environment.apiUrl}/developer`;
  private webhooksUrl = `${environment.apiUrl}/webhooks`;

  /**
   * List all API keys for active business
   */
  getApiKeys(): Observable<ApiKey[]> {
    return this.http.get<ApiResponse<{ count: number; keys: ApiKey[] }>>(`${this.developerUrl}/keys`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed to fetch API keys');
        return res.data?.keys || [];
      })
    );
  }

  /**
   * Generate a new API Key (live or test)
   */
  createApiKey(payload: {
    name: string;
    environment: 'live' | 'test';
    scopes?: string[];
  }): Observable<ApiKey> {
    return this.http.post<ApiResponse<ApiKey>>(`${this.developerUrl}/keys`, payload).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed to generate API key');
        return res.data;
      })
    );
  }

  /**
   * Revoke an active API key
   */
  revokeApiKey(keyId: string): Observable<any> {
    return this.http.delete<ApiResponse<any>>(`${this.developerUrl}/keys/${keyId}`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed to revoke API key');
        return res.data;
      })
    );
  }

  /**
   * List all registered webhook endpoints
   */
  getWebhooks(): Observable<WebhookEndpoint[]> {
    return this.http.get<ApiResponse<{ count: number; endpoints: WebhookEndpoint[] }>>(this.webhooksUrl).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed to fetch webhooks');
        return res.data?.endpoints || [];
      })
    );
  }

  /**
   * Register a new webhook endpoint
   */
  registerWebhook(payload: {
    url: string;
    events: string[];
  }): Observable<WebhookEndpoint> {
    return this.http.post<ApiResponse<WebhookEndpoint>>(this.webhooksUrl, payload).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed to register webhook');
        return res.data;
      })
    );
  }

  /**
   * Delete a webhook endpoint
   */
  deleteWebhook(endpointId: string): Observable<any> {
    return this.http.delete<ApiResponse<any>>(`${this.webhooksUrl}/${endpointId}`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed to delete webhook');
        return res.data;
      })
    );
  }

  /**
   * Fetch recent delivery logs for a webhook endpoint
   */
  getWebhookDeliveries(endpointId: string): Observable<WebhookDelivery[]> {
    return this.http.get<ApiResponse<{ count: number; deliveries: WebhookDelivery[] }>>(`${this.webhooksUrl}/${endpointId}/deliveries`).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed to fetch deliveries');
        return res.data?.deliveries || [];
      })
    );
  }

  /**
   * Dispatch a test ping delivery to verify endpoint responsiveness
   */
  testWebhookPing(endpointId: string): Observable<any> {
    return this.http.post<ApiResponse<any>>(`${this.developerUrl}/webhooks/${endpointId}/test-ping`, {}).pipe(
      map(res => {
        if (!res.success) throw new Error(res.error?.message || 'Failed to dispatch test webhook');
        return res.data;
      })
    );
  }
}
