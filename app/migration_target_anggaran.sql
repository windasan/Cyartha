-- ============================================================
-- CYARTHA — MIGRASI: FITUR TARGET ANGGARAN
-- Jalankan di Supabase SQL Editor
-- ============================================================

-- ─── 1. TABEL MASTER TARGET ──────────────────────────────────
create table if not exists public.target_anggaran (
  id          uuid primary key default gen_random_uuid(),
  judul       text not null,
  deskripsi   text,
  deadline    date,
  status      text not null default 'aktif'
              check (status in ('aktif', 'selesai', 'dibatalkan')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

comment on table public.target_anggaran is
  'Master target dana — header level (misal: KKN Batur 2026)';

-- ─── 2. TABEL LINE ITEMS ─────────────────────────────────────
create table if not exists public.target_items (
  id           uuid primary key default gen_random_uuid(),
  target_id    uuid not null references public.target_anggaran(id) on delete cascade,
  nama_item    text not null,
  tipe_satuan  text not null default 'borongan'
               check (tipe_satuan in ('per_orang', 'per_bulan', 'borongan')),
  volume       numeric(10,2) not null default 1 check (volume > 0),
  harga_satuan numeric(15,2) not null check (harga_satuan >= 0),
  prioritas    text not null default 'penting'
               check (prioritas in ('darurat', 'penting', 'opsional')),
  catatan      text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now()
);

comment on table public.target_items is
  'Line items — rincian komponen biaya dari sebuah target';

-- ─── 3. COMPUTED COLUMN HELPER (view) ────────────────────────
-- View yang menghitung subtotal setiap item dan total per target
create or replace view public.target_anggaran_summary as
select
  ta.id,
  ta.judul,
  ta.deskripsi,
  ta.deadline,
  ta.status,
  ta.created_by,
  ta.created_at,
  coalesce(sum(ti.volume * ti.harga_satuan), 0) as total_target,
  count(ti.id)                                  as jumlah_item,
  count(ti.id) filter (where ti.prioritas = 'darurat')  as item_darurat,
  count(ti.id) filter (where ti.prioritas = 'penting')  as item_penting,
  count(ti.id) filter (where ti.prioritas = 'opsional') as item_opsional
from public.target_anggaran ta
left join public.target_items ti on ti.target_id = ta.id
group by ta.id;

-- ─── 4. TRIGGER: auto update updated_at ──────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_target_anggaran_updated_at on public.target_anggaran;
create trigger trg_target_anggaran_updated_at
  before update on public.target_anggaran
  for each row execute function public.set_updated_at();

-- ─── 5. TRIGGER: recalculate target total on item change ─────
-- Setiap kali item berubah, kita simpan cache total ke target
-- (opsional — bisa digunakan untuk notifikasi atau audit)
create or replace function public.notify_target_updated()
returns trigger language plpgsql security definer as $$
begin
  update public.target_anggaran
  set updated_at = now()
  where id = coalesce(new.target_id, old.target_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_target_items_notify on public.target_items;
create trigger trg_target_items_notify
  after insert or update or delete on public.target_items
  for each row execute function public.notify_target_updated();

-- ─── 6. INDEXES ──────────────────────────────────────────────
create index if not exists idx_target_items_target_id
  on public.target_items(target_id);

create index if not exists idx_target_anggaran_status
  on public.target_anggaran(status);

create index if not exists idx_target_anggaran_created_by
  on public.target_anggaran(created_by);

-- ─── 7. ROW LEVEL SECURITY ───────────────────────────────────
alter table public.target_anggaran enable row level security;
alter table public.target_items     enable row level security;

-- Drop existing policies if re-running migration
drop policy if exists "target_anggaran_select" on public.target_anggaran;
drop policy if exists "target_anggaran_insert" on public.target_anggaran;
drop policy if exists "target_anggaran_update" on public.target_anggaran;
drop policy if exists "target_anggaran_delete" on public.target_anggaran;
drop policy if exists "target_items_select"    on public.target_items;
drop policy if exists "target_items_insert"    on public.target_items;
drop policy if exists "target_items_delete"    on public.target_items;

-- Semua user yang login bisa melihat semua target (data dibagi)
create policy "target_anggaran_select"
  on public.target_anggaran for select
  to authenticated
  using (true);

-- Semua user yang login bisa buat target
create policy "target_anggaran_insert"
  on public.target_anggaran for insert
  to authenticated
  with check (auth.uid() is not null);

-- Hanya pembuat atau admin yang bisa update
-- (di aplikasi, canManage sudah difilter dari profile.role)
create policy "target_anggaran_update"
  on public.target_anggaran for update
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'bendahara')
    )
  );

-- Hanya pembuat atau admin yang bisa hapus
create policy "target_anggaran_delete"
  on public.target_anggaran for delete
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'bendahara')
    )
  );

-- Items: semua user yang login bisa lihat
create policy "target_items_select"
  on public.target_items for select
  to authenticated
  using (true);

-- Items: semua user bisa input item ke target yang ada
create policy "target_items_insert"
  on public.target_items for insert
  to authenticated
  with check (
    auth.uid() is not null
    and exists (
      select 1 from public.target_anggaran
      where id = target_id and status = 'aktif'
    )
  );

-- Items: hanya penginput atau admin yang bisa hapus
create policy "target_items_delete"
  on public.target_items for delete
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'bendahara')
    )
  );

-- ─── 8. PASTIKAN KOLOM profiles.role ADA ─────────────────────
-- Jalankan hanya jika tabel profiles belum punya kolom role
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'profiles' and column_name = 'role'
  ) then
    alter table public.profiles
      add column role text not null default 'anggota'
        check (role in ('admin', 'bendahara', 'anggota'));
  end if;
end $$;

-- ─── 9. SAMPLE DATA (OPSIONAL — hapus jika tidak perlu) ──────
/*
insert into public.target_anggaran (judul, deskripsi, deadline, status)
values
  ('KKN Batur 2026', 'Total kebutuhan dana selama periode KKN', '2026-08-01', 'aktif'),
  ('Proker Agustusan', 'Anggaran perayaan 17 Agustus', '2026-08-17', 'aktif');

-- Contoh items untuk target pertama
insert into public.target_items (target_id, nama_item, tipe_satuan, volume, harga_satuan, prioritas)
select
  id,
  item.nama,
  item.tipe,
  item.vol,
  item.harga,
  item.prioritas
from public.target_anggaran ta,
(values
  ('Korsa Kelompok', 'per_orang', 25, 200000, 'penting'),
  ('Sewa Posko', 'per_bulan', 4, 1500000, 'darurat'),
  ('Angkutan Berangkat', 'borongan', 1, 3000000, 'darurat'),
  ('Konsumsi Mingguan', 'per_bulan', 4, 500000, 'penting'),
  ('Dokumentasi', 'borongan', 1, 750000, 'opsional')
) as item(nama, tipe, vol, harga, prioritas)
where ta.judul = 'KKN Batur 2026';
*/

-- ─── SELESAI ─────────────────────────────────────────────────
-- Verifikasi:
-- select * from public.target_anggaran_summary;
