/**
 * Math utilities for Snacktorio (fraction evaluation, GCD, CEILING.MATH)
 */

export function parseFractionOrNumber(val: string | number | undefined | null): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  
  let s = val.toString().trim();
  if (s.startsWith('=')) s = s.substring(1).trim();
  
  if (s.includes('/')) {
    const parts = s.split('/');
    if (parts.length === 2) {
      const num = parseFloat(parts[0]);
      const den = parseFloat(parts[1]);
      if (den !== 0 && !isNaN(num) && !isNaN(den)) {
        return num / den;
      }
    }
  }
  
  const parsed = parseFloat(s);
  return isNaN(parsed) ? 0 : parsed;
}

export function formatFractionOrDecimal(num: number, originalStr?: string | number): string {
  if (originalStr) {
    const s = originalStr.toString();
    if (s.includes('/')) return s.startsWith('=') ? s.substring(1) : s;
  }
  if (Math.abs(num - 1/3) < 1e-4) return '1/3';
  if (Math.abs(num - 2/3) < 1e-4) return '2/3';
  if (Math.abs(num - 1/6) < 1e-4) return '1/6';
  if (Math.abs(num - 2/11) < 1e-4) return '2/11';
  if (Math.abs(num - 4/15) < 1e-4) return '4/15';
  if (Math.abs(num - 3/5) < 1e-4) return '3/5';
  
  if (Number.isInteger(num)) return num.toString();
  return Number(num.toFixed(3)).toString();
}

export function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

export function gcdArray(arr: number[]): number {
  const filtered = arr.filter(n => n > 0);
  if (filtered.length === 0) return 1;
  let result = filtered[0];
  for (let i = 1; i < filtered.length; i++) {
    result = gcd(result, filtered[i]);
    if (result === 1) return 1;
  }
  return result;
}
