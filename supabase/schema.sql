-- ============================================================
--  CYARTHA — Supabase Database Schema
--  Run this in Supabase → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension (biasanya sudah aktif)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
--  TABLE: profiles (profil anggota KKN)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nama        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  role        TEXT NOT NULL DEFAULT 'anggota'
                CHECK (role IN ('admin', 'bendahara', 'anggota')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
--  TABLE: transaksi
-- ============================================================
CREATE TABLE IF NOT EXISTS transaksi (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tanggal      DATE NOT NULL,
  jenis        TEXT NOT NULL CHECK (jenis IN ('Pemasukan', 'Pengeluaran', 'Kas')),
  kategori     TEXT NOT NULL,
  nominal      NUMERIC(15, 2) NOT NULL CHECK (nominal > 0),
  keterangan   TEXT NOT NULL DEFAULT '-',
  bukti_url    TEXT,
  status       TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'dihapus')),
  deleted_at   TIMESTAMPTZ,
  deleted_by   UUID REFERENCES profiles(id),
  created_by   UUID REFERENCES profiles(id) NOT NULL,
  email_aktor  TEXT NOT NULL
);

-- ============================================================
--  TABLE: anggaran (budget per kategori per bulan)
-- ============================================================
CREATE TABLE IF NOT EXISTS anggaran (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kategori   TEXT NOT NULL,
  batas      NUMERIC(15, 2) NOT NULL CHECK (batas > 0),
  periode    TEXT NOT NULL,  -- Format: "YYYY-MM" e.g. "2025-07"
  UNIQUE(kategori, periode)
);

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaksi  ENABLE ROW LEVEL SECURITY;
ALTER TABLE anggaran   ENABLE ROW LEVEL SECURITY;

-- Profiles: semua user terautentikasi bisa baca semua profil
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT TO authenticated USING (true);

-- Profiles: user hanya bisa insert/update profil sendiri
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE TO authenticated USING (id = auth.uid());

-- Transaksi: semua user terautentikasi bisa baca yang aktif
CREATE POLICY "transaksi_select" ON transaksi
  FOR SELECT TO authenticated USING (status = 'aktif');

-- Transaksi: semua user terautentikasi bisa tambah transaksi baru
CREATE POLICY "transaksi_insert" ON transaksi
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

-- Transaksi: hanya admin/bendahara yang bisa soft-delete (update status)
CREATE POLICY "transaksi_update_admin" ON transaksi
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'bendahara')
    )
  );

-- Anggaran: semua user bisa baca
CREATE POLICY "anggaran_select" ON anggaran
  FOR SELECT TO authenticated USING (true);

-- Anggaran: hanya admin/bendahara yang bisa kelola
CREATE POLICY "anggaran_manage" ON anggaran
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'bendahara')
    )
  );

-- ============================================================
--  STORAGE BUCKET: receipts (untuk bukti foto transaksi)
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  false,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "receipts_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'receipts');

CREATE POLICY "receipts_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');

CREATE POLICY "receipts_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts' AND
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'bendahara')
    )
  );

-- ============================================================
--  FUNCTION: auto-create profile setelah signup
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, nama, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'anggota'  -- Default role, admin bisa ubah via dashboard
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
--  INDEXES untuk performa query
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_transaksi_tanggal    ON transaksi(tanggal DESC);
CREATE INDEX IF NOT EXISTS idx_transaksi_jenis      ON transaksi(jenis);
CREATE INDEX IF NOT EXISTS idx_transaksi_status     ON transaksi(status);
CREATE INDEX IF NOT EXISTS idx_transaksi_created_by ON transaksi(created_by);
CREATE INDEX IF NOT EXISTS idx_anggaran_periode     ON anggaran(periode);

-- ============================================================
--  SAMPLE DATA (opsional - hapus jika tidak diperlukan)
-- ============================================================
-- NOTE: Jalankan bagian ini setelah mendaftar akun pertama,
--       lalu ubah role admin via Supabase Table Editor.
-- UPDATE profiles SET role = 'admin' WHERE email = 'email-kamu@gmail.com';
