export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  NGN: '₦',
  GBP: '£',
  EUR: '€',
  KES: 'KSh ',
  GHS: 'GH₵',
  ZAR: 'R '
};

export function getCurrencySymbol(currency?: string | null): string {
  if (!currency) return '$';
  const code = currency.toUpperCase().trim();
  return CURRENCY_SYMBOLS[code] || `${code} `;
}

export function formatMoneyAmount(
  amount: number | string | null | undefined,
  currency: string = 'USD',
  fractionDigits: number = 0
): string {
  const num = Number(amount || 0);
  const sym = getCurrencySymbol(currency);
  return `${sym}${num.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  })}`;
}
