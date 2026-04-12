'use client';

import { useState, FormEvent } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { 
  X, 
  Eye, 
  EyeOff, 
  MessageCircle, 
  Mail, 
  Phone, 
  Headset 
} from 'lucide-react';

export default function AuthPage() {
  const supabase = createClient();
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [csOpen, setCsOpen] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nama, setNama] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const switchMode = (newMode: 'login' | 'register') => {
    setMode(newMode);
    setError('');
    setSuccess('');
    setPassword('');
  };

  async function handleGoogleLogin() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    if (mode === 'register' && password.length < 6) {
      setError('Password harus memiliki minimal 6 karakter.');
      setLoading(false);
      return;
    }

    try {
      if (mode === 'login') {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        router.push('/dashboard');
      } else {
        const { error: regError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: nama } },
        });
        if (regError) throw regError;
        setSuccess('Registrasi berhasil! Silakan cek email untuk verifikasi atau langsung login.');
        setMode('login');
      }
    } catch (err: any) {
      // ── TANGKAP ERROR SUPABASE DAN TERJEMAHKAN ──
      if (err.message === 'Invalid login credentials') {
        setError('Email atau password yang Anda masukkan salah.');
      } else if (err.message === 'User already registered') {
        setError('Email ini sudah terdaftar. Silakan login.');
      } else {
        setError(err.message); // Tampilkan error bawaan jika ada masalah lain
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="logo" style={{ fontSize: 40, fontWeight: '800', color: '#001E36', letterSpacing: '-1.5px', marginBottom: '0px',  textAlign:'center'}}>
            <span style={{ color: '#00AEEF' }}>Cy</span>artha.
          </div>  
          <div style={{ fontSize: 10, fontWeight: '400', color: '#1f5078a2', letterSpacing: '-0.5px', marginBottom: '20px', textAlign:'center' }}>
            <span>Tempat mencatat pahala hamba-hamba Allah</span>
          </div>  
  
         
          </div>
          <div style={{ fontSize: 14, fontWeight: '400', color: '#0e3c62', letterSpacing: '0px', marginBottom: '10px'}}>
          <p>{mode === 'login' ? 'Masuk ke akun Anda' : 'Daftar akun baru'}</p>
          </div>
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <form onSubmit={handleSubmit} className="auth-form">
            {mode === 'register' && (
              <div className="form-group">
                <label>Nama Lengkap</label>
                <input 
                type="text" 
                value={nama} 
                onChange={(e) => setNama(e.target.value)} 
                placeholder="Masukkan nama lengkap"
                required 
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input 
              type="email" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              placeholder="nama@email.com"
              required 
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="password-input-wrapper">
              <input 
                type={showPassword ? 'text' : 'password'} 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••"
                required 
              />
              <button 
                type="button" 
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Memproses...' : mode === 'login' ? 'Masuk Sekarang' : 'Daftar Sekarang'}
          </button>
         </form>

          <div className="divider">
            <span>atau</span>
          </div>

        <button onClick={handleGoogleLogin} className="btn-google">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path fill="#ea4335" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#fbbc05" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#34a853" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#4285f4" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Masuk dengan Google
        </button>

        <p className="auth-footer">
          {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}
          <button onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Daftar di sini' : 'Login di sini'}
          </button>
        </p>
      </div>

      {/* FLOATING CUSTOMER SERVICE */}
      <div className="cs-container-floating">
        {csOpen && (
          <div className="cs-menu-content">
            <a href="https://wa.me/628123456789" target="_blank" rel="noopener noreferrer" className="cs-item">
              <Phone size={18} /> <span>WhatsApp</span>
            </a>
            <a href="mailto:support@cyartha.com" className="cs-item">
              <Mail size={18} /> <span>Email Support</span>
            </a>
          </div>
        )}
        <button className="cs-main-btn" onClick={() => setCsOpen(!csOpen)}>
          <span className="cs-text">Paramex</span>
        </button>
      </div>

      <style jsx>{`
        .auth-wrapper {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          /* ── EFEK BACKGROUND GRADIENT CIRCLE ── */
          background-color: #03101b;
          background-image: radial-gradient(circle at 50% 0%, #595e63 0%, #001E36 75%);
          padding: 20px;
          font-family: 'Plus Jakarta Sans', sans-serif;
        }

        .auth-card {
          width: 100%;
          max-width: 400px;
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }

        .auth-header p { 
          color: #64748b; 
          margin-bottom: 30px; 
          font-weight: 500;
        }
        
        .form-group { margin-bottom: 20px; text-align: left; }
        .form-group label { display: block; margin-bottom: 8px; font-weight: 700; color: #1e293b; font-size: 0.9rem; }
        
        input {
          width: 100%;
          padding: 12px 16px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          font-size: 1rem;
          transition: all 0.2s;
        }

        input:focus {
          outline: none;
          border-color: #00AEEF;
          box-shadow: 0 0 0 3px rgba(0, 174, 239, 0.1);
        }

        .password-input-wrapper { position: relative; }
        .toggle-password {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none; border: none; color: #94a3b8;
          cursor: pointer;
        }

        .btn-primary {
          width: 100%;
          padding: 14px;
          background: #001E36;
          color: white;
          border: none;
          border-radius: 12px;
          font-weight: 700;
          cursor: pointer;
          margin-top: 10px;
          transition: all 0.3s ease;
        }

        .btn-primary:hover {
          background-color: #002d52;
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(0, 30, 54, 0.2);
        }

        .divider {
          margin: 20px 0;
          display: flex;
          align-items: center;
          color: #94a3b8;
          font-size: 0.85rem;
        }

        .divider::before, .divider::after {
          content: ""; flex: 1; height: 1px; background: #e2e8f0; margin: 0 10px;
        }

        .btn-google {
          width: 100%;
          padding: 12px;
          background: #001e36;
          color: #f7f9fa;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          cursor: pointer;
          transition: background 0.2s;
        }

        .btn-google:hover {
          background: #1a2d3f;
        }

        /* FLOATING CS STYLES */
        .cs-container-floating {
          position: fixed;
          bottom: 24px;
          right: 20px;
          display: flex;
          flex-direction: column; /* Menu muncul ke atas */
          align-items: flex-end;
          gap: 12px;
          z-index: 9999;
          pointer-events: none;
        }

        .cs-main-btn, .cs-menu-content {
          pointer-events: auto;
          flex-direction: column-reverse; 
        }

        .cs-main-btn {
          background: #00AEEF; /* Warna Cyan agar cocok dengan tema baru */
          color: #001E36;
          border: none;
          padding: 12px 24px;
          border-radius: 50px;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .cs-main-btn:hover { 
          transform: translateY(-3px) scale(1.02);
          box-shadow: 0 8px 25px rgba(0, 174, 239, 0.4);
        }

        .cs-text { font-weight: 800; font-size: 0.9rem; }

        .cs-menu-content {
          background: #1e293b;
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          padding: 8px 0;
          display: flex;
          flex-direction: column;
          min-width: 160px;
          animation: slideUp 0.2s ease;
        }

        .cs-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 20px;
          color: #f8fafc;
          text-decoration: none;
          font-size: 0.9rem;
          font-weight: 500;
          transition: background 0.2s;
        }

        .cs-item:hover { background: rgba(255, 255, 255, 0.05); }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .auth-footer { margin-top: 25px; font-size: 0.9rem; color: #64748b; text-align:center; }
        .auth-footer button {
          background: none; border: none; color: #001E36; font-weight: 700; margin-left: 5px; cursor: pointer;
        }

        .alert { padding: 12px; border-radius: 10px; margin-bottom: 20px; font-size: 0.85rem; font-weight: 600; }
        .alert-error { background: #fee2e2; color: #b91c1c; }
        .alert-success { background: #dcfce7; color: #15803d; }
      `}</style>
    </div>
  );
}