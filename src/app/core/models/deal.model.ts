export type DealStatus =
  | 'draft'
  | 'awaiting_acceptance'
  | 'active'
  | 'disputed'
  | 'completed'
  | 'cancelled'
  | 'terminated';

export interface Deal {
  id: string;
  reference_no: string;
  title: string;
  description?: string | null;
  amount: number;
  currency: string;
  status: DealStatus;
  current_version: number;
  cure_status?: 'none' | 'cure_period_active' | 'cured' | 'defaulted_escalated';
  cure_deadline?: string | null;
  breach_reported_at?: string | null;
  breach_reason?: string | null;
  regulatory_dossier_hash?: string | null;
  wws_case_reference?: string | null;
  wws_escalated_at?: string | null;
  wws_receipt_json?: any;
  created_at: string;
  updated_at: string;
  creator_business_id: string;
  creator_business_name?: string;
  counterparty_business_id?: string | null;
  counterparty_business_name?: string | null;
  caller_role?: 'creator' | 'counterparty';
  agreement_version?: {
    id: string;
    version_number: number;
    terms_text: string;
    created_by_business_id: string;
  };
  invitation?: {
    id: string;
    invited_email: string;
    token: string;
    status: string;
    expires_in_days?: number;
  };
}

export interface AgreementVersion {
  id: string;
  version_number: number;
  terms_text: string;
  created_by_business_id: string;
  created_by_business_name?: string;
  created_at: string;
}

export interface AcceptanceRecord {
  id: string;
  business_id: string;
  user_id: string;
  accepted_at: string;
  ip_address?: string;
  user_name?: string;
  user_email?: string;
  business_name?: string;
}

export interface AcceptancesStatus {
  version_id: string;
  version_number: number;
  creator_accepted: boolean;
  counterparty_accepted: boolean;
  fully_accepted: boolean;
  acceptances: AcceptanceRecord[];
}

export interface Obligation {
  id: string;
  deal_id: string;
  title: string;
  description?: string | null;
  type: 'payment' | 'delivery' | 'inspection' | 'document' | 'service';
  status: 'not_started' | 'in_progress' | 'submitted_for_review' | 'completed' | 'disputed';
  responsible_business_id: string;
  responsible_business_name?: string;
  due_date: string;
  original_due_date?: string;
  completion_date?: string | null;
  is_overdue?: boolean;
  created_at: string;
}

export interface EvidenceRecord {
  id: string;
  deal_id: string;
  obligation_id?: string | null;
  uploaded_by_business_id: string;
  uploaded_by_user_id: string;
  file_name: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  verification_tier: 'submitted' | 'verified' | 'rejected';
  description?: string | null;
  created_at: string;
  uploader_name?: string;
  uploader_business_name?: string;
}

export interface SettlementDetails {
  isBankVerified: boolean;
  bankName: string | null;
  bankCode?: string | null;
  accountNumber: string | null;
  verifiedBeneficiary: string | null;
  warning: string;
}

export interface PaymentRecord {
  id: string;
  deal_id: string;
  obligation_id?: string | null;
  evidence_id?: string | null;
  payer_business_id: string;
  recipient_business_id: string;
  expected_amount: number;
  reported_amount: number;
  currency: string;
  reference_no: string;
  destination_bank_name?: string | null;
  destination_account_number?: string | null;
  destination_account_name?: string | null;
  beneficiary_match_confirmed?: boolean;
  status: 'reported' | 'acknowledged' | 'confirmed' | 'disputed';
  paid_at: string;
  payer_notes?: string | null;
  confirmation_notes?: string | null;
  created_at: string;
  payer_business_name?: string;
  recipient_business_name?: string;
  receipt_url?: string | null;
}

export interface PaymentSummary {
  total_agreed_amount: number;
  total_reported: number;
  total_confirmed: number;
  outstanding_balance: number;
  currency: string;
  payments: PaymentRecord[];
}

export interface DeliveryRecord {
  id: string;
  deal_id: string;
  obligation_id?: string | null;
  evidence_id?: string | null;
  sender_business_id: string;
  recipient_business_id: string;
  tracking_ref: string;
  carrier?: string | null;
  dispatch_date: string;
  items_json?: any;
  items?: Array<{ name: string; quantity: number; unit?: string }>;
  receipt_date?: string | null;
  delivery_reference?: string | null;
  status: 'dispatched' | 'in_transit' | 'delivered' | 'accepted' | 'confirmed' | 'acknowledged_with_discrepancy' | 'disputed';
  notes?: string | null;
  discrepancy_notes?: string | null;
  created_at: string;
  sender_business_name?: string;
  recipient_business_name?: string;
  waybill_url?: string | null;
}

export interface DisputeRecord {
  id: string;
  deal_id: string;
  obligation_id?: string | null;
  raised_by_business_id: string;
  raised_by_user_id: string;
  category: 'payment_default' | 'delivery_delay' | 'defect' | 'terms_breach' | 'other';
  description: string;
  status: 'open' | 'awaiting_response' | 'under_review' | 'resolution_proposed' | 'resolved' | 'unresolved';
  response_notes?: string | null;
  resolution_notes?: string | null;
  wws_case_reference?: string | null;
  wws_escalated_at?: string | null;
  wws_escalated_by?: string | null;
  wws_receipt_json?: any;
  created_at: string;
  updated_at?: string;
  raised_by_business_name?: string;
  raised_by_user_name?: string;
}

export interface DealDetailsResponse {
  deal: Deal;
  settlementDetails?: SettlementDetails;
  settlement_details?: SettlementDetails;
  access_role: 'creator' | 'counterparty';
  participants: {
    creator: {
      id: string;
      name: string;
      phone?: string | null;
      rc_number?: string;
      verification_status: string;
      business_tier?: 'tier_1' | 'tier_2' | 'tier_3';
      cac_status?: string;
      tier_badge?: string;
      is_bank_verified?: boolean;
      is_biometric_verified?: boolean;
    };
    counterparty: {
      id: string;
      name: string;
      phone?: string | null;
      rc_number?: string;
      verification_status: string;
      business_tier?: 'tier_1' | 'tier_2' | 'tier_3';
      cac_status?: string;
      tier_badge?: string;
      is_bank_verified?: boolean;
      is_biometric_verified?: boolean;
    } | null;
    caller_role: 'creator' | 'counterparty';
    has_unverified_party?: boolean;
  };
  current_version: AgreementVersion;
  all_versions?: AgreementVersion[];
  acceptances_status: AcceptancesStatus;
  invitations?: Array<{
    id: string;
    invited_email: string;
    token: string;
    status: string;
    expires_at: string;
  }>;
  obligations?: Obligation[];
  payments?: PaymentRecord[];
  deliveries?: DeliveryRecord[];
  disputes?: DisputeRecord[];
  evidence?: Array<EvidenceRecord & { preview_url?: string; notes?: string | null }>;
}

export interface DashboardMetrics {
  active_deals: number;
  awaiting_acceptance: number;
  outstanding_obligations: number;
  overdue_items: number;
  open_disputes: number;
  draft_deals: number;
  completed_deals: number;
  total_deals: number;
}

export interface ActivityLog {
  id: string;
  deal_id: string;
  actor_user_id: string;
  actor_business_id: string;
  event_type: string;
  details_json: string;
  details?: Record<string, any>;
  created_at: string;
  actor_name?: string;
  actor_business_name?: string;
  deal_title?: string;
  deal_reference_no?: string;
}

export interface DashboardSummary {
  metrics: DashboardMetrics;
  recent_activities: ActivityLog[];
}

export interface CreateDealRequest {
  title: string;
  description?: string;
  counterparty_business_id?: string;
  counterparty_phone?: string;
  invited_phone?: string;
  invited_email?: string;
  amount: number;
  currency: string;
  terms_text?: string;
  expected_delivery_date?: string;
}
