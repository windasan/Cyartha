'use client';
import React, { useEffect, useState, useCallback, ChangeEvent, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  createClient, formatRp, formatTanggal, getPeriodeSekarang,
  type Profile, type Transaksi, type Anggaran, type DashboardData,
} from '@/lib/supabase';
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale,
  LinearScale, BarElement,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import Swal from 'sweetalert2';
import {
  Home, Headset, BarChart2, Briefcase, Target, LogOut,
  Search, Eye, EyeOff, TrendingDown, ArrowDownCircle, ArrowUpCircle,
  Wallet, X, Trash2, Save, Paperclip, Inbox, Receipt,
  Plus, Filter, MessageCircle, Camera, CheckCircle, AlertTriangle,
  Clock, Download, Pencil, Users, UserCheck, UserX, ChevronRight,
  Mail, Phone, TrendingUp, CalendarDays, Layers, Star,
  ChevronDown, ChevronUp, Package, ZapIcon, Flag,
} from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

type Tab = 'home' | 'tracker' | 'arus kas' | 'anggaran';
type ChartMode = 'donut' | 'bar';
type AnggaranView = 'pengeluaran' | 'target';

// ─── NEW: Target Anggaran Types ───────────────────────────────
type TipeSatuan = 'per_orang' | 'per_bulan' | 'borongan';
type Prioritas  = 'darurat' | 'penting' | 'opsional';

interface TargetAnggaran {
  id: string;
  judul: string;
  deskripsi?: string;
  deadline?: string;
  status: 'aktif' | 'selesai' | 'dibatalkan';
  created_by?: string;
  created_at: string;
}

interface TargetItem {
  id: string;
  target_id: string;
  nama_item: string;
  tipe_satuan: TipeSatuan;
  volume: number;
  harga_satuan: number;
  prioritas: Prioritas;
  catatan?: string;
  subtotal: number; // computed: volume * harga_satuan
}

interface TargetWithItems extends TargetAnggaran {
  items: TargetItem[];
  totalTarget: number;
  gap: number;
  monthsLeft: number;
  monthlyNeeded: number;
  progressPct: number;
}

// ─── HELPERS ─────────────────────────────────────────────────
function compressImage(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round((h * MAX) / w); w = MAX; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        resolve({ base64: dataUrl.split(',')[1], mime: 'image/jpeg' });
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function getBudgetClass(pct: number): string {
  if (pct >= 100) return 'danger';
  if (pct >= 75)  return 'warn';
  return 'safe';
}

function getGapClass(gap: number): string {
  if (gap <= 0)         return 'safe';   // target sudah tercapai
  if (gap > 0)          return 'warn';
  return 'safe';
}

function formatTipeSatuan(t: TipeSatuan, volume: number): string {
  if (t === 'per_orang') return `${volume} orang`;
  if (t === 'per_bulan') return `${volume} bulan`;
  return 'Borongan';
}

function getPrioritasConfig(p: Prioritas) {
  if (p === 'darurat') return { label: 'Darurat',  color: '#F43F5E', bg: '#FFE4E6', icon: '🚨' };
  if (p === 'penting') return { label: 'Penting',  color: '#F59E0B', bg: '#FEF3C7', icon: '⚡' };
  return               { label: 'Opsional', color: '#10B981', bg: '#D1FAE5', icon: '✨' };
}

function getMonthsLeft(deadline?: string): number {
  if (!deadline) return 0;
  const now  = new Date();
  const dead = new Date(deadline);
  const diff = (dead.getFullYear() - now.getFullYear()) * 12 + (dead.getMonth() - now.getMonth());
  return Math.max(diff, 1);
}

function formatWaktuTanggal(createdAt: string): string {
  try {
    const d    = new Date(createdAt);
    const jam  = d.getHours().toString().padStart(2, '0');
    const mnt  = d.getMinutes().toString().padStart(2, '0');
    const bln  = ['Januari','Februari','Maret','April','Mei','Juni','Juli',
                  'Agustus','September','Oktober','November','Desember'][d.getMonth()];
    return `${jam}.${mnt}  ${d.getDate()} ${bln} ${d.getFullYear()}`;
  } catch { return '-'; }
}

function getStatusKas(nama: string, riwayat: Transaksi[]) {
  const now          = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const paid         = riwayat.some(
    t => t.jenis === 'Kas' && t.kategori === nama && t.tanggal.startsWith(currentMonth)
  );
  if (paid)                 return { text: 'Lunas Bulan Ini',          color: '#10B981', icon: 'check'   };
  if (now.getDate() >= 2)   return { text: 'Belum Bayar (Jatuh Tempo)', color: '#F43F5E', icon: 'warning' };
  return                           { text: 'Menunggu Pembayaran',       color: '#F59E0B', icon: 'clock'   };
}

// ─── LEDGER ITEM ──────────────────────────────────────────────
function LedgerItem({ trx, onClick }: { trx: Transaksi; onClick: () => void }) {
  const amtClass  = trx.jenis === 'Pengeluaran' ? 'negative' : trx.jenis === 'Kas' ? 'neutral' : 'positive';
  const sign      = trx.jenis === 'Pengeluaran' ? '-' : '+';
  const LedgerIco = trx.jenis === 'Pengeluaran'
    ? <TrendingDown size={18} />
    : trx.jenis === 'Kas'
    ? <Wallet size={18} />
    : <ArrowDownCircle size={18} />;

  return (
    <div className="ledger-item" onClick={onClick}>
      <div className="ledger-left">
        <div className={`ledger-icon jenis-${trx.jenis.toLowerCase()}`}>{LedgerIco}</div>
        <div className="ledger-info">
          <div className="ledger-title">
            {trx.kategori}
            {trx.bukti_url && <Paperclip size={12} style={{ display: 'inline', marginLeft: 4, opacity: 0.6 }} />}
          </div>
          <div className="ledger-sub">{trx.keterangan}</div>
        </div>
      </div>
      <div className="ledger-right">
        <div className={`ledger-amount ${amtClass}`}>{sign}{formatRp(trx.nominal)}</div>
        <div className="ledger-date">{formatTanggal(trx.tanggal)}</div>
      </div>
    </div>
  );
}

// ─── TARGET ITEM ROW ──────────────────────────────────────────
function TargetItemRow({
  item, onDelete, canManage,
}: { item: TargetItem; onDelete: (id: string) => void; canManage: boolean }) {
  const p = getPrioritasConfig(item.prioritas);
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 0',
      borderBottom: '1px solid #F1F5F9',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: p.bg, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
      }}>
        {p.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0F1923', marginBottom: 2 }}>
          {item.nama_item}
        </div>
        <div style={{ fontSize: '0.76rem', color: '#94A3B8', marginBottom: 4 }}>
          {formatTipeSatuan(item.tipe_satuan, item.volume)} × {formatRp(item.harga_satuan)}
          {item.catatan && <> · <em>{item.catatan}</em></>}
        </div>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 50,
          fontSize: '0.7rem', fontWeight: 700, background: p.bg, color: p.color,
        }}>
          {p.label}
        </span>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, color: '#001E36', fontSize: '0.95rem' }}>
          {formatRp(item.subtotal)}
        </div>
        {canManage && (
          <button
            onClick={() => onDelete(item.id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F43F5E', marginTop: 4, padding: 2 }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────
export default function DashboardPage() {
  const supabase = createClient();
  const router   = useRouter();

  // ── Existing State ───────────────────────────────────────────
  const [profile,          setProfile]          = useState<Profile | null>(null);
  const [data,             setData]             = useState<DashboardData | null>(null);
  const [filtered,         setFiltered]         = useState<Transaksi[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [activeTab,        setActiveTab]        = useState<Tab>('home');
  const [chartMode,        setChartMode]        = useState<ChartMode>('donut');
  const [masked,           setMasked]           = useState(true);
  const [csOpen,           setCsOpen]           = useState(false);
  const [showProfileMenu,  setShowProfileMenu]  = useState(false);
  const [realtimeConnected,setRealtimeConnected]= useState(false);
  const [daftarAnggota,    setDaftarAnggota]    = useState<{id: string; nama: string; avatar_url?: string}[]>([]);
  const [modalAnggota,     setModalAnggota]     = useState(false);
  const [namaAnggotaBaru,  setNamaAnggotaBaru]  = useState('');
  const [editAnggotaId,    setEditAnggotaId]    = useState<string | null>(null);
  const [editAnggotaNama,  setEditAnggotaNama]  = useState('');
  const [editAnggotaLoading,setEditAnggotaLoading]=useState(false);
  const [avatarUploading,  setAvatarUploading]  = useState(false);
  const [anggotaAvatarUploading,setAnggotaAvatarUploading]=useState<string|null>(null);
  const profileAvatarRef = useRef<HTMLInputElement>(null);
  const anggotaAvatarRef = useRef<HTMLInputElement>(null);
  const [targetAnggotaId, setTargetAnggotaId]  = useState<string | null>(null);
  const [search,           setSearch]           = useState('');
  const [filterTipe,       setFilterTipe]       = useState('Semua');
  const [filterMulai,      setFilterMulai]      = useState('');
  const [filterAkhir,      setFilterAkhir]      = useState('');
  const [trxModal,         setTrxModal]         = useState(false);
  const [filterModal,      setFilterModal]      = useState(false);
  const [detailModal,      setDetailModal]      = useState(false);
  const [anggaranModal,    setAnggaranModal]    = useState(false);
  const [detailTrx,        setDetailTrx]        = useState<Transaksi | null>(null);
  const [detailKasAnggota, setDetailKasAnggota] = useState<string | null>(null);
  const [form, setForm] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    jenis: 'Pemasukan' as 'Pemasukan' | 'Pengeluaran' | 'Kas',
    kategori: '', anggota: '', nominal: '', keterangan: '',
  });
  const [fotoFile,    setFotoFile]    = useState<File | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [angForm, setAngForm] = useState({ kategori: '', batas: '', periode: getPeriodeSekarang() });
  const [angLoading, setAngLoading]   = useState(false);

  // ── NEW: Target Anggaran State ────────────────────────────────
  const [anggaranView, setAnggaranView]           = useState<AnggaranView>('pengeluaran');
  const [targetList,   setTargetList]             = useState<TargetWithItems[]>([]);
  const [activeTarget, setActiveTarget]           = useState<TargetWithItems | null>(null);
  const [showTargetForm, setShowTargetForm]       = useState(false);
  const [showItemForm,   setShowItemForm]         = useState(false);
  const [expandedTarget, setExpandedTarget]       = useState<string | null>(null);

  // Form: buat master target
  const [tForm, setTForm] = useState({ judul: '', deskripsi: '', deadline: '' });
  const [tLoading, setTLoading] = useState(false);

  // Form: tambah item — support multi-item sekaligus
  const [itemRows, setItemRows] = useState<{
    nama_item: string; tipe_satuan: TipeSatuan; volume: string;
    harga_satuan: string; prioritas: Prioritas; catatan: string;
  }[]>([{ nama_item: '', tipe_satuan: 'borongan', volume: '1', harga_satuan: '', prioritas: 'penting', catatan: '' }]);
  const [iLoading, setILoading] = useState(false);

  // ─── LOAD DATA ──────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/'); return; }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (prof) setProfile(prof);

      const { data: allAnggota } = await supabase.from('anggota_kkn').select('*').order('nama');
      if (allAnggota) setDaftarAnggota(allAnggota);

      const { data: rows, error } = await supabase
        .from('transaksi').select('*').eq('status', 'aktif')
        .order('tanggal', { ascending: false }).order('created_at', { ascending: false });
      if (error) throw error;

      const riwayat: Transaksi[] = rows || [];
      let totalPemasukanMurni = 0, totalPengeluaran = 0, totalKas = 0;
      const kasMap: Record<string, number> = {};

      riwayat.forEach(t => {
        const n = Number(t.nominal);
        if (t.jenis === 'Pemasukan')  totalPemasukanMurni += n;
        if (t.jenis === 'Pengeluaran') totalPengeluaran   += n;
        if (t.jenis === 'Kas') { totalKas += n; kasMap[t.kategori] = (kasMap[t.kategori] || 0) + n; }
      });

      const rekapKas = (allAnggota || []).map(p => ({
        nama: p.nama, total: kasMap[p.nama] || 0,
      })).sort((a, b) => b.total - a.total);

      const { data: angRows } = await supabase.from('anggaran').select('*').order('kategori');
      const saldo = (totalPemasukanMurni + totalKas) - totalPengeluaran;

      setData({
        saldo, pemasukan: totalPemasukanMurni,
        pengeluaran: totalPengeluaran, totalKas, riwayat, rekapKas,
        anggaranList: angRows || [],
      });

      // Load target anggaran
      const { data: targets } = await supabase
        .from('target_anggaran')
        .select('*')
        .order('created_at', { ascending: false });

      if (targets) {
        const { data: allItems } = await supabase
          .from('target_items')
          .select('*')
          .in('target_id', targets.map(t => t.id));

        const withItems: TargetWithItems[] = targets.map(t => {
          const items: TargetItem[] = (allItems || [])
            .filter(i => i.target_id === t.id)
            .map(i => ({ ...i, subtotal: Number(i.volume) * Number(i.harga_satuan) }));
          const totalTarget   = items.reduce((s, i) => s + i.subtotal, 0);
          const gap           = Math.max(totalTarget - saldo, 0);
          const monthsLeft    = getMonthsLeft(t.deadline);
          const monthlyNeeded = monthsLeft > 0 ? gap / monthsLeft : gap;
          const progressPct   = totalTarget > 0 ? Math.min((saldo / totalTarget) * 100, 100) : 0;
          return { ...t, items, totalTarget, gap, monthsLeft, monthlyNeeded, progressPct };
        });
        setTargetList(withItems);
      }

    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase, router]);

  // ─── REALTIME ───────────────────────────────────────────────
  useEffect(() => {
    loadAll();
    const channel = supabase.channel('realtime-cyartha')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transaksi' },    () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anggaran' },     () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anggota_kkn' },  () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'target_anggaran'}, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'target_items' }, () => loadAll())
      .subscribe(status => setRealtimeConnected(status === 'SUBSCRIBED'));
    return () => { supabase.removeChannel(channel); };
  }, [loadAll, supabase]);

  // ─── FILTER ─────────────────────────────────────────────────
  useEffect(() => {
    if (!data) return;
    const kw = search.toLowerCase();
    const f  = data.riwayat.filter(t => {
      const matchSearch = t.kategori.toLowerCase().includes(kw) || t.keterangan.toLowerCase().includes(kw);
      let matchTipe  = true;
      if (filterTipe === 'Pemasukan')  matchTipe = t.jenis === 'Pemasukan';
      else if (filterTipe === 'Pengeluaran') matchTipe = t.jenis === 'Pengeluaran';
      else if (filterTipe === 'Kas')   matchTipe = t.jenis === 'Kas';
      let matchWaktu = true;
      if (filterMulai) matchWaktu  = t.tanggal >= filterMulai;
      if (filterAkhir) matchWaktu  = matchWaktu && t.tanggal <= filterAkhir;
      return matchSearch && matchTipe && matchWaktu;
    });
    setFiltered(f);
  }, [data, search, filterTipe, filterMulai, filterAkhir]);

  // ─── EXISTING HANDLERS ──────────────────────────────────────
  async function handleSubmit() {
    if (!profile) return;
    const rawNominal = parseFloat(form.nominal.replace(/\./g, ''));
    if (isNaN(rawNominal) || rawNominal <= 0)
      return Swal.fire('Nominal tidak valid', 'Masukkan nominal yang benar', 'warning');
    const kategori = form.jenis === 'Kas' ? form.anggota : form.kategori;
    if (!kategori) return Swal.fire('Kategori/Nama kosong', 'Harap lengkapi isian form', 'warning');
    setFormLoading(true);
    try {
      let bukti_url = null;
      if (fotoFile) {
        const { base64, mime } = await compressImage(fotoFile);
        const path = `${profile.id}/${Date.now()}.jpg`;
        const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const { error: uploadErr } = await supabase.storage.from('receipts').upload(path, byteArray, { contentType: mime });
        if (!uploadErr) bukti_url = supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from('transaksi').insert({
        tanggal: form.tanggal, jenis: form.jenis, kategori, nominal: rawNominal,
        keterangan: form.keterangan || '-', bukti_url, created_by: profile.id,
        email_aktor: profile.email, status: 'aktif',
      });
      if (error) throw error;
      setTrxModal(false); resetForm(); await loadAll();
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Tersimpan!', showConfirmButton: false, timer: 1500 });
    } catch (err) { Swal.fire('Gagal', String(err), 'error'); }
    finally { setFormLoading(false); }
  }

  async function handleSaveAnggaran() {
    if (!angForm.kategori || !angForm.batas) return;
    setAngLoading(true);
    try {
      const nominalAngka = parseFloat(angForm.batas.replace(/\./g, ''));
      const { error } = await supabase.from('anggaran').upsert({
        kategori: angForm.kategori, batas: nominalAngka, periode: angForm.periode,
      }, { onConflict: 'kategori,periode' });
      if (error) throw error;
      setAnggaranModal(false); setAngForm({ kategori: '', batas: '', periode: getPeriodeSekarang() });
      await loadAll();
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Anggaran diperbarui!', showConfirmButton: false, timer: 1500 });
    } catch (err) { Swal.fire('Gagal menyimpan anggaran', String(err), 'error'); }
    finally { setAngLoading(false); }
  }

  async function handleSaveAnggota() {
    if (!namaAnggotaBaru) return;
    setFormLoading(true);
    try {
      const { error } = await supabase.from('anggota_kkn').insert({ nama: namaAnggotaBaru });
      if (error) throw error;
      setModalAnggota(false); setNamaAnggotaBaru(''); await loadAll();
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Anggota ditambah!', showConfirmButton: false, timer: 1500 });
    } catch { Swal.fire('Gagal', 'Nama mungkin sudah ada.', 'error'); }
    finally { setFormLoading(false); }
  }

  async function handleEditAnggota() {
    if (!editAnggotaId || !editAnggotaNama.trim()) return;
    setEditAnggotaLoading(true);
    const namaLama = daftarAnggota.find(a => a.id === editAnggotaId)?.nama;
    const namaBaru = editAnggotaNama.trim();
    try {
      const { error: errAnggota } = await supabase.from('anggota_kkn').update({ nama: namaBaru }).eq('id', editAnggotaId);
      if (errAnggota) throw errAnggota;
      if (namaLama && namaLama !== namaBaru) {
        await supabase.from('transaksi').update({ kategori: namaBaru }).eq('jenis', 'Kas').eq('kategori', namaLama);
      }
      setEditAnggotaId(null); setEditAnggotaNama(''); await loadAll();
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Nama & transaksi diperbarui!', showConfirmButton: false, timer: 1800 });
    } catch (err) { Swal.fire('Gagal', String(err), 'error'); }
    finally { setEditAnggotaLoading(false); }
  }

  async function handleHapusAnggota(id: string, nama: string) {
    const confirm = await Swal.fire({
      title: `Hapus "${nama}"?`, text: 'Data riwayat kas tidak akan terhapus.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#F43F5E', confirmButtonText: 'Ya, Hapus',
    });
    if (!confirm.isConfirmed) return;
    const { error } = await supabase.from('anggota_kkn').delete().eq('id', id);
    if (!error) { await loadAll(); Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Anggota dihapus', showConfirmButton: false, timer: 1500 }); }
    else Swal.fire('Gagal', String(error.message), 'error');
  }

  async function handleProfileAvatarUpload(file: File) {
    if (!profile) return;
    setAvatarUploading(true);
    try {
      const { base64, mime } = await compressImage(file);
      const path = `profiles/${profile.id}/avatar.jpg`;
      const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      await supabase.storage.from('avatars').remove([path]);
      await supabase.storage.from('avatars').upload(path, byteArray, { contentType: mime, upsert: true });
      const publicUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl + `?t=${Date.now()}`;
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id);
      setProfile(prev => prev ? { ...prev, avatar_url: publicUrl } : prev);
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Foto profil diperbarui!', showConfirmButton: false, timer: 1500 });
    } catch (err) { Swal.fire('Gagal upload', String(err), 'error'); }
    finally { setAvatarUploading(false); }
  }

  async function handleAnggotaAvatarUpload(anggotaId: string, file: File) {
    setAnggotaAvatarUploading(anggotaId);
    try {
      const { base64, mime } = await compressImage(file);
      const path = `anggota/${anggotaId}/avatar.jpg`;
      const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
      await supabase.storage.from('avatars').upload(path, byteArray, { contentType: mime, upsert: true });
      const publicUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl + `?t=${Date.now()}`;
      await supabase.from('anggota_kkn').update({ avatar_url: publicUrl }).eq('id', anggotaId);
      setDaftarAnggota(prev => prev.map(a => a.id === anggotaId ? { ...a, avatar_url: publicUrl } : a));
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Foto anggota diperbarui!', showConfirmButton: false, timer: 1500 });
    } catch (err) { Swal.fire('Gagal upload', String(err), 'error'); }
    finally { setAnggotaAvatarUploading(null); }
  }

  async function handleDeleteTrx(id: string) {
    if (!canManage) return;
    const confirm = await Swal.fire({ title: 'Hapus Transaksi?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#F43F5E', confirmButtonText: 'Ya, Hapus' });
    if (!confirm.isConfirmed) return;
    const { error } = await supabase.from('transaksi').update({ status: 'dihapus' }).eq('id', id);
    if (!error) { setDetailModal(false); await loadAll(); }
  }

  async function handleLogout() { await supabase.auth.signOut(); router.push('/'); }

  // ─── NEW: Target Handlers ─────────────────────────────────
  async function handleCreateTarget() {
    if (!tForm.judul.trim()) return Swal.fire('Judul kosong', 'Masukkan judul target', 'warning');
    setTLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('target_anggaran').insert({
        judul: tForm.judul.trim(),
        deskripsi: tForm.deskripsi || null,
        deadline: tForm.deadline || null,
        status: 'aktif',
        created_by: user?.id,
      });
      if (error) throw error;
      setShowTargetForm(false);
      setTForm({ judul: '', deskripsi: '', deadline: '' });
      await loadAll();
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Target dibuat!', showConfirmButton: false, timer: 1500 });
    } catch (err) { Swal.fire('Gagal', String(err), 'error'); }
    finally { setTLoading(false); }
  }

  async function handleDeleteTarget(id: string) {
    const c = await Swal.fire({ title: 'Hapus Target?', text: 'Semua item anggaran di dalamnya juga akan terhapus.', icon: 'warning', showCancelButton: true, confirmButtonColor: '#F43F5E', confirmButtonText: 'Ya, Hapus' });
    if (!c.isConfirmed) return;
    await supabase.from('target_anggaran').delete().eq('id', id);
    await loadAll();
    if (activeTarget?.id === id) setActiveTarget(null);
  }

  async function handleSaveItems() {
    if (!activeTarget) return;
    const valid = itemRows.filter(r => r.nama_item.trim() && r.harga_satuan);
    if (!valid.length) return Swal.fire('Item kosong', 'Isi minimal 1 item dengan nama dan harga', 'warning');
    setILoading(true);
    try {
      const inserts = valid.map(r => ({
        target_id:    activeTarget.id,
        nama_item:    r.nama_item.trim(),
        tipe_satuan:  r.tipe_satuan,
        volume:       parseFloat(r.volume) || 1,
        harga_satuan: parseFloat(r.harga_satuan.replace(/\./g, '')),
        prioritas:    r.prioritas,
        catatan:      r.catatan || null,
      }));
      const { error } = await supabase.from('target_items').insert(inserts);
      if (error) throw error;
      setShowItemForm(false);
      setItemRows([{ nama_item: '', tipe_satuan: 'borongan', volume: '1', harga_satuan: '', prioritas: 'penting', catatan: '' }]);
      await loadAll();
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: `${valid.length} item ditambahkan!`, showConfirmButton: false, timer: 1800 });
    } catch (err) { Swal.fire('Gagal', String(err), 'error'); }
    finally { setILoading(false); }
  }

  async function handleDeleteItem(itemId: string) {
    await supabase.from('target_items').delete().eq('id', itemId);
    await loadAll();
  }

  function addItemRow() {
    setItemRows(prev => [...prev, { nama_item: '', tipe_satuan: 'borongan', volume: '1', harga_satuan: '', prioritas: 'penting', catatan: '' }]);
  }

  function removeItemRow(idx: number) {
    setItemRows(prev => prev.filter((_, i) => i !== idx));
  }

  function updateItemRow(idx: number, key: string, val: string) {
    setItemRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  }

  // ─── Export ──────────────────────────────────────────────────
  function exportPDF() {
    if (!filtered.length) { Swal.fire('Data kosong', 'Tidak ada data untuk diexport', 'info'); return; }
    import('html2pdf.js').then(({ default: html2pdf }) => {
      let totalIn = 0, totalOut = 0;
      const rows = filtered.map(t => {
        const isIn = t.jenis !== 'Pengeluaran';
        if (isIn) totalIn += Number(t.nominal); else totalOut += Number(t.nominal);
        const color = isIn ? '#10B981' : '#F43F5E';
        const sign  = isIn ? '+' : '-';
        return `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:11px;">${formatTanggal(t.tanggal)}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:11px;">${t.jenis}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:11px;font-weight:600;">${t.kategori}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;font-size:10px;">${t.keterangan}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;color:${color};font-weight:700;font-size:11px;">${sign}${formatRp(t.nominal)}</td>
        </tr>`;
      }).join('');
      const el = document.createElement('div');
      el.style.padding = '20px';
      el.innerHTML = `
        <div style="text-align:center;margin-bottom:20px;">
          <h2 style="color:#001E36;font-size:1.4rem;">LAPORAN MUTASI CYARTHA</h2>
          <p style="color:#64748B;font-size:0.85rem;">Dicetak: ${new Date().toLocaleDateString('id-ID',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <thead><tr style="background:#F1F5F9;">
            <th style="padding:8px;border:1px solid #ddd;text-align:left;font-size:11px;">Tanggal</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;font-size:11px;">Jenis</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;font-size:11px;">Kategori</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:left;font-size:11px;">Keterangan</th>
            <th style="padding:8px;border:1px solid #ddd;text-align:right;font-size:11px;">Nominal</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:20px;text-align:right;">
          <p>Total Masuk: <span style="color:#10B981;font-weight:700;">${formatRp(totalIn)}</span></p>
          <p>Total Keluar: <span style="color:#F43F5E;font-weight:700;">${formatRp(totalOut)}</span></p>
          <hr style="margin:10px 0;">
          <h3 style="color:#001E36;">Saldo Bersih: ${formatRp(totalIn - totalOut)}</h3>
        </div>
      `;
      Swal.fire({ title: 'Membuat PDF...', didOpen: () => Swal.showLoading() });
      html2pdf().set({ margin: 10, filename: `Mutasi_Cyartha_${getPeriodeSekarang()}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(el).save().then(() => Swal.close());
    });
  }

  function exportCSV() {
    if (!filtered.length) { Swal.fire('Data kosong', '', 'info'); return; }
    let csv = '\uFEFFTANGGAL,JENIS,KATEGORI,NOMINAL,KETERANGAN\n';
    filtered.forEach(t => {
      const sign = t.jenis === 'Pengeluaran' ? '-' : '';
      csv += `${t.tanggal},${t.jenis},"${t.kategori}",${sign}${t.nominal},"${t.keterangan}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `Mutasi_Cyartha_${getPeriodeSekarang()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const handleExportMenu = () => {
    Swal.fire({
      title: 'Pilih Format Laporan', icon: 'question', showDenyButton: true, showCancelButton: true,
      confirmButtonText: '📄 PDF', denyButtonText: '📊 CSV', cancelButtonText: 'Batal',
      confirmButtonColor: '#10B981', denyButtonColor: '#00AEEF',
    }).then(r => { if (r.isConfirmed) exportPDF(); else if (r.isDenied) exportCSV(); });
  };

  function resetForm() {
    setForm({ tanggal: new Date().toISOString().split('T')[0], jenis: 'Pemasukan', kategori: '', anggota: '', nominal: '', keterangan: '' });
    setFotoFile(null);
  }

  // ─── COMPUTED ───────────────────────────────────────────────
  const currentMonth    = new Date().toISOString().slice(0, 7);
  const riwayatBulanIni = data?.riwayat.filter(t => t.tanggal.startsWith(currentMonth)) ?? [];

  const donutData = data ? {
    labels: ['Pemasukan', 'Pengeluaran', 'Kas'],
    datasets: [{
      data: [
        riwayatBulanIni.filter(t => t.jenis === 'Pemasukan').reduce((s, t) => s + Number(t.nominal), 0),
        riwayatBulanIni.filter(t => t.jenis === 'Pengeluaran').reduce((s, t) => s + Number(t.nominal), 0),
        riwayatBulanIni.filter(t => t.jenis === 'Kas').reduce((s, t) => s + Number(t.nominal), 0),
      ],
      backgroundColor: ['#00AEEF', '#F43F5E', '#F59E0B'], borderWidth: 0,
    }],
  } : null;

  const barLabels = (() => {
    const dayMap: Record<string, boolean> = {};
    [...riwayatBulanIni].reverse().forEach(t => { dayMap[t.tanggal] = true; });
    return Object.keys(dayMap).sort();
  })();

  const barData = data ? {
    labels: barLabels.map(d => formatTanggal(d).split(' ').slice(0, 2).join(' ')),
    datasets: [
      { label: 'Pemasukan',   data: barLabels.map(d => riwayatBulanIni.filter(t => t.tanggal === d && t.jenis === 'Pemasukan').reduce((s, t) => s + Number(t.nominal), 0)), backgroundColor: '#00AEEF', borderRadius: 6 },
      { label: 'Pengeluaran', data: barLabels.map(d => riwayatBulanIni.filter(t => t.tanggal === d && t.jenis === 'Pengeluaran').reduce((s, t) => s + Number(t.nominal), 0)), backgroundColor: '#F43F5E', borderRadius: 6 },
      { label: 'Kas',         data: barLabels.map(d => riwayatBulanIni.filter(t => t.tanggal === d && t.jenis === 'Kas').reduce((s, t) => s + Number(t.nominal), 0)), backgroundColor: '#F59E0B', borderRadius: 6 },
    ],
  } : null;

  const donutOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 10 } } } } };
  const barOptions   = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' as const, labels: { boxWidth: 12, font: { size: 10 } } } }, scales: { x: { border: { display: false }, grid: { display: false, drawOnChartArea: false, drawTicks: false } }, y: { border: { display: false }, grid: { display: false, drawOnChartArea: false, drawTicks: false }, ticks: { display: false } } } };

  const anggaranWithProgress = data?.anggaranList.map(ang => {
    const spent = data.riwayat.filter(t => t.jenis === 'Pengeluaran' && t.kategori.toLowerCase() === ang.kategori.toLowerCase() && t.tanggal.startsWith(ang.periode)).reduce((s, t) => s + Number(t.nominal), 0);
    const pct   = Math.min(Math.round((spent / ang.batas) * 100), 100);
    return { ...ang, spent, pct, cls: getBudgetClass(pct) };
  }) ?? [];

  const canManage = profile?.role === 'admin' || profile?.role === 'bendahara';

  const statsKas = (() => {
    if (!data || !daftarAnggota.length) return { lunas: 0, belum: 0, total: 0 };
    const total = daftarAnggota.length;
    let lunas = 0;
    daftarAnggota.forEach(a => { if (getStatusKas(a.nama, data.riwayat).icon === 'check') lunas++; });
    return { lunas, belum: total - lunas, total };
  })();

  // Live preview nominal for item rows
  const previewTotal = itemRows.reduce((s, r) => {
    const v = parseFloat(r.volume)      || 0;
    const h = parseFloat(r.harga_satuan.replace(/\./g, '')) || 0;
    return s + v * h;
  }, 0);

  // Quotes
  const quotes = [
    'Semua burger hanya milik Allah. Juicy Luicy, Rizky Febian, Mahalini, I love you so much.',
    'Semua saldo rekening hanya milik Allah. Nadin Amizah, Coldplay, Bismillah baca Al-Quran, rekam, posting!',
    'Semua anggota Susur Batur hanya milik Allah. Deddy Corbuzier, Nissa Sabyan, I love you so much.',
    'Semua data Cyartha hanya milik Allah. Oasis, James Miller, Bismillah Alhamdulillah.',
    'Semua utang piutang hanya milik Allah. Lionel Messi, Mbappe, I love you so much.',
    'Semua sate taichan hanya milik Allah. Bismillah, Vidi Aldiano, Sheila On 7, tetap semangat!',
  ];
  const [randomQuote, setRandomQuote] = useState('');
  useEffect(() => { if (loading) setRandomQuote(quotes[Math.floor(Math.random() * quotes.length)]); }, [loading]);

  // ─── LOADING ────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', background: 'var(--blu-navy)', padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <div className="spinner" style={{ width: 40, height: 40, borderWidth: 4, borderTopColor: 'var(--blu-cyan)', marginBottom: 24 }} />
        <div style={{ maxWidth: '450px' }}>
          <p style={{ color: 'var(--blu-cyan)', fontSize: '0.75rem', letterSpacing: '3px', fontWeight: 'bold', margin: '0 0 12px 0', opacity: 0.8 }}>SYSTEM LOADING...</p>
          <div style={{ padding: '20px', border: '1px solid rgba(0, 255, 240, 0.1)', borderRadius: '16px', background: 'rgba(255, 255, 255, 0.02)', backdropFilter: 'blur(10px)' }}>
            <p style={{ color: '#fff', fontSize: '1.1rem', lineHeight: '1.6', margin: 4, fontStyle: 'italic', fontWeight: 300 }}>"{randomQuote}"</p>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } } .spinner { animation: spin 1s linear infinite; }`}</style>
      </div>
    );
  }

  function TabIcon({ tab }: { tab: Tab }) {
    if (tab === 'home')     return <Home size={20} />;
    if (tab === 'tracker')  return <BarChart2 size={20} />;
    if (tab === 'arus kas') return <Briefcase size={20} />;
    return <Target size={20} />;
  }

  // ─── RENDER ─────────────────────────────────────────────────
  return (
    <div className="app-body">

      {/* ── CSS ── */}
      <style>{`
        .app-container { max-width: 1400px !important; width: 100%; }
        .chart-wrapper { position: relative; height: 300px; width: 100%; overflow: hidden; }
        @media (max-width: 768px) {
          .sidebar { display: none !important; }
          .top-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; }
          .user-info-mini { display: none; }
        }
        .avatar-upload-wrap { position: relative; cursor: pointer; width: 55px; height: 55px; }
        .avatar-upload-wrap:hover .avatar-overlay { opacity: 1; }
        .avatar-overlay { position: absolute; inset: 0; border-radius: 50%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; color: #fff; }
        .avatar-overlay.uploading { opacity: 1; }
        .kas-avatar-wrap { width: 55px; height: 55px; margin: 0 auto 10px; position: relative; cursor: pointer; border-radius: 50%; overflow: hidden; border: 2px solid #E2E8F0; transition: all 0.3s ease; }
        .kas-avatar-wrap img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .kas-avatar-wrap::after { content: ""; position: absolute; inset: 0; background-color: rgba(0,0,0,0); border-radius: 50%; transition: background-color 0.2s ease; }
        .kas-avatar-wrap:hover::after { background-color: rgba(0,0,0,0.3); }
        .kas-avatar-wrap:hover::before { content: "📸"; position: absolute; z-index: 2; top: 50%; left: 50%; transform: translate(-50%,-50%); font-size: 14px; opacity: 1; }
        .kas-avatar-wrap::before { content: ""; opacity: 0; transition: opacity 0.2s ease; }
        .kas-avatar-overlay.uploading { opacity: 1; }
        .kas-card-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s; }
        .kas-card:hover .kas-card-actions { opacity: 1; }
        .kas-action-btn { width: 28px; height: 28px; border-radius: 8px; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s; }
        .kas-action-btn.edit { background: rgba(0,174,239,0.15); color: #00AEEF; }
        .kas-action-btn.edit:hover { background: rgba(0,174,239,0.3); }
        .kas-action-btn.hapus { background: rgba(244,63,94,0.15); color: #F43F5E; }
        .kas-action-btn.hapus:hover { background: rgba(244,63,94,0.3); }
        .kas-stats-bar { display: flex; gap: 12px; margin-bottom: 16px; }
        .kas-stat-pill { flex: 1; border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; }
        .kas-stat-pill.lunas { background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.25); }
        .kas-stat-pill.belum { background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.2); }
        .kas-stat-pill.total { background: rgba(0,174,239,0.08); border: 1px solid rgba(0,174,239,0.2); }
        .kas-stat-num { font-size: 1.5rem; font-weight: 800; line-height: 1; }
        .kas-stat-label { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }

        /* ── Target Anggaran ── */
        .anggaran-subtab-bar { display: flex; background: rgba(255,255,255,0.06); border-radius: 12px; padding: 4px; margin-bottom: 20px; gap: 4px; }
        .anggaran-subtab { flex: 1; padding: 10px 8px; border: none; border-radius: 9px; font-family: 'DM Sans', sans-serif; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; background: transparent; color: var(--text-muted); display: flex; align-items: center; justify-content: center; gap: 6px; }
        .anggaran-subtab.active { background: var(--white); color: var(--blu-navy); box-shadow: 0 2px 8px rgba(0,0,0,0.08); }

        .target-card { background: var(--white); border-radius: 20px; padding: 0; margin-bottom: 14px; box-shadow: 0 2px 12px rgba(0,0,0,0.06); overflow: hidden; transition: box-shadow 0.2s; }
        .target-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .target-card-header { padding: 18px 20px; cursor: pointer; display: flex; align-items: flex-start; gap: 14px; }
        .target-card-body { padding: 0 20px 18px; border-top: 1px solid #F1F5F9; }

        .target-progress-bar { height: 10px; background: #EFF2F5; border-radius: 50px; overflow: hidden; margin: 12px 0 6px; }
        .target-progress-fill { height: 100%; border-radius: 50px; transition: width 1s ease; }

        .gap-badge { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 50px; font-size: 0.8rem; font-weight: 700; }
        .gap-badge.aman    { background: #D1FAE5; color: #065F46; }
        .gap-badge.kurang  { background: #FEF3C7; color: #92400E; }
        .gap-badge.kritis  { background: #FFE4E6; color: #9F1239; }

        .breakdown-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 14px; }
        .breakdown-tile { background: #F8FAFC; border-radius: 14px; padding: 14px; text-align: center; }
        .breakdown-tile .bt-label { font-size: 0.7rem; color: var(--text-muted); font-weight: 600; margin-bottom: 4px; }
        .breakdown-tile .bt-value { font-family: 'Sora', sans-serif; font-weight: 800; font-size: 1rem; color: var(--blu-navy); letter-spacing: -0.5px; }
        @media (max-width: 400px) { .breakdown-grid { grid-template-columns: 1fr 1fr; } }

        .item-form-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: flex-start; padding: 14px; background: #F8FAFC; border-radius: 14px; margin-bottom: 10px; border: 1.5px solid #EDF2F7; transition: border-color 0.2s; }
        .item-form-row:focus-within { border-color: var(--blu-cyan); }
        .item-form-row-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        @media (max-width: 480px) { .item-form-row-fields { grid-template-columns: 1fr; } }

        .live-preview-bar { background: linear-gradient(135deg, #001E36 0%, #003055 100%); border-radius: 14px; padding: 16px 18px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }

        .prioritas-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .prioritas-chip { padding: 4px 10px; border-radius: 50px; font-size: 0.75rem; font-weight: 700; border: 2px solid transparent; cursor: pointer; transition: all 0.15s; }
        .prioritas-chip.selected-darurat  { background: #FFE4E6; color: #F43F5E; border-color: #F43F5E; }
        .prioritas-chip.selected-penting  { background: #FEF3C7; color: #F59E0B; border-color: #F59E0B; }
        .prioritas-chip.selected-opsional { background: #D1FAE5; color: #10B981; border-color: #10B981; }
        .prioritas-chip:not([class*="selected"]) { background: #F1F5F9; color: #94A3B8; }
      `}</style>

      {/* ── HIDDEN FILE INPUTS ── */}
      <input ref={profileAvatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleProfileAvatarUpload(f); e.target.value = ''; }} />
      <input ref={anggotaAvatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f && targetAnggotaId) handleAnggotaAvatarUpload(targetAnggotaId, f); e.target.value = ''; }} />

      {/* ── HEADER ── */}
      <header className="top-header">
        <header className="top-header">
          <a href="https://cryed.cloud" className="logo" style={{ textDecoration: 'none', color: 'inherit' }}>
            <span>Cy</span>artha.
            <span style={{ fontSize: 18, fontWeight: '600', color: '#567fcb' }}> x </span>
            <span style={{ fontSize: 20, fontWeight: '800', color: '#b1a722' }}>Aldi Taher</span>
          </a>
          <div className="header-right">
            {realtimeConnected && <div className="realtime-badge"><div className="realtime-dot" /> Live</div>}
            <div className="user-avatar-wrap" style={{ position: 'relative' }}>
              <div className="user-info-mini">
                <div className="user-name">{profile?.nama?.split(' ')[0]}</div>
                <span className={`user-role-badge role-${profile?.role}`}>{profile?.role}</span>
              </div>
              <div className="avatar-upload-wrap" title="Buka Menu Profil" onClick={() => setShowProfileMenu(!showProfileMenu)} style={{ cursor: 'pointer' }}>
                <img className="avatar-img" src={profile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.nama || 'U')}&background=E0F6FF&color=00AEEF`} alt="avatar" />
                {avatarUploading && <div className="avatar-overlay uploading"><div className="spinner" style={{ width: 22, height: 8, borderWidth: 2, borderTopColor: '#fff' }} /></div>}
              </div>
              {showProfileMenu && (
                <>
                  <div onClick={() => setShowProfileMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 1000 }} />
                  <div style={{ position: 'absolute', top: '50px', right: 0, width: '230px', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', padding: '16px', zIndex: 1001, border: '1px solid #E2E8F0', animation: 'fadeIn 0.2s ease-out' }}>
                    <div style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid #E2E8F0' }}>
                      <div style={{ fontWeight: 700, color: '#001E36', fontSize: '0.95rem', wordBreak: 'break-word' }}>{profile?.nama || 'Pengguna'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 600, marginTop: '4px' }}>Status: {profile?.role || 'Member'}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <button onClick={() => { setShowProfileMenu(false); profileAvatarRef.current?.click(); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px', border: 'none', background: 'none', borderRadius: '8px', fontSize: '0.9rem', color: '#334155', cursor: 'pointer', textAlign: 'left' }}>
                        <Camera size={18} /> Ganti Foto Profil
                      </button>
                      <button onClick={() => { setShowProfileMenu(false); handleLogout(); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px', border: 'none', background: 'rgba(244, 63, 94, 0.1)', borderRadius: '8px', fontSize: '0.9rem', color: '#E11D48', cursor: 'pointer', fontWeight: 600, marginTop: '4px' }}>
                        <LogOut size={18} /> Keluar
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
      </header>

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        {(['home', 'tracker', 'arus kas', 'anggaran'] as Tab[]).map(tab => (
          <div key={tab} className={`nav-item${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
            <span className="nav-icon"><TabIcon tab={tab} /></span>
            <span className="nav-label">{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="nav-item" onClick={handleLogout}>
          <span className="nav-icon"><LogOut size={20} /></span>
          <span className="nav-label">Keluar</span>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="app-container">

        {/* ════ HOME ════ */}
        {activeTab === 'home' && (
          <main className="tab-content active">
            <div className="hero-card">
              <div className="hero-label">Saldo Aktif <button className="eye-btn" onClick={() => setMasked(!masked)}>{masked ? '🙈' : '🐵'}</button></div>
              <div className={`hero-amount${masked ? ' masked' : ''}`}>{masked ? 'Rp ***' : formatRp(data?.saldo || 0)}</div>
              <div className="hero-quick-stats">
                <div className="hero-stat-pill"><div className="label">Pemasukan</div><div className="value in">{masked ? '***' : formatRp((data?.pemasukan || 0) + (data?.totalKas || 0))}</div></div>
                <div className="hero-stat-pill"><div className="label">Pengeluaran</div><div className="value out">{masked ? '***' : formatRp(data?.pengeluaran || 0)}</div></div>
              </div>
            </div>
            <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={() => setTrxModal(true)}><Plus size={16} style={{ display: 'inline', marginRight: 6 }} /> Transaksi Baru</button>
            <div className="section-title">Ringkasan</div>
            <div className="summary-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="card summary-card"><div className="icon-wrap in"><ArrowDownCircle size={22} /></div><div className="slabel">Total Uang Masuk (Termasuk Kas)</div><div className="svalue">{masked ? '***' : formatRp((data?.pemasukan || 0) + (data?.totalKas || 0))}</div></div>
              <div className="card summary-card"><div className="icon-wrap out"><ArrowUpCircle size={22} /></div><div className="slabel">Pengeluaran</div><div className="svalue">{masked ? '***' : formatRp(data?.pengeluaran || 0)}</div></div>
            </div>

            {/* Target quick status */}
            {targetList.length > 0 && (
              <>
                <div className="section-title" style={{ marginTop: 8 }}>Status Target Dana</div>
                {targetList.slice(0, 2).map(t => (
                  <div key={t.id} className="card" style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => { setActiveTab('anggaran'); setAnggaranView('target'); setExpandedTarget(t.id); }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#001E36' }}>{t.judul}</div>
                        <div style={{ fontSize: '0.76rem', color: '#94A3B8', marginTop: 2 }}>{t.items.length} item · Target: {formatRp(t.totalTarget)}</div>
                      </div>
                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: t.gap <= 0 ? '#10B981' : '#F59E0B' }}>
                        {t.gap <= 0 ? '✅ Tercapai' : `Kurang ${formatRp(t.gap)}`}
                      </span>
                    </div>
                    <div className="target-progress-bar">
                      <div className="target-progress-fill" style={{ width: `${t.progressPct}%`, background: t.gap <= 0 ? '#10B981' : t.progressPct > 60 ? '#F59E0B' : '#00AEEF' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94A3B8', marginTop: 4 }}>
                      <span>{t.progressPct.toFixed(0)}% terkumpul</span>
                      {t.deadline && <span>Tenggat: {formatTanggal(t.deadline)}</span>}
                    </div>
                  </div>
                ))}
              </>
            )}

            <div className="section-title">Aktivitas Terakhir</div>
            <div className="card">
              {data?.riwayat.length === 0 ? (
                <div className="empty-state"><div className="empty-icon"><Inbox size={40} /></div><p>Belum ada transaksi</p></div>
              ) : (
                data?.riwayat.slice(0, 5).map(t => <LedgerItem key={t.id} trx={t} onClick={() => { setDetailTrx(t); setDetailModal(true); }} />)
              )}
            </div>
          </main>
        )}

        {/* ════ TRACKER ════ */}
        {activeTab === 'tracker' && (
          <main className="tab-content active">
            <div className="section-title">Arus Kas</div>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="chart-toggle" style={{ margin: 0 }}>
                  <button className={chartMode === 'donut' ? 'active' : ''} onClick={() => setChartMode('donut')}>Donat</button>
                  <button className={chartMode === 'bar'   ? 'active' : ''} onClick={() => setChartMode('bar')}>Batang</button>
                </div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, background: 'rgba(0,174,239,0.08)', padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(0,174,239,0.2)' }}>
                  {new Date().toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
                </span>
              </div>
              <div className="chart-wrapper">
                {chartMode === 'donut' && donutData && <Doughnut data={donutData} options={donutOptions} />}
                {chartMode === 'bar'   && barData   && <Bar   data={barData}   options={barOptions}   />}
              </div>
            </div>
            <div className="section-title" style={{ marginTop: 24 }}>Riwayat Lengkap</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '16px', width: '100%' }}>
              <div className="search-bar" style={{ flex: 1, margin: 0, display: 'flex', alignItems: 'center' }}>
                <span style={{ opacity: 0.4, marginLeft: '10px', display: 'flex' }}><Search size={16} /></span>
                <input placeholder="Cari..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: '90%', background: 'transparent', border: 'none', color: '#fff', padding: '6px' }} />
              </div>
              <button className="btn-filter" onClick={() => setFilterModal(true)} style={{ margin: 0, minWidth: '42px', height: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Filter size={18} /></button>
              <button className="btn-filter" onClick={handleExportMenu} style={{ margin: 0, minWidth: '42px', height: '52px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderColor: 'var(--blu-cyan)', color: 'var(--blu-cyan)', background: 'rgba(0, 174, 239, 0.05)', borderRadius: '12px' }} title="Export Laporan"><Download size={20} strokeWidth={1.5} color="var(--blu-cyan)" /></button>
            </div>
            <div className="card" style={{ marginTop: 15 }}>
              {filtered.length === 0 ? (
                <div className="empty-state"><div className="empty-icon"><Search size={40} /></div><p>Tidak ada data ditemukan</p></div>
              ) : (
                filtered.map(t => <LedgerItem key={t.id} trx={t} onClick={() => { setDetailTrx(t); setDetailModal(true); }} />)
              )}
            </div>
          </main>
        )}

        {/* ════ ARUS KAS ════ */}
        {activeTab === 'arus kas' && (
          <main className="tab-content active">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>Rekap Setoran Kas Anggota<p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 400, marginTop: 4 }}>buat liat kas, karena semua kas hanya milik Allah. ( direset tiap awal bulan )</p></div>
              {canManage && <button className="btn btn-primary btn-sm" onClick={() => setModalAnggota(true)}><Plus size={14} style={{ display: 'inline', marginRight: 4 }} /> Tambah Anggota</button>}
            </div>
            {daftarAnggota.length > 0 && (
              <div className="kas-stats-bar">
                <div className="kas-stat-pill lunas"><UserCheck size={22} color="#10B981" /><div><div className="kas-stat-num" style={{ color: '#10B981' }}>{statsKas.lunas}</div><div className="kas-stat-label">Lunas Bulan Ini</div></div></div>
                <div className="kas-stat-pill belum"><UserX size={22} color="#F43F5E" /><div><div className="kas-stat-num" style={{ color: '#F43F5E' }}>{statsKas.belum}</div><div className="kas-stat-label">Belum Bayar</div></div></div>
                <div className="kas-stat-pill total"><Users size={22} color="#00AEEF" /><div><div className="kas-stat-num" style={{ color: '#00AEEF' }}>{statsKas.total}</div><div className="kas-stat-label">Total Anggota</div></div></div>
              </div>
            )}
            {data?.rekapKas.length === 0 ? (
              <div className="card"><div className="empty-state"><div className="empty-icon"><Briefcase size={40} /></div><p>Belum ada nama anggota terdaftar. Silakan tambah anggota.</p></div></div>
            ) : (
              <div className="kas-grid">
                {data?.rekapKas.map(kas => {
                  const status         = getStatusKas(kas.nama, data.riwayat);
                  const anggotaData    = daftarAnggota.find(a => a.nama === kas.nama);
                  const anggotaId      = anggotaData?.id || '';
                  const avatarUrl      = anggotaData?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(kas.nama)}&background=E0F6FF&color=00AEEF&bold=true`;
                  const isUploadingThis = anggotaAvatarUploading === anggotaId;
                  return (
                    <div key={kas.nama} className="kas-card hover-lift" style={{ cursor: 'pointer', position: 'relative' }}>
                      {canManage && (
                        <div className="kas-card-actions">
                          <button className="kas-action-btn edit" title="Edit nama" onClick={(e) => { e.stopPropagation(); setEditAnggotaId(anggotaId); setEditAnggotaNama(kas.nama); }}><Pencil size={13} /></button>
                          <button className="kas-action-btn hapus" title="Hapus anggota" onClick={(e) => { e.stopPropagation(); handleHapusAnggota(anggotaId, kas.nama); }}><Trash2 size={13} /></button>
                        </div>
                      )}
                      <div className="kas-avatar-wrap" title="Klik untuk ganti foto" onClick={(e) => { e.stopPropagation(); setTargetAnggotaId(anggotaId); anggotaAvatarRef.current?.click(); }}>
                        <img className="kas-avatar" src={avatarUrl} alt={kas.nama} />
                        <div className={`kas-avatar-overlay${isUploadingThis ? ' uploading' : ''}`}>{isUploadingThis ? <div className="spinner" style={{ width: 18, height: 20, borderWidth: 2, borderTopColor: '#fff' }} /> : <Camera size={16} />}</div>
                      </div>
                      <div onClick={() => setDetailKasAnggota(kas.nama)}>
                        <div className="kas-nama">{kas.nama}</div>
                        <div className="kas-total">{formatRp(kas.total)}</div>
                        <div style={{ fontSize: '0.72rem', color: status.color, marginTop: 8, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          {status.icon === 'check'   && <CheckCircle size={12} />}
                          {status.icon === 'warning' && <AlertTriangle size={12} />}
                          {status.icon === 'clock'   && <Clock size={12} />}
                          {status.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        )}

        {/* ════ ANGGARAN ════ */}
        {activeTab === 'anggaran' && (
          <main className="tab-content active">

            {/* Sub-tab toggle */}
            <div className="anggaran-subtab-bar">
              <button className={`anggaran-subtab${anggaranView === 'target' ? ' active' : ''}`} onClick={() => setAnggaranView('target')}>
                <Flag size={15} /> Target Dana
                {targetList.length > 0 && (
                  <span style={{ background: 'var(--blu-cyan)', color: '#fff', borderRadius: 50, fontSize: '0.65rem', fontWeight: 800, padding: '1px 6px', marginLeft: 2 }}>
                    {targetList.length}
                  </span>
                )}
              </button>
              <button className={`anggaran-subtab${anggaranView === 'pengeluaran' ? ' active' : ''}`} onClick={() => setAnggaranView('pengeluaran')}>
                <BarChart2 size={15} /> Batas Pengeluaran
              </button>
            </div>

            {/* ── SUB-TAB: Batas Pengeluaran (existing) ── */}
            {anggaranView === 'pengeluaran' && (
              <>
                <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  Anggaran Pengeluaran
                  {canManage && <button className="btn btn-primary btn-sm" onClick={() => setAnggaranModal(true)}><Plus size={14} style={{ display: 'inline', marginRight: 4 }} /> Tambah</button>}
                </div>
                {anggaranWithProgress.length === 0 ? (
                  <div className="card"><div className="empty-state"><div className="empty-icon"><Target size={40} /></div><p>{canManage ? 'Tambah anggaran untuk mulai memantau pengeluaran' : 'Belum ada anggaran ditetapkan'}</p></div></div>
                ) : (
                  <div className="card">
                    {anggaranWithProgress.map(ang => (
                      <div key={ang.id} className="budget-item">
                        <div className="budget-row"><div className="budget-kategori">{ang.kategori}</div><div className="budget-numbers">{formatRp(ang.spent)} / {formatRp(ang.batas)}</div></div>
                        <div className="budget-bar-track"><div className={`budget-bar-fill ${ang.cls}`} style={{ width: `${ang.pct}%` }} /></div>
                        <div className={`budget-pct ${ang.cls}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {ang.pct >= 100 ? <><AlertTriangle size={13} /> {ang.pct}% terpakai — Melebihi batas!</> : ang.pct >= 75 ? <><AlertTriangle size={13} /> {ang.pct}% terpakai — Mendekati batas</> : <><CheckCircle size={13} /> {ang.pct}% terpakai — Aman</>}
                        </div>
                        {canManage && (
                          <button className="btn btn-danger btn-sm" style={{ width: 'auto', marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}
                            onClick={async () => { const c = await Swal.fire({ title: 'Hapus Anggaran?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#F43F5E' }); if (c.isConfirmed) { await supabase.from('anggaran').delete().eq('id', ang.id); await loadAll(); } }}>
                            <Trash2 size={13} /> Hapus
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ── SUB-TAB: Target Dana ── */}
            {anggaranView === 'target' && (
              <>
                <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    Perencanaan Target Dana
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 400, marginTop: 2 }}>
                      Susun estimasi biaya dari berbagai komponen program kerja
                    </p>
                  </div>
                  {canManage && (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowTargetForm(true)}>
                      <Plus size={14} style={{ display: 'inline', marginRight: 4 }} /> Buat Target
                    </button>
                  )}
                </div>

                {/* Global gap summary */}
                {targetList.length > 0 && data && (
                  <div style={{ background: 'linear-gradient(135deg, #001E36 0%, #003055 100%)', borderRadius: 20, padding: '20px', marginBottom: 16 }}>
                    <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: 4, fontWeight: 600, letterSpacing: 1 }}>ANALISIS GAP — TOTAL SEMUA TARGET</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: '1.8rem', color: '#fff', letterSpacing: -1 }}>
                          {formatRp(targetList.reduce((s, t) => s + t.totalTarget, 0))}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Total kebutuhan dana dari semua target</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>Dana tersedia</div>
                        <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: '1.1rem', color: '#34D399' }}>{formatRp(data.saldo)}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 14, height: 8, background: 'rgba(255,255,255,0.1)', borderRadius: 50, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 50,
                        background: 'linear-gradient(90deg, #34D399, #00AEEF)',
                        width: `${Math.min((data.saldo / Math.max(targetList.reduce((s, t) => s + t.totalTarget, 0), 1)) * 100, 100)}%`,
                        transition: 'width 1s ease',
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)' }}>
                      <span>{Math.min((data.saldo / Math.max(targetList.reduce((s, t) => s + t.totalTarget, 0), 1)) * 100, 100).toFixed(1)}% terkumpul</span>
                      <span>Gap: {formatRp(Math.max(targetList.reduce((s, t) => s + t.totalTarget, 0) - data.saldo, 0))}</span>
                    </div>
                  </div>
                )}

                {/* Target cards */}
                {targetList.length === 0 ? (
                  <div className="card">
                    <div className="empty-state">
                      <div className="empty-icon"><Flag size={40} /></div>
                      <p>Belum ada target dana</p>
                      <p style={{ marginTop: 6, fontSize: '0.82rem', fontWeight: 400, color: 'var(--text-muted)' }}>
                        Buat target untuk merencanakan kebutuhan dana program kerja
                      </p>
                    </div>
                  </div>
                ) : (
                  targetList.map(t => {
                    const isExpanded = expandedTarget === t.id;
                    const pConfig    = { darurat: t.items.filter(i => i.prioritas === 'darurat').length, penting: t.items.filter(i => i.prioritas === 'penting').length, opsional: t.items.filter(i => i.prioritas === 'opsional').length };

                    return (
                      <div key={t.id} className="target-card">
                        {/* Header */}
                        <div className="target-card-header" onClick={() => setExpandedTarget(isExpanded ? null : t.id)}>
                          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, #001E36, #00AEEF)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Flag size={20} color="#fff" />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 700, fontSize: '1rem', color: '#001E36', marginBottom: 2 }}>{t.judul}</div>
                            {t.deskripsi && <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginBottom: 6 }}>{t.deskripsi}</div>}
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, background: '#EFF2F5', color: '#64748B', padding: '2px 8px', borderRadius: 50 }}>{t.items.length} item</span>
                              {t.deadline && <span style={{ fontSize: '0.72rem', fontWeight: 700, background: '#EFF2F5', color: '#64748B', padding: '2px 8px', borderRadius: 50, display: 'flex', alignItems: 'center', gap: 4 }}><CalendarDays size={10} /> {formatTanggal(t.deadline)}</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: '1rem', color: '#001E36' }}>{formatRp(t.totalTarget)}</div>
                            <div style={{ fontSize: '0.7rem', color: t.gap <= 0 ? '#10B981' : '#F59E0B', fontWeight: 700, marginTop: 2 }}>{t.gap <= 0 ? '✅ Aman' : `-${formatRp(t.gap)}`}</div>
                            <div style={{ marginTop: 6, color: '#94A3B8' }}>{isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</div>
                          </div>
                        </div>

                        {/* Progress bar always visible */}
                        <div style={{ padding: '0 20px 14px' }}>
                          <div className="target-progress-bar" style={{ margin: 0 }}>
                            <div className="target-progress-fill" style={{ width: `${t.progressPct}%`, background: t.gap <= 0 ? '#10B981' : t.progressPct > 60 ? '#F59E0B' : '#00AEEF' }} />
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#94A3B8', marginTop: 4 }}>
                            <span>{t.progressPct.toFixed(0)}% terkumpul</span>
                            <span>{formatRp(data?.saldo ?? 0)} / {formatRp(t.totalTarget)}</span>
                          </div>
                        </div>

                        {/* Expanded body */}
                        {isExpanded && (
                          <div className="target-card-body">
                            {/* Breakdown tiles */}
                            <div className="breakdown-grid">
                              <div className="breakdown-tile">
                                <div className="bt-label">🎯 Total Target</div>
                                <div className="bt-value" style={{ fontSize: '0.9rem' }}>{formatRp(t.totalTarget)}</div>
                              </div>
                              <div className="breakdown-tile">
                                <div className="bt-label">{t.gap <= 0 ? '✅ Surplus' : '⚠️ Kekurangan'}</div>
                                <div className="bt-value" style={{ color: t.gap <= 0 ? '#10B981' : '#F43F5E', fontSize: '0.9rem' }}>{formatRp(Math.abs(t.gap <= 0 ? (data?.saldo ?? 0) - t.totalTarget : t.gap))}</div>
                              </div>
                              <div className="breakdown-tile">
                                <div className="bt-label">📅 Per Bulan</div>
                                <div className="bt-value" style={{ fontSize: '0.85rem' }}>{t.gap <= 0 ? '—' : formatRp(t.monthlyNeeded)}</div>
                                {t.monthsLeft > 0 && <div style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: 2 }}>sisa {t.monthsLeft} bln</div>}
                              </div>
                            </div>

                            {/* Priority breakdown */}
                            <div style={{ display: 'flex', gap: 8, margin: '14px 0 6px', flexWrap: 'wrap' }}>
                              {pConfig.darurat > 0  && <span style={{ background: '#FFE4E6', color: '#F43F5E', padding: '4px 10px', borderRadius: 50, fontSize: '0.72rem', fontWeight: 700 }}>🚨 {pConfig.darurat} Darurat</span>}
                              {pConfig.penting > 0  && <span style={{ background: '#FEF3C7', color: '#F59E0B', padding: '4px 10px', borderRadius: 50, fontSize: '0.72rem', fontWeight: 700 }}>⚡ {pConfig.penting} Penting</span>}
                              {pConfig.opsional > 0 && <span style={{ background: '#D1FAE5', color: '#10B981', padding: '4px 10px', borderRadius: 50, fontSize: '0.72rem', fontWeight: 700 }}>✨ {pConfig.opsional} Opsional</span>}
                            </div>

                            {/* Items list */}
                            <div style={{ marginTop: 8 }}>
                              {t.items.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '20px 0', color: '#94A3B8', fontSize: '0.85rem' }}>Belum ada item. Tambahkan komponen biaya di bawah.</div>
                              ) : (
                                t.items
                                  .sort((a, b) => { const order = { darurat: 0, penting: 1, opsional: 2 }; return order[a.prioritas] - order[b.prioritas]; })
                                  .map(item => <TargetItemRow key={item.id} item={item} onDelete={handleDeleteItem} canManage={canManage} />)
                              )}
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                              {canManage && (
                                <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                                  onClick={() => { setActiveTarget(t); setShowItemForm(true); }}>
                                  <Plus size={14} style={{ display: 'inline', marginRight: 4 }} /> Tambah Item
                                </button>
                              )}
                              {canManage && (
                                <button className="btn btn-danger btn-sm" style={{ width: 'auto', padding: '8px 14px' }}
                                  onClick={() => handleDeleteTarget(t.id)}>
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </>
            )}
          </main>
        )}
      </div>

      {/* ── BOTTOM NAV ── */}
      <nav className="bottom-nav">
        {(['home', 'tracker', 'arus kas', 'anggaran'] as Tab[]).map(tab => (
          <div key={tab} className={`nav-item${activeTab === tab ? ' active' : ''}`} onClick={() => setActiveTab(tab)}>
            <span className="nav-icon"><TabIcon tab={tab} /></span>
            <span className="nav-label">{tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
          </div>
        ))}
      </nav>

      {/* ── CS BUTTON ── */}
      <div className="cs-container">
        {csOpen && (
          <div className="cs-menu-content">
            <a href="https://wa.me/6285643312905" target="_blank" className="cs-item"><Phone size={14}/> WhatsApp</a>
            <a href="mailto:cyborged30s@gmail.com" className="cs-item"><Mail size={14}/> Email</a>
          </div>
        )}
        <button className="cs-main-btn" onClick={() => setCsOpen(!csOpen)}><Headset size={22} /></button>
      </div>

      {/* ════════════ MODALS ════════════ */}

      {/* Modal Filter */}
      <div className={`modal-backdrop${filterModal ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setFilterModal(false); }}>
        <div className="modal-sheet">
          <div className="modal-header"><span className="modal-title">Pencarian Lanjutan</span><button className="close-btn" onClick={() => setFilterModal(false)}><X size={18} /></button></div>
          <div className="form-group"><label>Jenis Transaksi</label><select value={filterTipe} onChange={e => setFilterTipe(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #E2E8F0' }}><option value="Semua">Semua Kategori</option><option value="Pemasukan">Pemasukan</option><option value="Kas">Kas Anggota</option><option value="Pengeluaran">Pengeluaran</option></select></div>
          <div className="form-row">
            <div className="form-group"><label>Dari Tanggal</label><input type="date" value={filterMulai} onChange={e => setFilterMulai(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #E2E8F0' }} /></div>
            <div className="form-group"><label>Sampai Tanggal</label><input type="date" value={filterAkhir} onChange={e => setFilterAkhir(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #E2E8F0' }} /></div>
          </div>
          <div className="form-row" style={{ marginTop: '20px', gap: '10px' }}>
            <button className="btn" style={{ flex: 1, background: '#F1F5F9', color: '#64748B' }} onClick={() => { setFilterTipe('Semua'); setFilterMulai(''); setFilterAkhir(''); }}>Reset</button>
            <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => setFilterModal(false)}>Terapkan Filter</button>
          </div>
        </div>
      </div>

      {/* Modal Transaksi */}
      <div className={`modal-backdrop${trxModal ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) { setTrxModal(false); resetForm(); } }}>
        <div className="modal-sheet">
          <div className="modal-header"><span className="modal-title">Catat Transaksi</span><button className="close-btn" onClick={() => { setTrxModal(false); resetForm(); }}><X size={18} /></button></div>
          <div className="form-row">
            <div className="form-group"><label>Tanggal</label><input type="date" value={form.tanggal} onChange={e => setForm({ ...form, tanggal: e.target.value })} required /></div>
            <div className="form-group"><label>Jenis</label><select value={form.jenis} onChange={e => setForm({ ...form, jenis: e.target.value as any })}><option value="Pemasukan">Pemasukan</option><option value="Kas">Setoran Kas</option><option value="Pengeluaran">Pengeluaran</option></select></div>
          </div>
          <div className="form-row">
            {form.jenis === 'Kas' ? (
              <div className="form-group"><label>Nama Anggota</label><select value={form.anggota} onChange={e => setForm({ ...form, anggota: e.target.value })}><option value="">-- Pilih Anggota --</option>{daftarAnggota.map(a => (<option key={a.id} value={a.nama}>{a.nama}</option>))}</select></div>
            ) : (
              <div className="form-group"><label>Kategori</label><input type="text" placeholder="Konsumsi, Bensin..." value={form.kategori} onChange={e => setForm({ ...form, kategori: e.target.value })} /></div>
            )}
            <div className="form-group"><label>Nominal (Rp)</label><div className="input-prefix-wrap"><span className="prefix">Rp</span><input type="text" inputMode="numeric" value={form.nominal} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setForm({ ...form, nominal: raw ? new Intl.NumberFormat('id-ID').format(parseInt(raw)) : '' }); }} /></div></div>
          </div>
          <div className="form-group"><label>Keterangan (Opsional)</label><input type="text" placeholder="Detail transaksi..." value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} /></div>
          <div className="form-group"><label>Bukti Foto (Opsional)</label><input type="file" accept="image/*" style={{ padding: '10px', background: '#F8FAFC', borderRadius: 12, border: '1.5px solid #E2E8F0', width: '100%' }} onChange={(e: ChangeEvent<HTMLInputElement>) => setFotoFile(e.target.files?.[0] || null)} /></div>
          <button className="btn btn-primary mt-2" onClick={handleSubmit} disabled={formLoading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {formLoading ? <><span className="spinner" /> Menyimpan...</> : <><Save size={16} /> Simpan Transaksi</>}
          </button>
        </div>
      </div>

      {/* Modal Anggaran Pengeluaran */}
      <div className={`modal-backdrop${anggaranModal ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setAnggaranModal(false); }}>
        <div className="modal-sheet">
          <div className="modal-header"><span className="modal-title">Set Anggaran</span><button className="close-btn" onClick={() => setAnggaranModal(false)}><X size={18} /></button></div>
          <div className="form-group"><label>Kategori</label><input type="text" value={angForm.kategori} onChange={e => setAngForm({ ...angForm, kategori: e.target.value })} /></div>
          <div className="form-group"><label>Batas Nominal (Rp)</label><div className="input-prefix-wrap"><span className="prefix">Rp</span><input type="text" inputMode="numeric" value={angForm.batas} onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); setAngForm({ ...angForm, batas: raw ? new Intl.NumberFormat('id-ID').format(parseInt(raw)) : '' }); }} /></div></div>
          <div className="form-group"><label>Periode</label><input type="month" value={angForm.periode} onChange={e => setAngForm({ ...angForm, periode: e.target.value })} /></div>
          <button className="btn btn-primary" onClick={handleSaveAnggaran} disabled={angLoading}>{angLoading ? <span className="spinner" /> : 'Simpan Anggaran'}</button>
        </div>
      </div>

      {/* Modal Tambah Anggota */}
      <div className={`modal-backdrop${modalAnggota ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setModalAnggota(false); }}>
        <div className="modal-sheet">
          <div className="modal-header"><span className="modal-title">Tambah Anggota KKN</span><button className="close-btn" onClick={() => setModalAnggota(false)}><X size={18} /></button></div>
          <div className="form-group"><label>Nama Lengkap / Panggilan</label><input type="text" placeholder="Masukkan nama..." value={namaAnggotaBaru} onChange={e => setNamaAnggotaBaru(e.target.value)} /></div>
          <button className="btn btn-primary mt-2" onClick={handleSaveAnggota} disabled={formLoading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {formLoading ? <><span className="spinner" /> Menyimpan...</> : <><Plus size={16} /> Simpan Anggota</>}
          </button>
        </div>
      </div>

      {/* Modal Edit Nama Anggota */}
      <div className={`modal-backdrop${editAnggotaId !== null ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setEditAnggotaId(null); }}>
        <div className="modal-sheet">
          <div className="modal-header"><span className="modal-title">Edit Nama Anggota</span><button className="close-btn" onClick={() => setEditAnggotaId(null)}><X size={18} /></button></div>
          <div className="form-group"><label>Nama Baru</label><input type="text" placeholder="Masukkan nama baru..." value={editAnggotaNama} onChange={e => setEditAnggotaNama(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleEditAnggota(); }} autoFocus /></div>
          <button className="btn btn-primary mt-2" onClick={handleEditAnggota} disabled={editAnggotaLoading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {editAnggotaLoading ? <><span className="spinner" /> Menyimpan...</> : <><Save size={16} /> Simpan Perubahan</>}
          </button>
        </div>
      </div>

      {/* ════ NEW: Modal Buat Target ════ */}
      <div className={`modal-backdrop${showTargetForm ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowTargetForm(false); }}>
        <div className="modal-sheet">
          <div className="modal-header">
            <span className="modal-title">🎯 Buat Target Dana Baru</span>
            <button className="close-btn" onClick={() => setShowTargetForm(false)}><X size={18} /></button>
          </div>
          <p style={{ fontSize: '0.83rem', color: '#64748B', marginBottom: 16, lineHeight: 1.5 }}>
            Target dana adalah "master rencana" yang menampung item-item biaya. Misalnya: <em>KKN Batur 2026</em>.
          </p>
          <div className="form-group"><label>Judul Target *</label><input type="text" placeholder="Contoh: KKN Batur 2026, Proker Agustusan..." value={tForm.judul} onChange={e => setTForm({ ...tForm, judul: e.target.value })} autoFocus /></div>
          <div className="form-group"><label>Deskripsi (Opsional)</label><input type="text" placeholder="Keterangan singkat..." value={tForm.deskripsi} onChange={e => setTForm({ ...tForm, deskripsi: e.target.value })} /></div>
          <div className="form-group"><label>Deadline / Tenggat (Opsional)</label><input type="date" value={tForm.deadline} onChange={e => setTForm({ ...tForm, deadline: e.target.value })} /></div>
          <button className="btn btn-primary" onClick={handleCreateTarget} disabled={tLoading}>
            {tLoading ? <span className="spinner" /> : '✨ Buat Target'}
          </button>
        </div>
      </div>

      {/* ════ NEW: Modal Tambah Item ════ */}
      <div className={`modal-backdrop${showItemForm ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setShowItemForm(false); }}>
        <div className="modal-sheet" style={{ maxHeight: '92vh', overflowY: 'auto', maxWidth: 560 }}>
          <div className="modal-header">
            <div>
              <span className="modal-title">📦 Tambah Item Anggaran</span>
              {activeTarget && <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: 2 }}>Target: {activeTarget.judul}</div>}
            </div>
            <button className="close-btn" onClick={() => setShowItemForm(false)}><X size={18} /></button>
          </div>

          {/* Live preview total */}
          <div className="live-preview-bar">
            <div>
              <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: 0.5, marginBottom: 2 }}>PREVIEW TOTAL ITEM BARU</div>
              <div style={{ fontFamily: 'Sora, sans-serif', fontWeight: 800, fontSize: '1.4rem', color: '#fff', letterSpacing: -0.5 }}>
                {formatRp(previewTotal)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>{itemRows.filter(r => r.nama_item && r.harga_satuan).length} item valid</div>
              <div style={{ fontSize: '0.75rem', color: '#34D399', fontWeight: 700, marginTop: 2 }}>+ {formatRp(activeTarget?.totalTarget ?? 0)} existing</div>
            </div>
          </div>

          <p style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: 14, lineHeight: 1.5 }}>
            Kamu bisa menambahkan beberapa item sekaligus. Kosongkan baris yang tidak diperlukan.
          </p>

          {itemRows.map((row, idx) => (
            <div key={idx} className="item-form-row">
              <div className="item-form-row-fields">
                <div className="form-group" style={{ marginBottom: 8, gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.72rem' }}>Nama Item *</label>
                  <input type="text" placeholder="Korsa, Sewa Posko, Konsumsi..." value={row.nama_item} onChange={e => updateItemRow(idx, 'nama_item', e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', width: '100%', fontSize: '0.9rem', fontFamily: 'DM Sans' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: '0.72rem' }}>Tipe Satuan</label>
                  <select value={row.tipe_satuan} onChange={e => updateItemRow(idx, 'tipe_satuan', e.target.value)} style={{ padding: '9px 10px', borderRadius: 10, border: '1.5px solid #E2E8F0', width: '100%', fontSize: '0.85rem', fontFamily: 'DM Sans' }}>
                    <option value="borongan">Borongan (total)</option>
                    <option value="per_orang">Per Orang</option>
                    <option value="per_bulan">Per Bulan</option>
                  </select>
                </div>
                {row.tipe_satuan !== 'borongan' && (
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: '0.72rem' }}>Volume ({row.tipe_satuan === 'per_orang' ? 'orang' : 'bulan'})</label>
                    <input type="number" min="1" value={row.volume} onChange={e => updateItemRow(idx, 'volume', e.target.value)} style={{ padding: '9px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', width: '100%', fontSize: '0.9rem', fontFamily: 'DM Sans' }} />
                  </div>
                )}
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: '0.72rem' }}>Harga Satuan (Rp) *</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.82rem', color: '#94A3B8', fontWeight: 600 }}>Rp</span>
                    <input type="text" inputMode="numeric" placeholder="0" value={row.harga_satuan}
                      onChange={e => { const raw = e.target.value.replace(/[^0-9]/g, ''); updateItemRow(idx, 'harga_satuan', raw ? new Intl.NumberFormat('id-ID').format(parseInt(raw)) : ''); }}
                      style={{ padding: '9px 12px 9px 30px', borderRadius: 10, border: '1.5px solid #E2E8F0', width: '100%', fontSize: '0.9rem', fontFamily: 'DM Sans', fontWeight: 700 }}
                    />
                  </div>
                </div>
                {/* Subtotal preview */}
                {row.harga_satuan && (
                  <div style={{ gridColumn: '1 / -1', background: 'rgba(0,174,239,0.06)', borderRadius: 8, padding: '6px 10px', fontSize: '0.78rem', fontWeight: 700, color: '#00AEEF' }}>
                    Subtotal: {formatRp((parseFloat(row.volume) || 1) * (parseFloat(row.harga_satuan.replace(/\./g, '')) || 0))}
                  </div>
                )}
                <div className="form-group" style={{ marginBottom: 8, gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.72rem' }}>Prioritas</label>
                  <div className="prioritas-chips">
                    {(['darurat', 'penting', 'opsional'] as Prioritas[]).map(p => {
                      const pc = getPrioritasConfig(p);
                      return (
                        <button key={p} type="button"
                          className={`prioritas-chip${row.prioritas === p ? ` selected-${p}` : ''}`}
                          onClick={() => updateItemRow(idx, 'prioritas', p)}>
                          {pc.icon} {pc.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: '0.72rem' }}>Catatan (Opsional)</label>
                  <input type="text" placeholder="Misal: sudah termasuk ongkir..." value={row.catatan} onChange={e => updateItemRow(idx, 'catatan', e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', width: '100%', fontSize: '0.85rem', fontFamily: 'DM Sans' }} />
                </div>
              </div>
              {itemRows.length > 1 && (
                <button onClick={() => removeItemRow(idx)} style={{ background: '#FFE4E6', border: 'none', borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, alignSelf: 'flex-start', marginTop: 22, color: '#F43F5E' }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}

          <button type="button" onClick={addItemRow}
            style={{ width: '100%', padding: '10px', border: '2px dashed #E2E8F0', borderRadius: 12, background: 'transparent', color: '#94A3B8', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'DM Sans', transition: 'all 0.2s' }}
            onMouseOver={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#00AEEF'; (e.currentTarget as HTMLButtonElement).style.color = '#00AEEF'; }}
            onMouseOut={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#E2E8F0'; (e.currentTarget as HTMLButtonElement).style.color = '#94A3B8'; }}
          >
            <Plus size={15} /> Tambah Baris Item
          </button>

          <button className="btn btn-primary" onClick={handleSaveItems} disabled={iLoading}>
            {iLoading ? <span className="spinner" /> : `💾 Simpan ${itemRows.filter(r => r.nama_item && r.harga_satuan).length} Item`}
          </button>
        </div>
      </div>

      {/* Modal Detail Transaksi */}
      {detailTrx && (
        <div className={`modal-backdrop${detailModal ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setDetailModal(false); }}>
          <div className="modal-sheet" style={{ maxWidth: 440 }}>
            <div className="modal-header"><span className="modal-title">Detail Transaksi</span><button className="close-btn" onClick={() => setDetailModal(false)}><X size={18} /></button></div>
            <div className={`detail-amount-wrap ${detailTrx.jenis === 'Pengeluaran' ? 'out' : detailTrx.jenis === 'Kas' ? 'kas' : 'in'}`}>
              <div className="detail-emoji">{detailTrx.jenis === 'Pengeluaran' ? <TrendingDown size={32} /> : detailTrx.jenis === 'Kas' ? <Wallet size={32} /> : <ArrowDownCircle size={32} />}</div>
              <div className={`detail-amount ${detailTrx.jenis === 'Pengeluaran' ? 'out' : detailTrx.jenis === 'Kas' ? 'kas' : 'in'}`}>{detailTrx.jenis === 'Pengeluaran' ? '-' : '+'}{formatRp(Number(detailTrx.nominal))}</div>
            </div>
            <div className="receipt-box" style={{ marginTop: 16 }}>
              <div className="receipt-row">
                <span className="rlabel">Waktu</span>
                <span className="rvalue">{detailTrx.created_at ? (() => {
                  const d = new Date(detailTrx.created_at);
                  const jam = d.getHours().toString().padStart(2, '0');
                  const mnt = d.getMinutes().toString().padStart(2, '0');
                  const bln = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][d.getMonth()];
                  return <><span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)', letterSpacing: 1 }}>{jam}.{mnt}</span><span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'black', marginLeft: 8 }}>{d.getDate()} {bln} {d.getFullYear()}</span></>;
                })() : <span>{formatTanggal(detailTrx.tanggal)}</span>}</span>
              </div>
              <div className="receipt-row"><span className="rlabel">Jenis</span><span className="rvalue">{detailTrx.jenis}</span></div>
              <div className="receipt-row"><span className="rlabel">Kategori</span><span className="rvalue">{detailTrx.kategori}</span></div>
              <div className="receipt-row"><span className="rlabel">Keterangan</span><span className="rvalue">{detailTrx.keterangan}</span></div>
              <div className="receipt-row"><span className="rlabel">Oleh</span><span className="rvalue">{detailTrx.email_aktor}</span></div>
            </div>
            {detailTrx.bukti_url && <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', width: '100%' }}><img src={detailTrx.bukti_url} alt="Bukti" style={{ width: '100%', maxWidth: '250px', height: 'auto', objectFit: 'cover', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /></div>}
            {canManage && <button className="btn btn-danger" onClick={() => handleDeleteTrx(detailTrx.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 24 }}><Trash2 size={15} /> Hapus Transaksi</button>}
          </div>
        </div>
      )}

      {/* Modal Rincian Kas Anggota */}
      {detailKasAnggota && (
        <div className="modal-backdrop open" onClick={e => { if (e.target === e.currentTarget) setDetailKasAnggota(null); }}>
          <div className="modal-sheet" style={{ maxWidth: 440 }}>
            <div className="modal-header"><span className="modal-title">Rincian Kas: {detailKasAnggota}</span><button className="close-btn" onClick={() => setDetailKasAnggota(null)}><X size={18} /></button></div>
            <div style={{ maxHeight: '60vh', overflowY: 'auto', marginTop: 16 }}>
              {data?.riwayat.filter(t => t.jenis === 'Kas' && t.kategori === detailKasAnggota).length === 0 ? (
                <div className="empty-state" style={{ padding: '30px 0' }}><div className="empty-icon"><Receipt size={36} /></div><p>Belum ada riwayat pembayaran.</p></div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data?.riwayat.filter(t => t.jenis === 'Kas' && t.kategori === detailKasAnggota).map(t => (
                    <div key={t.id} style={{ padding: 16, border: '1px solid #E2E8F0', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div><div style={{ fontWeight: 600, color: 'var(--blu-navy)' }}>{formatTanggal(t.tanggal)}</div><div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t.keterangan}</div></div>
                      <div style={{ fontWeight: 700, color: '#10B981', fontSize: '1.1rem' }}>+ {formatRp(t.nominal)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
