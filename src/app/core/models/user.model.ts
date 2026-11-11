import { Business } from './business.model';

export interface User {
  id: string;
  phone?: string | null;
  email?: string;
  full_name: string;
  avatar_url?: string | null;
  account_type?: 'individual' | 'corporate';
  country_code?: string;
  default_currency?: string;
  active_persona?: 'buyer' | 'seller';
  phone_verified?: boolean;
  phone_verified_at?: string | null;
  is_verified?: boolean;
  is_id_verified?: boolean;
  is_biometric_verified?: boolean;
  biometric_confidence?: number;
  biometric_verified_at?: string | null;
  kyc_tier?: 'tier_1' | 'tier_2' | 'tier_3';
  nin_hash?: string | null;
  created_at?: string;
}

export interface TrustRadarBadge {
  status: 'safe' | 'provisional' | 'unsafe';
  label: string;
  color: string;
  bg: string;
  icon: string;
  description: string;
}

export interface TrustRadarResult {
  score: number;
  status: 'safe' | 'provisional' | 'unsafe';
  badge: TrustRadarBadge;
  openDisputes?: number;
  completedDeals?: number;
  canCreateDeals: boolean;
  warningBanner?: string | null;
  isDojahVerified?: boolean;
}

export interface AuthSession {
  user: User;
  business: Business | null;
  available_businesses: Business[];
  active_persona?: 'buyer' | 'seller';
  trust_radar?: TrustRadarResult | null;
  token: string;
}
