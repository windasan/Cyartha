// lib/supabase.ts
// Supabase client untuk penggunaan di Client Components (browser)

import { createBrowserClient } from '@supabase/ssr';

export type UserRole = 'admin' | 'bendahara' | 'anggota';

export interface Profile {
  id: string;
  nama: string;
  email: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
}

export interface Transaksi {
  id: string;
  created_at: string;
  tanggal: string;
  jenis: 'Pemasukan' | 'Pengeluaran' | 'Kas';
  kategori: string;
  nominal: number;
  keterangan: string;
  bukti_url: string | null;
  status: 'aktif' | 'dihapus';
  created_by: string;
  email_aktor: string;
}

export interface Anggaran {
  id: string;
  kategori: string;
  batas: number;
  periode: string; // "YYYY-MM"
}

export interface DashboardData {
  saldo: number;
  pemasukan: number;
  pengeluaran: number;
  totalKas: number;
  riwayat: Transaksi[];
  rekapKas: { nama: string; total: number }[];
  anggaranList: Anggaran[];
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Helper: format rupiah
export function formatRp(angka: number): string {
  if (isNaN(angka)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(angka);
}

// Helper: format tanggal Indonesia
export function formatTanggal(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// Helper: periode bulan ini
export function getPeriodeSekarang(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
