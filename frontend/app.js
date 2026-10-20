const loginView = document.querySelector('.view-login');
const resetView = document.querySelector('.view-reset');
const passwordInput = document.querySelector('#password');

function showResetView() {
  loginView.hidden = true;
  resetView.hidden = false;
  document.title = 'Set or Reset Password | Saipher Co.';
  document.querySelector('#reset-email').focus();
}

function showLoginView() {
  resetView.hidden = true;
  loginView.hidden = false;
  document.title = 'Dashboard Login | Saipher Co.';
  document.querySelector('#email').focus();
}

document.querySelector('#forgot-button').addEventListener('click', showResetView);
document.querySelector('#back-button').addEventListener('click', showLoginView);

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

document.querySelector('#login-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const email = document.querySelector('#email');
  const passwordError = document.querySelector('#password-error');
  const validEmail = validateEmail(email, document.querySelector('#email-error'));
  const validPassword = passwordInput.value.length >= 6;
  passwordError.textContent = validPassword ? '' : 'Enter a password with at least 6 characters.';
  if (validEmail && validPassword) {
    document.querySelector('#login-message').textContent = 'Demo sign-in submitted. Connect this form to your dashboard service.';
  }
});

document.querySelector('#reset-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const email = document.querySelector('#reset-email');
  const valid = validateEmail(email, document.querySelector('#reset-email-error'));
  if (valid) document.querySelector('#reset-message').textContent = 'Setup email requested for this administrator account.';
});
