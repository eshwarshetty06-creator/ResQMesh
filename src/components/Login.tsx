import { useState, useEffect } from 'react';
import { Shield, User, ChevronRight, Smartphone, Server, Key, Target } from 'lucide-react';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import type { ApplicationVerifier, ConfirmationResult } from 'firebase/auth';
import { auth } from '../firebaseApp';
import '../App.css';

interface LoginProps {
  onLogin: (role: 'civilian' | 'responder', userName: string, serverName?: string) => void;
}

declare global {
  interface Window {
    recaptchaVerifier: ApplicationVerifier;
  }
}

export default function Login({ onLogin }: LoginProps) {
  const [step, setStep] = useState<'info' | 'otp'>('info');
  const [role, setRole] = useState<'civilian' | 'responder'>('civilian');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [serverName, setServerName] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  useEffect(() => {
    // Initialize reCAPTCHA when component mounts
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved
        }
      });
    }
  }, []);

  const handleInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (role === 'civilian') {
      if (!name || !mobile) {
        setError('Please provide Name and Mobile Number');
        return;
      }
      setIsLoading(true);
      try {
        const appVerifier = window.recaptchaVerifier;
        const formattedMobile = mobile.startsWith('+') ? mobile : `+91${mobile}`; // Example generic prefix handling
        const result = await signInWithPhoneNumber(auth, formattedMobile, appVerifier);
        setConfirmationResult(result);
        setStep('otp');
      } catch (err: any) {
        console.error(err);
        console.warn('Network offline or Firebase failed. Falling back to offline bypass mode.');
        setStep('otp');
      }
      setIsLoading(false);
    } else {
      // SERVER MODE: Bypass OTP entirely.
      if (!name || !serverName || !adminPass) {
        setError('Please provide Server Alias, Operator Name, and Network Passkey');
        return;
      }
      if (adminPass !== 'admin123') {
        setError('Invalid Admin Master Passcode');
        return;
      }
      // Log directly into server dashboard
      setIsLoading(true);
      setTimeout(() => {
        onLogin(role, name, serverName);
        setIsLoading(false);
      }, 600);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!otp) {
      setError('Please enter the OTP');
      return;
    }

    if (!confirmationResult && otp !== '1234') {
      setError('Session expired or invalid. Please request OTP again.');
      return;
    }

    setIsLoading(true);
    try {
      if (otp === '1234') {
        // Master override for system demo testing and recovery
        onLogin(role, name || serverName, serverName);
      } else if (confirmationResult) {
        await confirmationResult.confirm(otp);
        onLogin(role, name || serverName, serverName);
      }
    } catch (err: any) {
      console.error(err);
      setError('Invalid OTP code. Please try again.');
    }
    setIsLoading(false);
  };

  const generateSecureId = () => {
    const prefixes = ['ALPHA', 'BRAVO', 'ECHO', 'NOVA', 'DELTA'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const rand = Math.floor(Math.random() * 900) + 100;
    setServerName(`BASE-${prefix}-${rand}`);
  };

  const isServer = role === 'responder';

  return (
    <div className={`login-root ${isServer ? 'theme-tactical' : ''}`}>
      <div className="login-ambient" />

      <div className="login-container">
        <div className="login-header">
          <div className="login-logo-box">
            {isServer ? <Target size={28} color="#10B981" /> : <Shield size={28} color="#60A5FA" />}
          </div>
          <h1 className="login-title">ResQ<span className="accent">Mesh</span></h1>
          <p className="login-subtitle">{isServer ? 'COMMAND POST INITIALIZATION' : 'SECURE TACTICAL GRID'}</p>
        </div>

        <div className="login-card glass">
          {step === 'info' && (
            <div className="login-tabs" style={{ display: 'flex', gap: '8px', background: 'transparent', padding: 0, border: 'none', marginBottom: '24px' }}>
              <button
                type="button"
                className={`login-tab ${role === 'civilian' ? 'active' : ''}`}
                onClick={() => { setRole('civilian'); setError(''); }}
                style={{ flex: 1, border: '1px solid rgba(255,255,255,0.08)', background: role === 'civilian' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(0,0,0,0.3)', cursor: 'pointer' }}
              >
                CIVILIAN MODE
              </button>
              <button
                type="button"
                className={`login-tab ${role === 'responder' ? 'active' : ''}`}
                onClick={() => { setRole('responder'); setError(''); }}
                style={{ flex: 1, border: '1px solid rgba(255,255,255,0.08)', background: role === 'responder' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(0,0,0,0.3)', cursor: 'pointer' }}
              >
                SERVER MODE
              </button>
            </div>
          )}
          {step === 'otp' && (
            <div className="login-tabs">
              <button className="login-tab active">O.T.P. VERIFICATION</button>
            </div>
          )}

          <form className="login-form" onSubmit={step === 'info' ? handleInfoSubmit : handleOtpSubmit}>
            {step === 'info' ? (
              <>
                {role === 'civilian' ? (
                  <>
                    <div className="input-group">
                      <div className="input-icon"><User size={16} /></div>
                      <input
                        type="text"
                        placeholder="CIVILIAN NAME"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        spellCheck={false}
                      />
                    </div>

                    <div className="input-group">
                      <div className="input-icon"><Smartphone size={16} /></div>
                      <input
                        type="tel"
                        placeholder="MOBILE NUMBER (+91...)"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                      />
                    </div>

                    <div className="input-group">
                      <div className="input-icon"><Server size={16} /></div>
                      <input
                        type="text"
                        placeholder="SERVER ID TO JOIN (OPTIONAL)"
                        value={serverName}
                        onChange={(e) => setServerName(e.target.value.toUpperCase())}
                        spellCheck={false}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="input-group">
                      <div className="input-icon"><Server size={16} /></div>
                      <input
                        type="text"
                        placeholder="SERVER ALIAS (e.g. North Command)"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        spellCheck={false}
                      />
                    </div>
                    <div className="input-group">
                      <div className="input-icon"><Target size={16} /></div>
                      <input
                        type="text"
                        placeholder="NETWORK PASSKEY (CIVILIANS WILL JOIN THIS)"
                        value={serverName}
                        onChange={(e) => setServerName(e.target.value.toUpperCase())}
                        spellCheck={false}
                      />
                      <button type="button" onClick={generateSecureId} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#10B981', padding: '4px 8px', borderRadius: '8px', fontSize: '0.6rem', fontWeight: 800, cursor: 'pointer' }}>
                        GENERATE
                      </button>
                    </div>
                    <div className="input-group">
                      <div className="input-icon"><Key size={16} /></div>
                      <input
                        type="password"
                        placeholder="ADMIN MASTER PASSCODE"
                        value={adminPass}
                        onChange={(e) => setAdminPass(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="input-group">
                  <div className="input-icon"><Key size={16} /></div>
                  <input
                    type="text"
                    placeholder="ENTER O.T.P."
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                </div>
              </>
            )}

            <div id="recaptcha-container"></div>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className={`login-btn glow ${isServer ? 'btn-tactical' : ''}`} disabled={isLoading}>
              {isLoading ? (
                <span className="spinner"></span>
              ) : (
                <>
                  <span>{step === 'info' ? (isServer ? 'INITIALIZE SECURE SERVER' : 'REQUEST O.T.P.') : 'AUTHENTICATE'}</span>
                  <ChevronRight size={18} />
                </>
              )}
            </button>
          </form>

          {step === 'otp' && (
            <div className="login-footer">
              <a href="#" className="forgot-link" onClick={(e) => { e.preventDefault(); setStep('info'); setError(''); setOtp(''); }}>
                ← BACK TO IDENTIFICATION
              </a>
            </div>
          )}
        </div>

        {role === 'civilian' ? (
          <div className="system-notice">
            <p>SYSTEM DEMO: Use OTP <strong>1234</strong> for testing.</p>
          </div>
        ) : (
          <div className="system-notice" style={{ borderColor: 'rgba(16, 185, 129, 0.2)' }}>
            <p>SERVER DEMO: Use Passcode <strong>admin123</strong></p>
          </div>
        )}
      </div>

      <style>{`
        .login-root {
          min-height: 100vh;
          background: #030407;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Outfit', sans-serif;
          color: #E8EDF8;
          position: relative;
          overflow: hidden;
        }

        .login-ambient {
          position: absolute;
          inset: 0;
          background: 
            radial-gradient(circle at 20% 30%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(139, 92, 246, 0.05) 0%, transparent 50%);
          pointer-events: none;
        }

        .login-container {
          width: 100%;
          max-width: 420px;
          padding: 24px;
          position: relative;
          z-index: 10;
          animation: fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .login-logo-box {
          width: 56px;
          height: 56px;
          margin: 0 auto 16px;
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.2);
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 32px rgba(59, 130, 246, 0.15);
        }

        .login-title {
          font-size: 2rem;
          font-weight: 800;
          letter-spacing: -0.02em;
          margin: 0 0 4px;
        }

        .login-title .accent {
          background: linear-gradient(135deg, #60A5FA, #A78BFA);
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .theme-tactical .login-title .accent {
          background: linear-gradient(135deg, #10B981, #059669);
          -webkit-background-clip: text;
        }

        .theme-tactical .login-logo-box {
          background: rgba(16, 185, 129, 0.1);
          border-color: rgba(16, 185, 129, 0.2);
          box-shadow: 0 0 32px rgba(16, 185, 129, 0.15);
        }

        .login-subtitle {
          font-size: 0.7rem;
          font-weight: 700;
          color: #64748B;
          letter-spacing: 0.3em;
          margin: 0;
        }

        .login-card {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4);
        }

        .login-tabs {
          display: flex;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 12px;
          padding: 4px;
          margin-bottom: 24px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .login-tab {
          flex: 1;
          background: transparent;
          border: none;
          color: #64748B;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          padding: 12px;
          border-radius: 8px;
          cursor: default;
        }

        .login-tab.active {
          background: rgba(59, 130, 246, 0.15);
          color: #60A5FA;
          box-shadow: 0 0 20px rgba(59, 130, 246, 0.1);
        }

        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .input-group {
          position: relative;
        }

        .input-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          color: #475569;
          display: flex;
          transition: color 0.3s ease;
        }

        .input-group:focus-within .input-icon {
          color: #60A5FA;
        }

        .theme-tactical .input-group:focus-within .input-icon {
          color: #10B981;
        }

        .input-group input {
          width: 100%;
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 16px 16px 16px 44px;
          border-radius: 12px;
          color: #F1F5F9;
          font-family: 'Outfit', sans-serif;
          font-size: 0.95rem;
          font-weight: 500;
          transition: all 0.3s ease;
        }

        .input-group input:focus {
          outline: none;
          background: rgba(15, 23, 42, 0.8);
          border-color: rgba(59, 130, 246, 0.4);
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
        }

        .theme-tactical .input-group input:focus {
          border-color: rgba(16, 185, 129, 0.4);
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.1);
        }
        
        .input-group input::placeholder {
          color: #475569;
          font-size: 0.75rem;
          letter-spacing: 0.1em;
        }

        .login-error {
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #F87171;
          padding: 12px;
          border-radius: 8px;
          font-size: 0.8rem;
          font-weight: 500;
          text-align: center;
          animation: shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
        }

        @keyframes shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }

        .login-btn {
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 18px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #3B82F6, #6366F1);
          color: white;
          font-family: 'Outfit', sans-serif;
          font-size: 0.85rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .btn-tactical {
          background: linear-gradient(135deg, #10B981, #059669);
        }

        .login-btn::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(rgba(255,255,255,0.2), transparent);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .login-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 24px rgba(59, 130, 246, 0.3);
        }

        .btn-tactical:hover {
          box-shadow: 0 12px 24px rgba(16, 185, 129, 0.3);
        }

        .login-btn:hover::after {
          opacity: 1;
        }

        .login-btn:active {
          transform: translateY(0);
        }
        
        .login-btn:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(255,255,255,0.3);
          border-radius: 50%;
          border-top-color: #fff;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .login-footer {
          margin-top: 24px;
          text-align: center;
        }

        .forgot-link {
          color: #64748B;
          font-size: 0.65rem;
          font-weight: 700;
          text-decoration: none;
          letter-spacing: 0.1em;
          transition: color 0.3s ease;
        }

        .forgot-link:hover {
          color: #60A5FA;
        }
        
        .system-notice {
            margin-top: 24px;
            text-align: center;
            font-size: 0.75rem;
            color: #475569;
            background: rgba(255,255,255,0.02);
            padding: 12px;
            border-radius: 12px;
            border: 1px dashed rgba(255,255,255,0.1);
        }
        
        .system-notice strong {
            color: #94A3B8;
        }
      `}</style>
    </div>
  );
}
