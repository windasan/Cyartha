# 🌊 Cyartha — Manajemen Keuangan KKN

Versi modern dari aplikasi pencatatan keuangan KKN menggunakan **Next.js + Supabase**,
siap deploy ke Vercel dalam hitungan menit.

---

## ✨ Fitur Baru (vs versi Google Sheets)

| Fitur | Versi Lama | Versi Baru |
|---|---|---|
| Autentikasi | Google login via Apps Script | Email/Password + Google OAuth |
| Database | Google Sheets | Supabase PostgreSQL |
| Storage foto | Google Drive | Supabase Storage |
| Realtime | Manual refresh | **Live update otomatis** 🔴 |
| Multi-user & role | Tidak ada | Admin / Bendahara / Anggota |
| Anggaran / Budget | Tidak ada | **Progress bar per kategori** 🎯 |
| Hapus transaksi | Tidak ada | Soft-delete (admin/bendahara) |
| Statistik kategori | Tidak ada | Grafik pengeluaran per kategori |
| Anggota belum setor | Manual cek | **Otomatis tampil di Portofolio** |
| Export | PDF + CSV | PDF + CSV (tetap ada) |
| Deploy | Google Apps Script | **Vercel (gratis)** |

---

## 🚀 Cara Setup (Langkah Demi Langkah)

### 1. Buat Project Supabase

1. Buka [supabase.com](https://supabase.com) → **New Project**
2. Isi nama project, pilih region terdekat (Singapore)
3. Tunggu project selesai dibuat (~2 menit)

### 2. Setup Database

1. Di Supabase dashboard → **SQL Editor** → **New Query**
2. Copy-paste seluruh isi file `supabase/schema.sql`
3. Klik **Run** — semua tabel, RLS, storage, dan trigger akan terbuat otomatis

### 3. Aktifkan Google OAuth (Opsional tapi disarankan)

1. Supabase → **Authentication** → **Providers** → aktifkan **Google**
2. Buka [Google Cloud Console](https://console.cloud.google.com)
3. Buat project baru → **APIs & Services** → **Credentials** → **Create OAuth Client**
4. Authorized redirect URIs: `https://SUPABASE_PROJECT_ID.supabase.co/auth/v1/callback`
5. Copy Client ID dan Secret ke Supabase

### 4. Clone & Install

```bash
# Clone atau download project ini
git clone https://github.com/username/cyartha.git
cd cyartha

# Install dependencies
npm install

# Salin file environment
cp .env.example .env.local
```

### 5. Isi Environment Variables

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Ambil nilai dari: Supabase → **Project Settings** → **API**

### 6. Jalankan di Lokal

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000)

### 7. Deploy ke Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Ikuti instruksi, lalu tambahkan env vars:
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add NEXT_PUBLIC_SITE_URL  # isi dengan URL Vercel kamu
```

Atau lewat Vercel Dashboard:
1. Import repository dari GitHub
2. Tambah environment variables di **Settings → Environment Variables**
3. Deploy!

---

## 👥 Manajemen Role

Setelah semua anggota mendaftar, admin perlu mengatur role melalui Supabase:

1. Supabase → **Table Editor** → tabel `profiles`
2. Cari email yang ingin dijadikan admin/bendahara
3. Ubah kolom `role` menjadi `admin` atau `bendahara`

**Role dan aksesnya:**
- `admin` — bisa lihat semua data, hapus transaksi, kelola anggaran
- `bendahara` — sama seperti admin
- `anggota` — hanya bisa tambah transaksi dan lihat data

---

## 📁 Struktur Project

```
cyartha/
├── app/
│   ├── layout.tsx          # Root layout (font, metadata)
│   ├── globals.css         # Semua style
│   ├── page.tsx            # Halaman login
│   ├── auth/callback/      # Handler OAuth callback
│   └── dashboard/
│       └── page.tsx        # Dashboard utama (aplikasi penuh)
├── lib/
│   ├── supabase.ts         # Client Supabase + tipe data
│   └── supabase-server.ts  # Server-side Supabase client
├── middleware.ts            # Proteksi rute (redirect jika belum login)
├── supabase/
│   └── schema.sql          # Skema database lengkap
├── .env.example            # Template env variables
└── package.json
```

---

## 🔧 Kustomisasi

### Ubah daftar anggota
Di `app/dashboard/page.tsx`, cari:
```ts
const DAFTAR_ANGGOTA = ['Yona', 'Annisa', ...];
```
Ubah sesuai nama anggota KKN kamu.

### Ubah nama/branding
Di `app/globals.css`, ganti `Cy` dan `artha` sesuai keinginan.
Di `app/layout.tsx`, ubah `metadata.title`.

### Kontak CS
Di `app/dashboard/page.tsx`, cari bagian `cs-container` dan ubah:
- Nomor WhatsApp
- Alamat email support

---

## 🛡️ Keamanan

- **Row Level Security (RLS)** aktif di semua tabel
- Anggota hanya bisa membaca transaksi milik semua (transparan)
- Hanya admin/bendahara yang bisa menghapus transaksi atau mengelola anggaran
- File bukti foto tersimpan di Supabase Storage (bukan publik, hanya akses authenticated)
- Middleware Next.js memastikan halaman dashboard tidak bisa diakses tanpa login

---

## 📞 Support

- WhatsApp: [wa.me/6285643312905](https://wa.me/6285643312905)
- Email: cyborged30s@gmail.com
