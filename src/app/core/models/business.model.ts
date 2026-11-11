export interface Business {
  id: string;
  name: string;
  entity_type?: 'individual' | 'corporate';
  country_code?: string;
  rc_number?: string | null;
  address?: string | null;
  verification_status: 'unverified' | 'pending' | 'verified';
  cac_status?: 'unverified' | 'pending' | 'verified' | 'rejected';
  cac_verified_at?: string | null;
  dojah_verification_id?: string | null;
  tax_identification_number?: string | null;
  business_tier?: 'tier_1' | 'tier_2' | 'tier_3';
  trust_score?: number;
  trust_status?: 'safe' | 'provisional' | 'unsafe';
  role?: 'owner' | 'staff';
  bank_name?: string | null;
  bank_code?: string | null;
  verified_account_number?: string | null;
  verified_account_name?: string | null;
  is_bank_verified?: boolean;
  bank_verified_at?: string | null;
  is_biometric_verified?: boolean;
  biometric_verified_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BusinessMember {
  id: string;
  user_id: string;
  business_id: string;
  role: 'owner' | 'staff';
  full_name: string;
  email?: string;
  phone?: string | null;
  created_at: string;
}
