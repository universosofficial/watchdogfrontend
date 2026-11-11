export type VerificationTier = 'tier_1' | 'tier_2' | 'tier_3';

export interface TierDetail {
  name: string;
  max_deal_amount: number | null;
  max_deal_amount_label: string;
  currency: string;
  badge: string;
  description: string;
  is_unlocked: boolean;
}

export interface BankVerificationLog {
  id: string;
  account_number: string;
  bank_code: string;
  resolved_name: string;
  match_score: number;
  status: 'passed' | 'mismatch_rejected' | 'corporate_flagged';
  is_biometric_matched: boolean;
  created_at: string;
}

export interface VerificationStatus {
  user: {
    id: string;
    full_name: string;
    account_type: 'individual' | 'corporate';
    phone: string | null;
    phone_verified: boolean;
    is_biometric_verified?: boolean;
    biometric_confidence?: number | null;
    biometric_verified_at?: string | null;
    kyc_tier: VerificationTier;
  };
  business: {
    id: string;
    name: string;
    entity_type?: 'individual' | 'corporate';
    rc_number?: string | null;
    bank_name?: string | null;
    bank_code?: string | null;
    verified_account_number?: string | null;
    verified_account_name?: string | null;
    is_bank_verified?: boolean;
    bank_verified_at?: string | null;
    is_biometric_verified?: boolean;
    trust_score?: number;
    trust_status?: string;
    business_tier: VerificationTier;
  } | null;
  account_type: 'individual' | 'corporate';
  is_verified: boolean;
  is_complete: boolean;
  verification_checklist: {
    account_type: 'individual' | 'corporate';
    phone_verified: boolean;
    biometric_verified: boolean;
    bank_verified: boolean;
    is_complete: boolean;
    required_step?: number;
  };
  verification_gate_message?: string | null;
  active_tier: VerificationTier;
  tier_details: TierDetail;
  thresholds: Record<VerificationTier, TierDetail>;
  recent_verifications: BankVerificationLog[];
}

export interface OtpResponse {
  message: string;
  phone: string;
  expires_in_seconds: number;
  debug_otp?: string;
}

export interface BiometricVerificationResult {
  success: boolean;
  message: string;
  liveness_score: number;
  similarity_score?: number;
  is_mock?: boolean;
  trust_radar?: any;
}

export interface BankAnchorResult {
  success: boolean;
  message: string;
  bank_anchor: {
    bank_name: string;
    bank_code: string;
    verified_account_number: string;
    verified_account_name: string;
    is_bank_verified: boolean;
    is_biometric_verified: boolean;
    match_score: number;
    is_corporate_account: boolean;
  };
}
