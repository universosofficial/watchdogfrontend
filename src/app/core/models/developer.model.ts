export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  environment: 'live' | 'test';
  scopes: string[];
  last_used_at: string | null;
  is_active: boolean | number;
  created_at: string;
  created_by_name?: string;
  api_key?: string; // Only present immediately after generation
}

export interface WebhookEndpoint {
  id: string;
  business_id: string;
  url: string;
  secret_key: string;
  events_json: string[] | string;
  is_active: boolean | number;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  endpoint_id: string;
  event_type: string;
  payload_json: any;
  response_status: number;
  response_body: string;
  attempt_count: number;
  status: 'success' | 'failed';
  created_at: string;
}
