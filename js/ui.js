// Fungsi bantu tampilan

export function h(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const TZ = 'Asia/Jakarta';

// tanggal hari ini (WIB) dalam bentuk YYYY-MM-DD
export function hariIni(offsetHari = 0) {
  const d = new Date(Date.now() + offsetHari * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

// "2026-11-23T09:00:00" (timestamp tanpa zona, sudah WIB) → "09.00"
export function jamLokal(ts) {
  if (!ts) return '—';
  const m = String(ts).match(/T?(\d{2}):(\d{2})/);
  return m ? `${m[1]}.${m[2]}` : '—';
}

// timestamptz (UTC) → "09.00" WIB
export function jamDariUTC(ts) {
  if (!ts) return '—';
  return new Intl.DateTimeFormat('id-ID', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(ts)).replace(':', '.');
}

export function tanggalPanjang(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export function tanggalPendek(ymd) {
  const [y, m, d] = String(ymd).slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)));
}

export function waktuRelatif(ts) {
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return tanggalPendek(new Date(ts).toISOString());
}

const LABEL_STATUS = {
  hadir: 'Hadir', terlambat: 'Terlambat', tidak_hadir: 'Tidak hadir', izin: 'Izin',
  belum_hadir: 'Belum hadir', belum_mulai: 'Nanti', buka: 'Buka', nanti: 'Nanti', selesai: 'Selesai',
  menunggu: 'Menunggu', disetujui: 'Disetujui', ditolak: 'Ditolak', cek: 'Perlu dicek',
};
export function lencana(status, teks) {
  return `<span class="lencana l-${h(status)}">${h(teks ?? LABEL_STATUS[status] ?? status)}</span>`;
}

export const LABEL_TANDA = {
  di_luar_radius: 'Di luar radius',
  sampel_kurang: 'Data GPS terlalu sedikit',
  koordinat_identik: 'Koordinat diam sempurna',
  akurasi_tidak_wajar: 'Akurasi GPS tidak wajar',
  lompatan_lokasi: 'Lokasi melompat jauh',
  titik_berulang: 'Titik sama persis dengan hari lain',
};
export const teksTanda = (arr) => (arr || []).map((t) => LABEL_TANDA[t] || t).join(', ');

export function toast(pesan, lama = 3200) {
  const el = document.getElementById('toast');
  el.textContent = pesan;
  el.classList.add('tampil');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('tampil'), lama);
}

export function salah(el, err) {
  console.error(err);
  el.innerHTML = `<div class="info salah"><div><b>Terjadi kesalahan</b>${h(err?.message || err)}</div></div>`;
}

const IKON = {
  jadwal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  riwayat: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  izin: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  setuju: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
  ubah: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  laporan: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  jurnal: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M9 9h6M9 13h6"/>',
  lokasi: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  akun: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M17 11h5M19.5 8.5v5"/>',
  atur: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  lonceng: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  kembali: '<path d="M15 5l-7 7 7 7"/>',
  lainnya: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  unduh: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
};
export function ikon(nama, ukuran = 22) {
  return `<svg width="${ukuran}" height="${ukuran}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IKON[nama] || ''}</svg>`;
}

// CSV sederhana (mendukung tanda kutip)
export function bacaCSV(teks) {
  const baris = []; let kol = []; let sel = ''; let kutip = false;
  for (let i = 0; i < teks.length; i++) {
    const c = teks[i];
    if (kutip) {
      if (c === '"' && teks[i + 1] === '"') { sel += '"'; i++; }
      else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"') kutip = true;
    else if (c === ',' || c === ';') { kol.push(sel); sel = ''; }
    else if (c === '\n') { kol.push(sel); baris.push(kol); kol = []; sel = ''; }
    else if (c !== '\r') sel += c;
  }
  if (sel || kol.length) { kol.push(sel); baris.push(kol); }
  const kepala = (baris.shift() || []).map((k) => k.trim().toLowerCase());
  return baris.filter((b) => b.some((x) => x.trim())).map((b) => Object.fromEntries(kepala.map((k, i) => [k, (b[i] ?? '').trim()])));
}

export function jarakMeter(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * rad) / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Baca GPS selama `detik` detik; panggil onSampel tiap ada pembacaan baru
export function bacaGPS(detik, onSampel) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Browser ini tidak mendukung GPS'));
    const sampel = []; const opsi = { enableHighAccuracy: true, maximumAge: 0, timeout: (detik + 15) * 1000 };
    let selesai = false;
    // sebagian HP hanya mengirim posisi baru saat bergerak, jadi selain "watch" juga diminta tiap detik
    const terima = (p) => {
      if (selesai || sampel.some((x) => x.t === p.timestamp)) return; // abaikan pembacaan yang sama (dari cache)
      const s = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: p.timestamp };
      sampel.push(s); onSampel?.(s, sampel);
    };
    const gagal = (e) => {
      if (selesai || (e.code !== 1 && sampel.length)) return;
      selesai = true; navigator.geolocation.clearWatch(id); clearInterval(tiap);
      reject(new Error(e.code === 1 ? 'Izin lokasi ditolak. Aktifkan izin lokasi untuk situs ini di pengaturan browser.'
        : 'GPS tidak terbaca. Pastikan GPS/lokasi HP menyala.'));
    };
    const id = navigator.geolocation.watchPosition(terima, gagal, opsi);
    let menunggu = false; // jangan menumpuk permintaan
    const tiap = setInterval(() => {
      const terakhir = sampel[sampel.length - 1];
      if (menunggu || !terakhir || Date.now() - terakhir.t < 900) return;
      menunggu = true;
      navigator.geolocation.getCurrentPosition((p) => { menunggu = false; terima(p); }, () => { menunggu = false; },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 1500 });
    }, 1000);
    setTimeout(() => {
      if (selesai) return;
      selesai = true; navigator.geolocation.clearWatch(id); clearInterval(tiap); resolve(sampel);
    }, detik * 1000);
  });
}

export function unduhFile(nama, isi, tipe) {
  const url = URL.createObjectURL(new Blob([isi], { type: tipe }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nama });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Jendela isian sederhana. Mengembalikan objek {nama_isian: nilai} atau null bila dibatalkan.
export function dialog(judul, isiHTML, teksOk = 'Simpan') {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'dialog';
    d.innerHTML = `<form method="dialog" class="form"><h2 style="font-size:17px">${h(judul)}</h2>${isiHTML}
      <div class="baris" style="justify-content:flex-end"><button value="batal" class="tombol garis" formnovalidate>Batal</button>
      <button value="ok" class="tombol">${h(teksOk)}</button></div></form>`;
    document.body.append(d);
    d.addEventListener('close', () => {
      const ok = d.returnValue === 'ok';
      const data = ok ? Object.fromEntries(new FormData(d.querySelector('form'))) : null;
      d.remove(); resolve(data);
    });
    d.showModal();
  });
}
