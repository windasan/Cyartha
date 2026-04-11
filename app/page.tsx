'use client';

import { useState, FormEvent } from 'react';
import { createClient } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function AuthPage() {
  const supabase = createClient();
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nama, setNama] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
        router.refresh();
      } else {
        // Register

        let avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(nama)}&background=random`;

        if (avatarFile) {
          // Pastikan ada bucket 'avatars' di Supabase Storage
          const fileExt = avatarFile.name.split('.').pop();
          const filePath = `${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, avatarFile);
          if (!uploadError) {
            const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
            avatarUrl = data.publicUrl;
          }
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: nama },
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (error) throw error;

        // Kalau email confirmation disabled (setting Supabase), langsung masuk
        if (data.session) {
          router.push('/dashboard');
          router.refresh();
        } else {
          setError('✅ Cek email kamu untuk konfirmasi akun, lalu login.');
          setMode('login');
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Terjadi kesalahan';
      if (msg.includes('Invalid login credentials')) {
        setError('Email atau password salah.');
      } else if (msg.includes('User already registered')) {
        setError('Email sudah terdaftar. Silakan login.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

// Fungsi reset password
async function handleResetPassword() {
  if (!email) return setError('Masukkan email untuk mereset password.');
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) setError(error.message);
  else setError('✅ Cek email untuk instruksi reset password.');
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

        <div className="auth-tab-row">
          <button
            className={`auth-tab${mode === 'login' ? ' active' : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >Masuk</button>
          <button
            className={`auth-tab${mode === 'register' ? ' active' : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >Daftar</button>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Nama Lengkap</label>
              <input
                type="text"
                placeholder="Nama kamu..."
                value={nama}
                onChange={e => setNama(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="email@contoh.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

{/* // Di bagian render input password: */}
<div className="form-group">
  <label>Password</label>
  <div style={{ position: 'relative' }}>
    <input
      type={showPassword ? 'text' : 'password'}
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      required
    />
    <button 
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}
    >
      {showPassword ? '👁️' : '👁️‍🗨️'}
    </button>
  </div>
</div>
{mode === 'login' && (
  <div style={{ textAlign: 'right', marginTop: '-10px', marginBottom: '14px' }}>
    <button type="button" onClick={handleResetPassword} style={{ fontSize: '0.8rem', color: 'var(--blu-cyan)', background: 'none', border: 'none', cursor: 'pointer' }}>
      Lupa Password?
    </button>
  </div>
)}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <span className="spinner" /> : (mode === 'login' ? 'Masuk ke Cyartha' : 'Buat Akun')}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
          atau
          <div style={{ flex: 1, height: 1, background: '#E2E8F0' }} />
        </div>

        <button
          className="btn btn-navy"
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{ gap: 10 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582L19.91 3C17.782 1.145 15.055 0 12 0 7.27 0 3.198 2.698 1.24 6.65l4.026 3.115z"/>
            <path fill="#34A853" d="M16.04 18.013c-1.09.703-2.474 1.078-4.04 1.078a7.077 7.077 0 0 1-6.723-4.823l-4.04 3.067A11.965 11.965 0 0 0 12 24c2.933 0 5.735-1.043 7.834-3l-3.793-2.987z"/>
            <path fill="#4A90E2" d="M19.834 21c2.195-2.048 3.62-5.096 3.62-9 0-.71-.109-1.473-.272-2.182H12v4.637h6.436c-.317 1.559-1.17 2.766-2.395 3.558L19.834 21z"/>
            <path fill="#FBBC05" d="M5.277 14.268A7.12 7.12 0 0 1 4.909 12c0-.782.125-1.533.357-2.235L1.24 6.65A11.934 11.934 0 0 0 0 12c0 1.92.445 3.73 1.237 5.335l4.04-3.067z"/>
          </svg>
          Masuk dengan Google
        </button>

        <p style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 20 }}>
          Aplikasi ini digunakan untuk mencatat pahala hamba-hamba Allah.
        </p>
      </div>
    </div>
  );
}
