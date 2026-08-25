import type { AuthError } from '@supabase/supabase-js';

const ERROR_MAP: Record<string, string> = {
  'Invalid login credentials':
    'Incorrect email or password. Please check your details and try again.',
  'Email not confirmed':
    'Your email hasn\'t been verified yet. Check your inbox for the confirmation link.',
  'User already registered':
    'An account with this email already exists. Try signing in instead.',
  'Password should be at least 6 characters':
    'Password must be at least 6 characters long.',
  'Unable to validate email address: invalid format':
    'Please enter a valid email address.',
  'For security purposes, you can only request this once every 60 seconds':
    'Too many requests. Please wait a minute before trying again.',
  'New password should be different from the old password':
    'Your new password must be different from your current one.',
  'Token has expired or is invalid':
    'This link has expired. Please request a new one.',
  'Signup requires a valid password':
    'Please enter a valid password.',
};

export function getAuthErrorMessage(error: AuthError | Error): string {
  const raw = error.message || String(error);

  // Check mapped errors first
  for (const [key, msg] of Object.entries(ERROR_MAP)) {
    if (raw.includes(key)) return msg;
  }

  // Network / fetch failures
  if (
    raw.includes('Failed to fetch') ||
    raw.includes('ERR_NAME_NOT_RESOLVED') ||
    raw.includes('ERR_NETWORK') ||
    raw.includes('NetworkError') ||
    raw.includes('Load failed')
  ) {
    return 'Unable to reach the server. Please check your internet connection and try again.';
  }

  // Rate limiting
  if (raw.includes('429') || raw.includes('rate limit')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }

  // Fallback — show a cleaned-up version of the original
  return raw.length > 120 ? 'Something went wrong. Please try again.' : raw;
}
