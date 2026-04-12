'use client';

import { useState, FormEvent } from 'react';
import { createClient } from '@/lib/supabase'; // Pastikan path ini sesuai
import { useRouter } from 'next/navigation';
import { X, Eye, EyeOff } from 'lucide-react';

export default function AuthPage() {
  const supabase = createClient();
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // State untuk menu bantuan (Customer Service)
  const [csOpen, setCsOpen] = useState(false);

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nama, setNama] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Fungsi ganti tab untuk membersihkan form dan pesan notifikasi
  const switchMode = (newMode: 'login' | 'register') => {
    setMode(newMode);
    setError('');
    setSuccess('');
    setPassword(''); // Reset password saat ganti tab untuk privasi
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Validasi tambahan di sisi klien (Client-side validation)
    if (mode === 'register' && password.length < 6) {
      setError('Password harus memiliki minimal 6 karakter.');
      setLoading(false);
      return;
    }

    try {
      if (mode === 'login') {
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        
        setSuccess('🎉 Berhasil masuk! Mengalihkan ke Dashboard...');
        
        setTimeout(() => {
          router.push('/dashboard');
          router.refresh();
        }, 1500);

      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: nama },
            // Mencegah error SSR dengan memastikan window tersedia
            emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard`,
          },
        });
        if (signUpError) throw signUpError;

        // Cek apakah butuh konfirmasi email (fitur Supabase) atau langsung masuk
        if (data.session) {
          setSuccess('🚀 Akun berhasil dibuat! Langsung masuk...');
          setTimeout(() => {
            router.push('/dashboard');
            router.refresh();
          }, 1500);
        } else {
          setSuccess('✉️ Berhasil! Silakan cek email kamu untuk konfirmasi akun.');
          setMode('login');
          setPassword(''); // Kosongkan password setelah berhasil daftar
        }
      }
    } catch (err: unknown) {
      // Type casting error untuk Typescript yang lebih aman (menghindari 'any')
      const errorObj = err as { message?: string };
      let errorMessage = errorObj.message || 'Terjadi kesalahan sistem yang tidak diketahui.';

      // Translasi pesan error umum dari Supabase ke Bahasa Indonesia
      if (errorMessage.includes('Invalid login credentials')) {
        errorMessage = 'Email atau password yang kamu masukkan salah.';
      } else if (errorMessage.includes('Email not confirmed')) {
        errorMessage = 'Silakan konfirmasi email kamu terlebih dahulu. Cek kotak masuk atau folder spam.';
      } else if (errorMessage.includes('User already registered')) {
        errorMessage = 'Email ini sudah terdaftar. Silakan masuk atau gunakan email lain.';
      } else if (errorMessage.includes('Password should be at least')) {
        errorMessage = 'Password terlalu pendek. Gunakan minimal 6 karakter.';
      }

      setError(errorMessage);
    } finally {
      // Finally memastikan loading berhenti, entah itu sukses atau error
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError('');
    
    try {
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/auth/callback`,
          queryParams: { prompt: 'select_account' },
        },
      });
      
      if (googleError) throw googleError;
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setError(errorObj.message || 'Gagal masuk menggunakan Google.');
      setLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!email) {
      return setError('Silakan masukkan email kamu terlebih dahulu di kolom email atas.');
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/reset-password`,
      });
      
      if (resetError) throw resetError;
      setSuccess('✅ Instruksi reset password sudah dikirim ke email kamu. Cek folder Inbox/Spam.');
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setError(errorObj.message || 'Gagal mengirim instruksi reset password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-bg-circle auth-bg-circle-1" />
      <div className="auth-bg-circle auth-bg-circle-2" />

      <div className="auth-card">
        <div className="auth-logo">
          <div className="wordmark"><span>Cy</span>artha.</div>
          <div className="tagline">Manajemen Keuangan KKN</div>
        </div>

        {/* TOMBOL BANTUAN MELAYANG */}
        <div className="cs-container-floating">
          <div className={`cs-menu ${csOpen ? 'open' : ''}`}>
            {/* Tambahkan rel="noopener noreferrer" pada target blank untuk keamanan */}
            <a href="https://wa.me/6285643312905" target="_blank" rel="noopener noreferrer" className="cs-item wa">
              WhatsApp
            </a>
            <a href="mailto:cyborged30s@gmail.com" className="cs-item email">
              Email
            </a>
          </div>

          <button 
            type="button" 
            className="cs-main-btn" 
            onClick={() => setCsOpen(!csOpen)}
            aria-label="Bantuan Customer Service"
          >
            {csOpen ? <X size={20} /> : <span className="cs-text">Butuh bantuan?</span>}
          </button>
        </div>

        <div className="auth-tab-row">
          <button
            type="button"
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => switchMode('login')}
            disabled={loading} // Cegah klik ganti tab saat sedang proses loading
          >
            Masuk
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => switchMode('register')}
            disabled={loading}
          >
            Daftar
          </button>
        </div>

        {/* Notifikasi Alert */}
        {error && (
          <div style={{ backgroundColor: '#fff5f5', color: '#e53e3e', padding: '12px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.85rem', border: '1px solid #fed7d7', lineHeight: '1.4' }}>
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div style={{ backgroundColor: '#f0fff4', color: '#38a169', padding: '12px', borderRadius: '8px', marginBottom: '15px', fontSize: '0.85rem', border: '1px solid #c6f6d5', lineHeight: '1.4' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label htmlFor="nama">Nama Lengkap</label>
              <input
                id="nama"
                type="text"
                placeholder="Nama kamu..."
                value={nama}
                onChange={e => setNama(e.target.value)}
                required
                autoComplete="name"
                disabled={loading} // Disable input saat loading
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="email@contoh.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 6 : undefined} // HTML5 Validation
                style={{ width: '100%', paddingRight: '45px' }}
                disabled={loading}
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                disabled={loading}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {mode === 'login' && (
            <div style={{ textAlign: 'right', marginTop: '-10px', marginBottom: '15px' }}>
              <button 
                type="button" 
                onClick={handleResetPassword} 
                style={{ fontSize: '0.8rem', color: '#00bcd4', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}
                disabled={loading}
              >
                Lupa Password?
              </button>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Memproses...' : (mode === 'login' ? 'Masuk ke Cyartha' : 'Buat Akun')}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0', color: '#94a3b8', fontSize: '0.8rem' }}>
          <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
          atau
          <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
        </div>

        <button
          type="button"
          className="btn btn-navy"
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z"/>
            <path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987z"/>
            <path fill="#4A90E2" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21z"/>
            <path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067z"/>
          </svg>
          Masuk dengan Google
        </button>

        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', marginTop: 25 }}>
          Aplikasi ini digunakan untuk mencatat pahala hamba-hamba Allah.
        </p>
      </div>
    </div>
  );
}