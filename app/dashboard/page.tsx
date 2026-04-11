'use client';
import { Download } from 'lucide-react';
import React, { useEffect, useState, useCallback, ChangeEvent } from 'react';
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

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

type Tab = 'home' | 'tracker' | 'arus kas' | 'anggaran';
type ChartMode = 'donut' | 'bar';

// ─── HELPERS ─────────────────────────────────────────────────
function compressImage(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX) { 
          h = Math.round((h * MAX) / w); 
          w = MAX; 
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; 
        canvas.height = h;
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
  if (pct >= 75) return 'warn';
  return 'safe';
}

function getStatusKas(nama: string, riwayat: Transaksi[]) {
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7); 
  const paidThisMonth = riwayat.some(
    t => t.jenis === 'Kas' && t.kategori === nama && t.tanggal.startsWith(currentMonth)
  );
  
  if (paidThisMonth) return { text: 'Lunas Bulan Ini', color: '#10B981' }; 
  if (now.getDate() >= 10) return { text: '⚠️ Belum Bayar (Jatuh Tempo)', color: '#F43F5E' }; 
  return { text: 'Menunggu Pembayaran', color: '#F59E0B' }; 
}

// ─── KOMPONEN LEDGER ITEM ─────────────────────────────────────
function LedgerItem({ trx, onClick }: { trx: Transaksi; onClick: () => void }) {
  const isIn = trx.jenis === 'Pemasukan' || trx.jenis === 'Kas';
  const icon = trx.jenis === 'Pengeluaran' ? '💸' : trx.jenis === 'Kas' ? '💰' : '📥';
  const iconClass = `ledger-icon jenis-${trx.jenis.toLowerCase()}`;
  const amtClass = trx.jenis === 'Pengeluaran' ? 'negative' : trx.jenis === 'Kas' ? 'neutral' : 'positive';
  const sign = trx.jenis === 'Pengeluaran' ? '-' : '+';

  return (
    <div className="ledger-item" onClick={onClick}>
      <div className="ledger-left">
        <div className={iconClass}>{icon}</div>
        <div className="ledger-info">
          <div className="ledger-title">
            {trx.kategori}
            {trx.bukti_url ? ' 📎' : ''}
          </div>
          <div className="ledger-sub">{trx.keterangan}</div>
        </div>
      </div>
      <div className="ledger-right">
        <div className={`ledger-amount ${amtClass}`}>
          {sign}{formatRp(trx.nominal)}
        </div>
        <div className="ledger-date">{formatTanggal(trx.tanggal)}</div>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────
export default function DashboardPage() {
  const supabase = createClient();
  const router = useRouter();

  // State Profile & Data
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [filtered, setFiltered] = useState<Transaksi[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Tab & UI State
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [chartMode, setChartMode] = useState<ChartMode>('donut');
  const [masked, setMasked] = useState(true);
  const [csOpen, setCsOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // State Anggota (Dinamis dari Tabel anggota_kkn)
  const [daftarAnggota, setDaftarAnggota] = useState<{id: string, nama: string}[]>([]);
  const [modalAnggota, setModalAnggota] = useState(false);
  const [namaAnggotaBaru, setNamaAnggotaBaru] = useState('');

  // Filter State
  const [search, setSearch] = useState('');
  const [filterTipe, setFilterTipe] = useState('Semua');
  const [filterMulai, setFilterMulai] = useState('');
  const [filterAkhir, setFilterAkhir] = useState('');

  // Modal State
  const [trxModal, setTrxModal] = useState(false);
  const [filterModal, setFilterModal] = useState(false);
  const [detailModal, setDetailModal] = useState(false);
  const [anggaranModal, setAnggaranModal] = useState(false);
  const [detailTrx, setDetailTrx] = useState<Transaksi | null>(null);
  const [detailKasAnggota, setDetailKasAnggota] = useState<string | null>(null);

  // Form Transaksi
  const [form, setForm] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    jenis: 'Pemasukan' as 'Pemasukan' | 'Pengeluaran' | 'Kas',
    kategori: '',
    anggota: '', 
    nominal: '',
    keterangan: '',
  });
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [formLoading, setFormLoading] = useState(false);

  // Form Anggaran
  const [angForm, setAngForm] = useState({ 
    kategori: '', 
    batas: '', 
    periode: getPeriodeSekarang() 
  });
  const [angLoading, setAngLoading] = useState(false);

  // ─── LOAD DATA ─────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { 
        router.push('/'); 
        return; 
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (prof) setProfile(prof);

      const { data: allAnggota } = await supabase
        .from('anggota_kkn')
        .select('*')
        .order('nama');
      
      if (allAnggota) setDaftarAnggota(allAnggota);

      const { data: rows, error } = await supabase
        .from('transaksi')
        .select('*')
        .eq('status', 'aktif')
        .order('tanggal', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      const riwayat: Transaksi[] = rows || [];
      let totalPemasukanMurni = 0;
      let totalPengeluaran = 0;
      let totalKas = 0;
      const kasMap: Record<string, number> = {};

      riwayat.forEach(t => {
        const n = Number(t.nominal);
        if (t.jenis === 'Pemasukan') totalPemasukanMurni += n;
        if (t.jenis === 'Pengeluaran') totalPengeluaran += n;
        if (t.jenis === 'Kas') {
          totalKas += n;
          kasMap[t.kategori] = (kasMap[t.kategori] || 0) + n; 
        }
      });

      const rekapKas = (allAnggota || []).map(p => ({
        nama: p.nama,
        total: kasMap[p.nama] || 0
      })).sort((a, b) => b.total - a.total);

      const { data: angRows } = await supabase
        .from('anggaran')
        .select('*')
        .order('kategori');

      setData({
        saldo: (totalPemasukanMurni + totalKas) - totalPengeluaran,
        pemasukan: totalPemasukanMurni,
        pengeluaran: totalPengeluaran,
        totalKas,
        riwayat,
        rekapKas,
        anggaranList: angRows || [],
      });
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transaksi' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anggaran' }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anggota_kkn' }, () => loadAll())
      .subscribe((status) => setRealtimeConnected(status === 'SUBSCRIBED'));
      
    return () => { 
      supabase.removeChannel(channel); 
    };
  }, [loadAll, supabase]);

  // ─── FILTER EFFECT ──────────────────────────────────────────
  useEffect(() => {
    if (!data) return;
    const kw = search.toLowerCase();
    
    const f = data.riwayat.filter(t => {
      const matchSearch = t.kategori.toLowerCase().includes(kw) || t.keterangan.toLowerCase().includes(kw);
      
      let matchTipe = true;
      if (filterTipe === 'Pemasukan') matchTipe = t.jenis === 'Pemasukan';
      else if (filterTipe === 'Pengeluaran') matchTipe = t.jenis === 'Pengeluaran';
      else if (filterTipe === 'Kas') matchTipe = t.jenis === 'Kas';
      
      let matchWaktu = true;
      if (filterMulai) matchWaktu = t.tanggal >= filterMulai;
      if (filterAkhir) matchWaktu = matchWaktu && t.tanggal <= filterAkhir;
      
      return matchSearch && matchTipe && matchWaktu;
    });
    
    setFiltered(f);
  }, [data, search, filterTipe, filterMulai, filterAkhir]);

  // ─── HANDLERS ──────────────────────────────────────────────
  async function handleSubmit() {
    if (!profile) return;
    const rawNominal = parseFloat(form.nominal.replace(/\./g, ''));
    if (isNaN(rawNominal) || rawNominal <= 0) {
      return Swal.fire('Nominal tidak valid', 'Masukkan nominal yang benar', 'warning');
    }
    
    const kategori = form.jenis === 'Kas' ? form.anggota : form.kategori;
    if (!kategori) {
      return Swal.fire('Kategori/Nama kosong', 'Harap lengkapi isian form', 'warning');
    }
    
    setFormLoading(true);
    try {
      let bukti_url = null;
      if (fotoFile) {
        const { base64, mime } = await compressImage(fotoFile);
        const path = `${profile.id}/${Date.now()}.jpg`;
        const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        
        const { error: uploadErr } = await supabase.storage
          .from('receipts')
          .upload(path, byteArray, { contentType: mime });
          
        if (!uploadErr) {
          bukti_url = supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl;
        }
      }
      
      const { error } = await supabase.from('transaksi').insert({
        tanggal: form.tanggal, 
        jenis: form.jenis, 
        kategori, 
        nominal: rawNominal,
        keterangan: form.keterangan || '-', 
        bukti_url, 
        created_by: profile.id,
        email_aktor: profile.email, 
        status: 'aktif'
      });
      
      if (error) throw error;
      
      setTrxModal(false); 
      resetForm(); 
      await loadAll();
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Tersimpan!', showConfirmButton: false, timer: 1500 });
    } catch (err) { 
      Swal.fire('Gagal', String(err), 'error'); 
    } finally { 
      setFormLoading(false); 
    }
  }

  async function handleSaveAnggaran() {
    if (!angForm.kategori || !angForm.batas) return;
    setAngLoading(true);
    try {
      const nominalAngka = parseFloat(angForm.batas.replace(/\./g, ''));
      const { error } = await supabase.from('anggaran').upsert({
        kategori: angForm.kategori,
        batas: nominalAngka,
        periode: angForm.periode,
      }, { onConflict: 'kategori,periode' });
      
      if (error) throw error;
      
      setAnggaranModal(false); 
      setAngForm({ kategori: '', batas: '', periode: getPeriodeSekarang() });
      await loadAll();
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Anggaran diperbarui!', showConfirmButton: false, timer: 1500 });
    } catch (err) { 
      Swal.fire('Gagal menyimpan anggaran', String(err), 'error'); 
    } finally { 
      setAngLoading(false); 
    }
  }

  async function handleSaveAnggota() {
    if (!namaAnggotaBaru) return;
    setFormLoading(true);
    try {
      const { error } = await supabase.from('anggota_kkn').insert({ nama: namaAnggotaBaru });
      if (error) throw error;
      
      setModalAnggota(false); 
      setNamaAnggotaBaru(''); 
      await loadAll();
      Swal.fire({ toast: true, position: 'top', icon: 'success', title: 'Anggota ditambah!', showConfirmButton: false, timer: 1500 });
    } catch (err) { 
      Swal.fire('Gagal', 'Nama mungkin sudah ada.', 'error'); 
    } finally { 
      setFormLoading(false); 
    }
  }

  async function handleDeleteTrx(id: string) {
    if (!canManage) return;
    const confirm = await Swal.fire({ 
      title: 'Hapus Transaksi?', 
      icon: 'warning', 
      showCancelButton: true, 
      confirmButtonColor: '#F43F5E',
      confirmButtonText: 'Ya, Hapus' 
    });
    
    if (!confirm.isConfirmed) return;
    
    const { error } = await supabase
      .from('transaksi')
      .update({ status: 'dihapus' })
      .eq('id', id);
      
    if (!error) { 
      setDetailModal(false); 
      await loadAll(); 
    }
  }

  // ─── LOGOUT & EXPORT (Format HTML PDF Utuh) ─────────────────
  async function handleLogout() { 
    await supabase.auth.signOut(); 
    router.push('/'); 
  }
  
  function exportPDF() {
    if (!filtered.length) { 
      Swal.fire('Data kosong', 'Tidak ada data untuk diexport', 'info'); 
      return; 
    }
    
    import('html2pdf.js').then(({ default: html2pdf }) => {
      let totalIn = 0, totalOut = 0;
      const rows = filtered.map(t => {
        const isIn = t.jenis !== 'Pengeluaran';
        if (isIn) {
          totalIn += Number(t.nominal);
        } else {
          totalOut += Number(t.nominal);
        }
        
        const color = isIn ? '#10B981' : '#F43F5E';
        const sign = isIn ? '+' : '-';
        
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
          <thead>
            <tr style="background:#F1F5F9;">
              <th style="padding:8px;border:1px solid #ddd;text-align:left;font-size:11px;">Tanggal</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:left;font-size:11px;">Jenis</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:left;font-size:11px;">Kategori</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:left;font-size:11px;">Keterangan</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:right;font-size:11px;">Nominal</th>
            </tr>
          </thead>
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
      html2pdf().set({
        margin: 10,
        filename: `Mutasi_Cyartha_${getPeriodeSekarang()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(el).save().then(() => Swal.close());
    });
  }

  function exportCSV() {
    if (!filtered.length) { 
      Swal.fire('Data kosong', '', 'info'); 
      return; 
    }
    
    let csv = '\uFEFFTANGGAL,JENIS,KATEGORI,NOMINAL,KETERANGAN\n';
    filtered.forEach(t => {
      const sign = t.jenis === 'Pengeluaran' ? '-' : '';
      csv += `${t.tanggal},${t.jenis},"${t.kategori}",${sign}${t.nominal},"${t.keterangan}"\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mutasi_Cyartha_${getPeriodeSekarang()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetForm() { 
    setForm({ 
      tanggal: new Date().toISOString().split('T')[0], 
      jenis: 'Pemasukan', 
      kategori: '', 
      anggota: '', 
      nominal: '', 
      keterangan: '' 
    }); 
    setFotoFile(null); 
  }

  const handleExportMenu = () => {
    Swal.fire({
      title: 'Pilih Format Laporan',
      text: 'Silakan pilih format file yang ingin diunduh',
      icon: 'question',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: '📄 PDF',
      denyButtonText: '📊 CSV',
      cancelButtonText: 'Batal',
      confirmButtonColor: '#10B981',
      denyButtonColor: '#00AEEF',
    }).then((result) => {
      if (result.isConfirmed) {
        exportPDF();
      } else if (result.isDenied) {
        exportCSV();
      }
    });
  };
  // ─── CHART DATA & OPTIONS ────────────────────────────────────
  const donutData = data ? {
    labels: ['Pemasukan', 'Pengeluaran', 'Kas'],
    datasets: [{ 
      data: [data.pemasukan, data.pengeluaran, data.totalKas], 
      backgroundColor: ['#00AEEF', '#F43F5E', '#F59E0B'], 
      borderWidth: 0
    }]
  } : null;
  
  const barLabels = (() => {
    if (!data) return [];
    const dayMap: Record<string, boolean> = {};
    [...data.riwayat].reverse().forEach(t => { dayMap[t.tanggal] = true; });
    return Object.keys(dayMap).slice(-14);
  })();

  const barData = data ? {
    labels: barLabels.map(d => formatTanggal(d).split(' ').slice(0, 2).join(' ')),
    datasets: [
      { 
        label: 'Pemasukan', 
        data: barLabels.map(d => data.riwayat.filter(t => t.tanggal === d && t.jenis === 'Pemasukan').reduce((s, t) => s + Number(t.nominal), 0)), 
        backgroundColor: '#00AEEF', 
        borderRadius: 6 
      },
      { 
        label: 'Pengeluaran', 
        data: barLabels.map(d => data.riwayat.filter(t => t.tanggal === d && t.jenis === 'Pengeluaran').reduce((s, t) => s + Number(t.nominal), 0)), 
        backgroundColor: '#F43F5E', 
        borderRadius: 6 
      },
      { 
        label: 'Kas', 
        data: barLabels.map(d => data.riwayat.filter(t => t.tanggal === d && t.jenis === 'Kas').reduce((s, t) => s + Number(t.nominal), 0)), 
        backgroundColor: '#F59E0B', 
        borderRadius: 6 
      },
    ],
  } : null;

 // Options khusus Donat (tanpa garis sumbu)
  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { 
      legend: { 
        position: 'bottom' as const,
        labels: { boxWidth: 12, font: { size: 10 } }
      }
    }
  };

  // Options khusus Bar (pakai garis sumbu yang di-hide)
  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { 
      legend: { 
        position: 'bottom' as const,
        labels: { boxWidth: 12, font: { size: 10 } }
      }
    },
    scales: {
      x: { border: { display: false }, grid: { display: false, drawOnChartArea: false, drawTicks: false } },
      y: { border: { display: false }, grid: { display: false, drawOnChartArea: false, drawTicks: false }, ticks: { display: false } }
    }
  };

  const anggaranWithProgress = data?.anggaranList.map(ang => {
    const spent = data.riwayat
      .filter(t => t.jenis === 'Pengeluaran' && t.kategori.toLowerCase() === ang.kategori.toLowerCase() && t.tanggal.startsWith(ang.periode))
      .reduce((s, t) => s + Number(t.nominal), 0);
      
    const pct = Math.min(Math.round((spent / ang.batas) * 100), 100);
    return { ...ang, spent, pct, cls: getBudgetClass(pct) };
  }) ?? [];

  const canManage = profile?.role === 'admin' || profile?.role === 'bendahara';

 // ─── SETUP QUOTES & STATE ───
  const quotes = [
    "Semua burger hanya milik Allah. Juicy Luicy, Rizky Febian, Mahalini, I love you so much.",
    "Semua saldo rekening hanya milik Allah. Nadin Amizah, Coldplay, Bismillah baca Al-Quran, rekam, posting!",
    "Semua anggota Susur Batur hanya milik Allah. Deddy Corbuzier, Nissa Sabyan, I love you so much.",
    "Semua data Cyartha hanya milik Allah. Oasis, James Miller, Bismillah Alhamdulillah.",
    "Semua utang piutang hanya milik Allah. Lionel Messi, Mbappe, I love you so much.",
    "Semua sate taichan hanya milik Allah. Bismillah, Vidi Aldiano, Sheila On 7, tetap semangat!"
  ];

  const [randomQuote, setRandomQuote] = useState("");

  useEffect(() => {
    if (loading) {
      const randomIndex = Math.floor(Math.random() * quotes.length);
      setRandomQuote(quotes[randomIndex]);
    }
  }, [loading]);

  // ─── RENDER LOADING ─────────────────────────────────────────
  if (loading) {
    const loadingContainerStyle: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      flexDirection: 'column',
      background: 'var(--blu-navy)',
      padding: '20px',
      textAlign: 'center',
      fontFamily: 'sans-serif'
    };

    return (
      <div style={loadingContainerStyle}>
        <div className="spinner" style={{ 
          width: 40, 
          height: 40, 
          borderWidth: 4, 
          borderTopColor: 'var(--blu-cyan)',
          marginBottom: 24 
        }} />

        <div style={{ maxWidth: '450px' }}>
          <p style={{ 
            color: 'var(--blu-cyan)', 
            fontSize: '0.75rem', 
            letterSpacing: '3px', 
            fontWeight: 'bold',
            margin: '0 0 12px 0',
            opacity: 0.8
          }}>
            SYSTEM LOADING...
          </p>
          
          <div style={{ 
            padding: '20px', 
            border: '1px solid rgba(0, 255, 240, 0.1)', 
            borderRadius: '16px',
            background: 'rgba(255, 255, 255, 0.02)',
            backdropFilter: 'blur(10px)'
          }}>
            <p style={{ 
              color: '#fff', 
              fontSize: '1.1rem', 
              lineHeight: '1.6', 
              margin: 4,
              fontStyle: 'italic',
              fontWeight: 300
            }}>
              "{randomQuote}"
            </p>
          </div>
          
         
        </div>

        <style>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .spinner { animation: spin 1s linear infinite; }
          div > div { animation: fadeIn 0.8s ease-out; }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  // ─── RENDER MAIN APP ────────────────────────────────────────
  return (
    <div className="app-body">
      
      {/* ── CSS PATCH UNTUK UI RESPONSIVE ── */}
      <style>{`
        .app-container {
          max-width: 1400px !important; 
          width: 100%;
        }
        .chart-wrapper {
          position: relative;
          height: 300px;
          width: 100%;
          overflow: hidden; 
        }
        @media (max-width: 768px) {
          .sidebar { display: none !important; }
          .top-header {
            display: flex; justify-content: space-between; align-items: center; padding: 10px 16px;
          }
          .user-info-mini { display: none; }
        }
      `}</style>

      {/* ── HEADER ── */}
      <header className="top-header">
        <div className="logo"><span>Cy</span>artha.<span style={{fontSize:"5", fontWeight: '600', color: '#567fcb' }}> x </span><span style={{fontSize:18, fontWeight: '800', color: '#b1a722'}}>Aldi Taher</span>
          </div>
        <div className="header-right">
          {realtimeConnected && (
            <div className="realtime-badge">
              <div className="realtime-dot" /> Live
            </div>
          )}
          <div 
            className="user-avatar-wrap" 
            onClick={() => Swal.fire({ 
              title: profile?.nama, 
              html: `<p style="color:#64748B;margin-bottom:12px;">${profile?.email}</p><span class="chip ${profile?.role === 'admin' ? 'chip-green' : profile?.role === 'bendahara' ? 'chip-amber' : 'chip-blue'}">${profile?.role?.toUpperCase()}</span>`,
              showCancelButton: true, 
              confirmButtonText: 'Keluar',
              cancelButtonText: 'Tutup',
              confirmButtonColor: '#F43F5E' 
              }).then(r => {
                if (r.isConfirmed) handleLogout();
              })}
          >
            <div className="user-info-mini">
              <div className="user-name">{profile?.nama?.split(' ')[0]}</div>
              <span className={`user-role-badge role-${profile?.role}`}>
                {profile?.role}
              </span>
            </div>
            <img 
              className="avatar-img" 
              src={profile?.avatar_url || `https://ui-avatars.com/api/?name=${profile?.nama}&background=E0F6FF&color=00AEEF`} 
              alt="avatar"
            />
          </div>
        </div>
      </header>

      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        {(['home','tracker','arus kas','anggaran'] as Tab[]).map(tab => (
          <div 
            key={tab} 
            className={`nav-item${activeTab === tab ? ' active' : ''}`} 
            onClick={() => setActiveTab(tab)}
          >
            <span className="nav-icon">
              {tab === 'home' ? '🏠' : tab === 'tracker' ? '📊' : tab === 'arus kas' ? '💼' : '🎯'}
            </span>
            <span className="nav-label">
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div className="nav-item" onClick={handleLogout}>
          <span className="nav-icon">🚪</span>
          <span className="nav-label">Keluar</span>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ── */}
      <div className="app-container">
        
        {/* ════ TAB HOME ════ */}
        {activeTab === 'home' && (
          <main className="tab-content active">
            <div className="hero-card">
              <div className="hero-label">
                Saldo Aktif (Pemasukan + Kas) 
                <button className="eye-btn" onClick={() => setMasked(!masked)}>
                  {masked ? '🙈' : '🐵'}
                </button>
              </div>
              <div className={`hero-amount${masked ? ' masked' : ''}`}>
                {masked ? 'Rp ***' : formatRp(data?.saldo || 0)}
              </div>
              <div className="hero-quick-stats">
                <div className="hero-stat-pill">
                  <div className="label">Pemasukan</div>
                  <div className="value in">
                    {masked ? '***' : formatRp((data?.pemasukan || 0) + (data?.totalKas || 0))}
                  </div>
                </div>
                <div className="hero-stat-pill">
                  <div className="label">Pengeluaran</div>
                  <div className="value out">
                    {masked ? '***' : formatRp(data?.pengeluaran || 0)}
                  </div>
                </div>
              </div>
            </div>
            
            <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={() => setTrxModal(true)}>
              + Transaksi Baru
            </button>
            
            <div className="section-title">Ringkasan</div>
            <div className="summary-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="card summary-card">
                <div className="icon-wrap in">📥</div>
                <div className="slabel">Total Uang Masuk (Termasuk Kas)</div>
                <div className="svalue">{masked ? '***' : formatRp((data?.pemasukan || 0) + (data?.totalKas || 0))}</div>
              </div>
              <div className="card summary-card">
                <div className="icon-wrap out">📤</div>
                <div className="slabel">Pengeluaran</div>
                <div className="svalue">{masked ? '***' : formatRp(data?.pengeluaran || 0)}</div>
              </div>
            </div>

            <div className="section-title">Aktivitas Terakhir</div>
            <div className="card">
              {data?.riwayat.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <p>Belum ada transaksi</p>
                </div>
              ) : (
                data?.riwayat.slice(0, 5).map(t => (
                  <LedgerItem key={t.id} trx={t} onClick={() => { setDetailTrx(t); setDetailModal(true); }} />
                ))
              )}
            </div>
          </main>
        )}

        {/* ════ TAB TRACKER ════ */}
        {activeTab === 'tracker' && (
          <main className="tab-content active">
            <div className="section-title">Arus Kas</div>
            <div className="card">
              <div className="chart-toggle" style={{ marginBottom: 12 }}>
                <button className={chartMode === 'donut' ? 'active' : ''} onClick={() => setChartMode('donut')}>Donat</button>
                <button className={chartMode === 'bar' ? 'active' : ''} onClick={() => setChartMode('bar')}>Batang</button>
              </div>
              <div className="chart-wrapper">
                {chartMode === 'donut' && donutData && (
                  <Doughnut data={donutData} options={donutOptions} />  
                )}
                {chartMode === 'bar' && barData && (
                  <Bar data={barData} options={barOptions} />
                )}
              </div>
            </div>
            
            <div className="section-title" style={{ marginTop: 24 }}>Riwayat Lengkap</div>
            
        {/* FILTER TERCETRALISASI YANG LEBIH RAPI */}
           {/* SEARCH, FILTER, & EXPORT DALAM SATU BARIS */}
            <div style={{ 
              display: 'flex', 
              gap: '8px', 
              alignItems: 'center', 
              marginBottom: '16px',
              width: '100%' 
            }}>
              
              {/* Kolom Pencarian (Mengambil sisa ruang) */}
              <div className="search-bar" style={{ 
                flex: 1, 
                margin: 0, 
                display: 'flex', 
                alignItems: 'center' 
              }}>
                <span style={{ opacity: 0.4, marginLeft: '10px' }}>🔍</span>
                <input 
                  placeholder="Cari..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  style={{ 
                    width: '90%',
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    padding: '6px'
                  }} 
                />
              </div>

              {/* Tombol Filter Lanjutan */}
              <button 
                className="btn-filter" 
                onClick={() => setFilterModal(true)} 
                style={{ 
                  margin: 0, 
                  minWidth: '42px', 
                  height: '50px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center' 
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>
                </svg>
              </button>

              {/* Tombol Export (Satu Tombol) */}
              <button 
                className="btn-filter" 
                onClick={handleExportMenu}
                style={{ 
                  margin: 0, 
                  minWidth: '42px', 
                  height: '52px', // Sesuaikan height ini dengan tombol filter di sebelahnya biar rata
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  borderColor: 'var(--blu-cyan)',
                  color: 'var(--blu-cyan)',
                  background: 'rgba(0, 174, 239, 0.05)',
                  borderRadius: '12px' // Tambahkan ini biar melengkungnya pas dengan search bar
                }}
                title="Export Laporan"
              >
                <Download 
                  size={20} 
                  strokeWidth={1.5} 
                  color="var(--blu-cyan)" 
                />
              </button>
              
            </div>
            
            <div className="card" style={{ marginTop: 15 }}>
              {filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🔍</div>
                  <p>Tidak ada data ditemukan</p>
                </div>
              ) : (
                filtered.map(t => (
                  <LedgerItem key={t.id} trx={t} onClick={() => { setDetailTrx(t); setDetailModal(true); }} />
                ))
              )}
            </div>
          </main>
        )}

        {/* ════ TAB ARUS KAS ════ */}
        {activeTab === 'arus kas' && (
          <main className="tab-content active">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                Rekap Setoran Kas Anggota
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 400, marginTop: 4 }}>
                  Klik nama untuk lihat rincian kas.
                </p>
              </div>
              {canManage && (
                <button className="btn btn-primary btn-sm" onClick={() => setModalAnggota(true)}>
                  + Tambah Anggota
                </button>
              )}
            </div>
            
            {data?.rekapKas.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-icon">💼</div>
                  <p>Belum ada nama anggota terdaftar. Silakan tambah anggota.</p>
                </div>
              </div>
            ) : (
              <div className="kas-grid">
                {data?.rekapKas.map(kas => {
                  const status = getStatusKas(kas.nama, data.riwayat);
                  return (
                    <div 
                      key={kas.nama} 
                      className="kas-card hover-lift" 
                      onClick={() => setDetailKasAnggota(kas.nama)}
                      style={{ cursor: 'pointer' }}
                    >
                      <img 
                        className="kas-avatar" 
                        src={`https://ui-avatars.com/api/?name=${encodeURIComponent(kas.nama)}&background=E0F6FF&color=00AEEF&bold=true`} 
                        alt={kas.nama} 
                      />
                      <div className="kas-nama">{kas.nama}</div>
                      <div className="kas-total">{formatRp(kas.total)}</div>
                      <div style={{ fontSize: '0.75rem', color: status.color, marginTop: 8, fontWeight: 600 }}>
                        {status.text}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        )}

        {/* ════ TAB ANGGARAN ════ */}
        {activeTab === 'anggaran' && (
          <main className="tab-content active">
            <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Anggaran Pengeluaran
              {canManage && (
                <button className="btn btn-primary btn-sm" onClick={() => setAnggaranModal(true)}>
                  + Tambah
                </button>
              )}
            </div>
            
            {anggaranWithProgress.length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-icon">🎯</div>
                  <p>{canManage ? 'Tambah anggaran untuk mulai memantau pengeluaran' : 'Belum ada anggaran ditetapkan'}</p>
                </div>
              </div>
            ) : (
              <div className="card">
                {anggaranWithProgress.map(ang => (
                  <div key={ang.id} className="budget-item">
                    <div className="budget-row">
                      <div className="budget-kategori">{ang.kategori}</div>
                      <div className="budget-numbers">
                        {formatRp(ang.spent)} / {formatRp(ang.batas)}
                      </div>
                    </div>
                    <div className="budget-bar-track">
                      <div className={`budget-bar-fill ${ang.cls}`} style={{ width: `${ang.pct}%` }} />
                    </div>
                    <div className={`budget-pct ${ang.cls}`}>
                      {ang.pct}% terpakai — {ang.pct >= 100 ? '🚨 Melebihi batas!' : ang.pct >= 75 ? '⚠️ Mendekati batas' : '✅ Aman'}
                    </div>
                    {canManage && (
                      <button 
                        className="btn btn-danger btn-sm" 
                        style={{ width: 'auto', marginTop: 8 }} 
                        onClick={async () => { 
                          const c = await Swal.fire({ title: 'Hapus Anggaran?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#F43F5E' }); 
                          if (c.isConfirmed) { 
                            await supabase.from('anggaran').delete().eq('id', ang.id); 
                            await loadAll(); 
                          } 
                        }}
                      >
                        🗑 Hapus
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </main>
        )}
      </div>

      {/* ── BOTTOM NAV (Mobile) ── */}
      <nav className="bottom-nav">
        {(['home','tracker','arus kas','anggaran'] as Tab[]).map(tab => (
          <div 
            key={tab} 
            className={`nav-item${activeTab===tab?' active':''}`} 
            onClick={() => setActiveTab(tab)}
          >
            <span className="nav-icon">
              {tab === 'home' ? '🏠' : tab === 'tracker' ? '📊' : tab === 'arus kas' ? '💼' : '🎯'}
            </span>
            <span className="nav-label">
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </span>
          </div>
        ))}
      </nav>

      {/* ── CUSTOMER SERVICE ── */}
      <div className="cs-container">
        <button className="cs-main-btn" onClick={() => setCsOpen(o => !o)}>💬</button>
        <div className={`cs-menu${csOpen ? ' open' : ''}`}>
          <a href="https://wa.me/6285643312905" target="_blank" className="cs-item wa">WhatsApp</a>
          <a href="mailto:cyborged30s@gmail.com" className="cs-item email">Email</a>
        </div>
      </div>

      {/* ════ MODALS ════ */}
      
      {/* Modal Filter Lanjutan */}
      <div className={`modal-backdrop${filterModal ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setFilterModal(false); }}>
        <div className="modal-sheet">
          <div className="modal-header">
            <span className="modal-title">Pencarian Lanjutan</span>
            <button className="close-btn" onClick={() => setFilterModal(false)}>✕</button>
          </div>
          <div className="form-group">
            <label>Jenis Transaksi</label>
            <select value={filterTipe} onChange={e => setFilterTipe(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <option value="Semua">Semua Kategori</option>
              <option value="Pemasukan">📥 Pemasukan</option>
              <option value="Kas">💰 Kas Anggota</option>
              <option value="Pengeluaran">💸 Pengeluaran</option>
            </select>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Dari Tanggal</label>
              <input type="date" value={filterMulai} onChange={e => setFilterMulai(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #E2E8F0' }} />
            </div>
            <div className="form-group">
              <label>Sampai Tanggal</label>
              <input type="date" value={filterAkhir} onChange={e => setFilterAkhir(e.target.value)} style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1px solid #E2E8F0' }} />
            </div>
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
          <div className="modal-header">
            <span className="modal-title">Catat Transaksi</span>
            <button className="close-btn" onClick={() => { setTrxModal(false); resetForm(); }}>✕</button>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Tanggal</label>
              <input type="date" value={form.tanggal} onChange={e => setForm({...form, tanggal: e.target.value})} required />
            </div>
            <div className="form-group">
              <label>Jenis</label>
              <select value={form.jenis} onChange={e => setForm({...form, jenis: e.target.value as any})}>
                <option value="Pemasukan">📥 Pemasukan</option>
                <option value="Kas">💰 Setoran Kas</option>
                <option value="Pengeluaran">💸 Pengeluaran</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            {form.jenis === 'Kas' ? (
              <div className="form-group">
                <label>Nama Anggota</label>
                <select value={form.anggota} onChange={e => setForm({...form, anggota: e.target.value})}>
                  <option value="">-- Pilih Anggota --</option>
                  {daftarAnggota.map(a => (
                    <option key={a.id} value={a.nama}>{a.nama}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-group">
                <label>Kategori</label>
                <input type="text" placeholder="Konsumsi, Bensin..." value={form.kategori} onChange={e => setForm({...form, kategori: e.target.value})} />
              </div>
            )}
            <div className="form-group">
              <label>Nominal (Rp)</label>
              <div className="input-prefix-wrap">
                <span className="prefix">Rp</span>
                <input 
                  type="text" 
                  inputMode="numeric"
                  value={form.nominal} 
                  onChange={e => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setForm({...form, nominal: raw ? new Intl.NumberFormat('id-ID').format(parseInt(raw)) : ''})
                  }} 
                />
              </div>
            </div>
          </div>
          <div className="form-group">
            <label>Keterangan (Opsional)</label>
            <input type="text" placeholder="Detail transaksi..." value={form.keterangan} onChange={e => setForm({...form, keterangan: e.target.value})} />
          </div>
          <div className="form-group">
            <label>Bukti Foto (Opsional)</label>
            <input type="file" accept="image/*" style={{ padding: '10px', background: '#F8FAFC', borderRadius: 12, border: '1.5px solid #E2E8F0', width: '100%' }} onChange={(e: ChangeEvent<HTMLInputElement>) => setFotoFile(e.target.files?.[0] || null)} />
          </div>
          <button className="btn btn-primary mt-2" onClick={handleSubmit} disabled={formLoading}>
            {formLoading ? <><span className="spinner" /> Menyimpan...</> : '💾 Simpan Transaksi'}
          </button>
        </div>
      </div>

      {/* Modal Anggaran */}
      <div className={`modal-backdrop${anggaranModal ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setAnggaranModal(false); }}>
        <div className="modal-sheet">
          <div className="modal-header">
            <span className="modal-title">Set Anggaran</span>
            <button className="close-btn" onClick={() => setAnggaranModal(false)}>✕</button>
          </div>
          <div className="form-group">
            <label>Kategori</label>
            <input type="text" value={angForm.kategori} onChange={e => setAngForm({...angForm, kategori: e.target.value})} />
          </div>
          <div className="form-group">
            <label>Batas Nominal (Rp)</label>
            <div className="input-prefix-wrap">
              <span className="prefix">Rp</span>
              <input 
                type="text" 
                inputMode="numeric"
                value={angForm.batas} 
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '');
                  setAngForm({...angForm, batas: raw ? new Intl.NumberFormat('id-ID').format(parseInt(raw)) : ''});
                }} 
              />
            </div>
          </div>
          <div className="form-group">
            <label>Periode</label>
            <input type="month" value={angForm.periode} onChange={e => setAngForm({...angForm, periode: e.target.value})} />
          </div>
          <button className="btn btn-primary" onClick={handleSaveAnggaran} disabled={angLoading}>
            {angLoading ? <span className="spinner" /> : 'Simpan Anggaran'}
          </button>
        </div>
      </div>

      {/* Modal Tambah Anggota */}
      <div className={`modal-backdrop${modalAnggota ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setModalAnggota(false); }}>
        <div className="modal-sheet">
          <div className="modal-header">
            <span className="modal-title">Tambah Anggota KKN</span>
            <button className="close-btn" onClick={() => setModalAnggota(false)}>✕</button>
          </div>
          <div className="form-group">
            <label>Nama Lengkap / Panggilan</label>
            <input type="text" placeholder="Masukkan nama..." value={namaAnggotaBaru} onChange={e => setNamaAnggotaBaru(e.target.value)} />
          </div>
          <button className="btn btn-primary mt-2" onClick={handleSaveAnggota} disabled={formLoading}>
            {formLoading ? <><span className="spinner" /> Menyimpan...</> : 'Simpan Anggota'}
          </button>
        </div>
      </div>

      {/* Modal Detail Transaksi */}
      {detailTrx && (
        <div className={`modal-backdrop${detailModal ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setDetailModal(false); }}>
          <div className="modal-sheet" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <span className="modal-title">Detail Transaksi</span>
              <button className="close-btn" onClick={() => setDetailModal(false)}>✕</button>
            </div>
            
            <div className={`detail-amount-wrap ${detailTrx.jenis === 'Pengeluaran' ? 'out' : detailTrx.jenis === 'Kas' ? 'kas' : 'in'}`}>
              <div className="detail-emoji">
                {detailTrx.jenis === 'Pengeluaran' ? '💸' : detailTrx.jenis === 'Kas' ? '💰' : '📥'}
              </div>
              <div className={`detail-amount ${detailTrx.jenis === 'Pengeluaran' ? 'out' : detailTrx.jenis === 'Kas' ? 'kas' : 'in'}`}>
                {detailTrx.jenis === 'Pengeluaran' ? '-' : '+'}{formatRp(Number(detailTrx.nominal))}
              </div>
            </div>
            
            <div className="receipt-box" style={{ marginTop: 16 }}>
              <div className="receipt-row">
                <span className="rlabel">Tanggal</span>
                <span className="rvalue">{formatTanggal(detailTrx.tanggal)}</span>
              </div>
              <div className="receipt-row">
                <span className="rlabel">Jenis</span>
                <span className="rvalue">{detailTrx.jenis}</span>
              </div>
              <div className="receipt-row">
                <span className="rlabel">Kategori</span>
                <span className="rvalue">{detailTrx.kategori}</span>
              </div>
              <div className="receipt-row">
                <span className="rlabel">Keterangan</span>
                <span className="rvalue">{detailTrx.keterangan}</span>
              </div>
              <div className="receipt-row">
                <span className="rlabel">Oleh</span>
                <span className="rvalue">{detailTrx.email_aktor}</span>
              </div>
            </div>
            
           {detailTrx.bukti_url && (
              <div style={{ 
                marginTop: '16px', 
                display: 'flex', 
                justifyContent: 'center', /* Ini yang bikin posisi di tengah */
                width: '100%' 
              }}>
                <img 
                  src={detailTrx.bukti_url} 
                  alt="Bukti transaksi" 
                  style={{ 
                    width: '100%', 
                    maxWidth: '250px', /* Saya besarkan sedikit dari 200px biar lebih jelas */
                    height: 'auto', 
                    objectFit: 'cover',
                    borderRadius: '12px', /* Melengkung lebih halus */
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)' /* Tambahan bayangan tipis */
                  }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                />
              </div>
            )}
            
            {canManage && (
              <button className="btn btn-danger mt-4" onClick={() => handleDeleteTrx(detailTrx.id)}>
                🗑 Hapus Transaksi
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modal Detail Rincian Kas Anggota */}
      {detailKasAnggota && (
        <div className="modal-backdrop open" onClick={(e) => { if (e.target === e.currentTarget) setDetailKasAnggota(null); }}>
          <div className="modal-sheet" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <span className="modal-title">Rincian Kas: {detailKasAnggota}</span>
              <button className="close-btn" onClick={() => setDetailKasAnggota(null)}>✕</button>
            </div>
            
            <div style={{ maxHeight: '60vh', overflowY: 'auto', marginTop: 16 }}>
              {data?.riwayat.filter(t => t.jenis === 'Kas' && t.kategori === detailKasAnggota).length === 0 ? (
                 <div className="empty-state" style={{ padding: '30px 0' }}>
                   <div className="empty-icon" style={{ fontSize: '2rem' }}>🧾</div>
                   <p>Belum ada riwayat pembayaran.</p>
                 </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {data?.riwayat
                    .filter(t => t.jenis === 'Kas' && t.kategori === detailKasAnggota)
                    .map(t => (
                      <div 
                        key={t.id} 
                        style={{ padding: 16, border: '1px solid #E2E8F0', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                         <div>
                           <div style={{ fontWeight: 600, color: 'var(--blu-navy)' }}>
                             {formatTanggal(t.tanggal)}
                           </div>
                           <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                             {t.keterangan}
                           </div>
                         </div>
                         <div style={{ fontWeight: 700, color: '#10B981', fontSize: '1.1rem' }}>
                           + {formatRp(t.nominal)}
                         </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}