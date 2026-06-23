import { useState } from 'react';
import { toast } from './Toast.jsx';

// Hard-coded credentials for prototype — replace with Supabase Auth later
const USERS = [
  { username: 'admin', password: 'lavanya2024', role: 'Admin' },
  { username: 'staff', password: 'staff123',    role: 'Staff' },
];

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');

  function handleLogin() {
    const user = USERS.find(
      (u) => u.username === username.trim() && u.password === password
    );
    if (user) {
      setError('');
      toast(`Welcome, ${user.role}!`, 'success');
      onLogin(user);
    } else {
      setError('Invalid username or password.');
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter') handleLogin();
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <div className="login-logo">
          <div className="emoji">🪡</div>
          <h1>Lavanya Aari Materials</h1>
          <p>Order Management System v3.4</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="login-field">
          <label>Username</label>
          <input
            type="text"
            placeholder="Enter username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={handleKey}
            autoFocus
          />
        </div>

        <div className="login-field">
          <label>Password</label>
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>

        <button className="login-btn" onClick={handleLogin}>
          Sign In →
        </button>

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--muted)' }}>
          Demo — admin / lavanya2024
        </p>
      </div>
    </div>
  );
}
