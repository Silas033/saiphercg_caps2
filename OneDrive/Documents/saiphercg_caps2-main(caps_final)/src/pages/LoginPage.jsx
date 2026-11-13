import { useState } from 'react';
import saipherLogo from '../assets/saiphercg.jpg';
import '../styles/login.css';

const LOGIN_EMAIL = 'saiphercg@gmail.com';
const LOGIN_PASSWORD = 'saiphercg123';

export default function LoginPage({ onAuthenticated }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    function handleSubmit(event) {
        event.preventDefault();
        if (email.trim().toLowerCase() !== LOGIN_EMAIL || password !== LOGIN_PASSWORD) {
            setError('The email or password is incorrect. Please try again.');
            return;
        }
        setError('');
        onAuthenticated();
    }

    return (
        <main className="login-page">
            <section className="login-card" aria-labelledby="login-title">
                <div className="login-brand">
                    <div className="login-logo-frame">
                        <img src={saipherLogo} alt="Saipher CG logo" />
                    </div>
                    <span className="login-brand-name">SAIPHER CG <b>DSS</b></span>
                </div>

                <div className="login-heading">
                    <span className="login-eyebrow">DASHBOARD ACCESS</span>
                    <h1 id="login-title">Saipher Login</h1>
                    <p>Sign in to continue to the dashboard.</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    <label>
                        <span>Email</span>
                        <input
                            type="email"
                            name="email"
                            value={email}
                            onChange={event => { setEmail(event.target.value); setError(''); }}
                            autoComplete="username"
                            placeholder="Enter your email"
                            required
                            autoFocus
                        />
                    </label>
                    <label>
                        <span>Password</span>
                        <input
                            type="password"
                            name="password"
                            value={password}
                            onChange={event => { setPassword(event.target.value); setError(''); }}
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            required
                        />
                    </label>
                    {error && <p className="login-error" role="alert">{error}</p>}
                    <button type="submit" className="login-submit">Log in</button>
                </form>
                <p className="login-footer">Geographic Market Decision Support System</p>
            </section>
        </main>
    );
}
