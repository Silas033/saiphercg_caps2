import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-config.js';

const loginView = document.querySelector('.view-login');
const passwordInput = document.querySelector('#password');
const loginForm = document.querySelector('#login-form');

const isConfigured = SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY && !SUPABASE_URL.includes('YOUR_PROJECT') && !SUPABASE_PUBLISHABLE_KEY.includes('YOUR_');
const supabase = isConfigured ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY) : null;

function setMessage(id, message, isError = false) {
  const element = document.querySelector(id);
  element.textContent = message;
  element.style.color = isError ? '#cc3e55' : '';
}

function setSubmitting(form, submitting) {
  const button = form.querySelector('[type="submit"]');
  button.disabled = submitting;
  button.textContent = submitting ? 'Please wait…' : button.dataset.label;
}

for (const form of [loginForm]) {
  const button = form.querySelector('[type="submit"]');
  button.dataset.label = button.textContent;
}

if (!isConfigured) {
  setMessage('#login-message', 'Supabase has not been configured. Add your project URL and publishable key to supabase-config.js.', true);
}

document.querySelector('#toggle-password').addEventListener('click', (event) => {
  const showing = passwordInput.type === 'text';
  passwordInput.type = showing ? 'password' : 'text';
  event.currentTarget.textContent = showing ? 'Show' : 'Hide';
  event.currentTarget.setAttribute('aria-label', `${showing ? 'Show' : 'Hide'} password`);
});

function validateEmail(input, error) {
  if (!input.value.trim()) {
    error.textContent = 'Enter your administrator email.';
    return false;
  }
  if (!input.validity.valid) {
    error.textContent = 'Enter a valid email address.';
    return false;
  }
  error.textContent = '';
  return true;
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const email = document.querySelector('#email');
  const passwordError = document.querySelector('#password-error');
  const validEmail = validateEmail(email, document.querySelector('#email-error'));
  const validPassword = passwordInput.value.length >= 6;
  passwordError.textContent = validPassword ? '' : 'Enter a password with at least 6 characters.';
  if (!validEmail || !validPassword || !supabase) return;
  setSubmitting(loginForm, true);
  setMessage('#login-message', '');
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: passwordInput.value });
    if (error) throw error;
    const { data: profile, error: profileError } = await supabase.from('profiles').select('is_admin, is_active').eq('id', data.user.id).maybeSingle();
    if (profileError) throw profileError;
    if (!profile?.is_admin || !profile.is_active) {
      await supabase.auth.signOut();
      throw new Error('This account is not approved for dashboard access.');
    }
    setMessage('#login-message', 'Signed in successfully. Your administrator account is approved.');
  } catch (error) {
    setMessage('#login-message', error.message || 'Unable to sign in. Please try again.', true);
  } finally {
    setSubmitting(loginForm, false);
  }
});
