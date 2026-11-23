import { sb, sesi, masuk, muatProfil, jumlahNotifBaru, statusPush } from './api.js';
import { h, ikon, salah, toast } from './ui.js';
import { NAMA_MADRASAH } from './config.js';
import * as umum from './pages/umum.js';
import * as guru from './pages/guru.js';
import * as kelola from './pages/kelola.js';
import * as laporan from './pages/laporan.js';

const G = ['guru'], A = ['admin'], P = ['admin', 'kepala'], S = ['guru', 'admin', 'kepala'];

// rute: pola → { judul, peran, tampil }
const RUTE = [
  ['beranda', { judul: 'Jadwal hari ini', peran: G, tampil: guru.beranda }],
  ['checkin/:id', { judul: 'Check-in kelas', peran: G, tampil: guru.checkin, kembali: '#/beranda' }],
  ['jurnal/:id', { judul: 'Jurnal mengajar', peran: G, tampil: guru.jurnal, kembali: '#/beranda' }],
  ['riwayat', { judul: 'Riwayat kehadiran', peran: G, tampil: guru.riwayat }],
  ['izin', { judul: 'Izin', peran: G, tampil: guru.izin }],
  ['dashboard', { judul: 'Dashboard kehadiran', peran: P, tampil: laporan.dashboard }],
  ['persetujuan', { judul: 'Persetujuan', peran: P, tampil: kelola.persetujuan }],
  ['perubahan', { judul: 'Perubahan harian', peran: A, tampil: kelola.perubahan }],
  ['laporan', { judul: 'Rekap bulanan', peran: P, tampil: laporan.rekap }],
  ['jurnal-kelas', { judul: 'Jurnal per kelas', peran: P, tampil: laporan.jurnalKelas }],
  ['ruang', { judul: 'Titik lokasi ruang', peran: A, tampil: kelola.ruang }],
  ['jadwal', { judul: 'Jadwal & jam pelajaran', peran: A, tampil: kelola.jadwal }],
  ['akun', { judul: 'Akun pengguna', peran: A, tampil: kelola.akun }],
  ['pengaturan', { judul: 'Pengaturan', peran: A, tampil: kelola.pengaturan }],
  ['notifikasi', { judul: 'Notifikasi', peran: S, tampil: umum.notifikasi }],
  ['profil', { judul: 'Profil', peran: S, tampil: umum.profil }],
  ['menu', { judul: 'Menu', peran: P, tampil: umum.menu }],
];

export const MENU = {
  guru: [['beranda', 'Jadwal', 'jadwal'], ['riwayat', 'Riwayat', 'riwayat'], ['izin', 'Izin', 'izin'], ['profil', 'Profil', 'profil']],
  admin: [['dashboard', 'Dashboard', 'dashboard'], ['persetujuan', 'Persetujuan', 'setuju'], ['perubahan', 'Perubahan harian', 'ubah'],
    ['laporan', 'Rekap bulanan', 'laporan'], ['jurnal-kelas', 'Jurnal per kelas', 'jurnal'], ['ruang', 'Titik ruang', 'lokasi'],
    ['jadwal', 'Jadwal & jam', 'jadwal'], ['akun', 'Akun pengguna', 'akun'], ['pengaturan', 'Pengaturan', 'atur'], ['profil', 'Profil', 'profil']],
  kepala: [['dashboard', 'Dashboard', 'dashboard'], ['persetujuan', 'Persetujuan', 'setuju'], ['laporan', 'Rekap bulanan', 'laporan'],
    ['jurnal-kelas', 'Jurnal per kelas', 'jurnal'], ['profil', 'Profil', 'profil']],
};
const MENU_BAWAH = {
  guru: MENU.guru,
  admin: [['dashboard', 'Dashboard', 'dashboard'], ['persetujuan', 'Persetujuan', 'setuju'], ['perubahan', 'Perubahan', 'ubah'], ['menu', 'Lainnya', 'lainnya']],
  kepala: [['dashboard', 'Dashboard', 'dashboard'], ['persetujuan', 'Persetujuan', 'setuju'], ['laporan', 'Rekap', 'laporan'], ['menu', 'Lainnya', 'lainnya']],
};
const BERANDA = { guru: '#/beranda', admin: '#/dashboard', kepala: '#/dashboard' };
const NAMA_PERAN = { guru: 'Guru', admin: 'Admin · Waka Kurikulum', kepala: 'Kepala Madrasah' };

const app = document.getElementById('app');
let bersihkan = null; // fungsi pembersih halaman sebelumnya (timer, GPS)

function cocok(hash) {
  const bagian = hash.replace(/^#\/?/, '').split('/');
  for (const [pola, rute] of RUTE) {
    const p = pola.split('/');
    if (p.length !== bagian.length) continue;
    const param = {};
    if (p.every((x, i) => (x.startsWith(':') ? ((param[x.slice(1)] = decodeURIComponent(bagian[i])), true) : x === bagian[i])))
      return { rute, param, nama: p[0] };
  }
  return null;
}

async function render() {
  if (bersihkan) { try { bersihkan(); } catch (e) { console.warn(e); } bersihkan = null; }
  if (!sesi.profil) return tampilLogin();
  const peran = sesi.profil.peran;
  const m = cocok(location.hash);
  if (!m || !m.rute.peran.includes(peran)) { location.replace(BERANDA[peran]); return; }

  const menuSamping = MENU[peran].map(([r, l, i]) =>
    `<a href="#/${r}" class="${r === m.nama ? 'aktif' : ''}">${ikon(i, 20)}${h(l)}</a>`).join('');
  const menuBawah = MENU_BAWAH[peran].map(([r, l, i]) =>
    `<a href="#/${r}" class="${r === m.nama ? 'aktif' : ''}">${ikon(i)}${h(l)}</a>`).join('');
  const kembali = m.rute.kembali
    ? `<a href="${m.rute.kembali}" class="lonceng" aria-label="Kembali">${ikon('kembali')}</a>` : '';

  app.className = peran === 'guru' ? '' : 'ada-samping';
  app.innerHTML = `
    <header class="atas"><div class="atas-isi">
      <div class="baris">${kembali}<div><small>${h(NAMA_MADRASAH)} · ${h(NAMA_PERAN[peran])}</small><h1>${h(m.rute.judul)}</h1></div></div>
      <a href="#/notifikasi" class="lonceng" aria-label="Notifikasi">${ikon('lonceng')}<span class="titik" id="jml-notif" hidden></span></a>
    </div></header>
    <div class="${peran === 'guru' ? '' : 'bingkai'}">
      ${peran === 'guru' ? '' : `<nav class="menu-samping" aria-label="Menu utama">${menuSamping}</nav>`}
      <main class="utama ${peran === 'guru' ? 'sempit' : ''}" id="isi"><div class="memuat">Memuat…</div></main>
    </div>
    <nav class="menu-bawah" aria-label="Menu">${menuBawah}</nav>`;

  perbaruiLonceng();
  const isi = document.getElementById('isi');
  try {
    const hasil = await m.rute.tampil(isi, m.param);
    if (typeof hasil === 'function') bersihkan = hasil;
  } catch (e) { salah(isi, e); }
}

export async function perbaruiLonceng() {
  try {
    const n = await jumlahNotifBaru();
    const el = document.getElementById('jml-notif');
    if (el) { el.hidden = n === 0; el.textContent = n > 99 ? '99+' : n; }
  } catch (e) { console.warn(e); }
}

function tampilLogin(pesan = '') {
  app.className = '';
  app.innerHTML = `
    <div class="login"><form class="kartu form" id="f-login">
      <div><small class="redup" style="font-weight:700;letter-spacing:.04em">${h(NAMA_MADRASAH.toUpperCase())}</small>
        <h1 style="font-size:22px;margin-top:4px">Presensi & Jurnal Guru</h1></div>
      ${pesan ? `<div class="info salah"><div>${h(pesan)}</div></div>` : ''}
      <div class="isian"><label for="u">Username</label><input id="u" autocomplete="username" autocapitalize="none" required></div>
      <div class="isian"><label for="p">Kata sandi</label><input id="p" type="password" autocomplete="current-password" required></div>
      <button class="tombol besar" type="submit">Masuk</button>
      <p class="redup" style="margin:0">Lupa kata sandi? Hubungi admin/waka kurikulum untuk mengatur ulang.</p>
    </form></div>`;
  document.getElementById('f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Memproses…';
    try {
      await masuk(document.getElementById('u').value, document.getElementById('p').value);
      location.hash = BERANDA[sesi.profil.peran];
      await render();
      tawarkanNotifikasi();
    } catch (err) { tampilLogin(err.message); }
  });
}

// setelah login, ingatkan untuk mengaktifkan notifikasi bila belum
async function tawarkanNotifikasi() {
  if ((await statusPush()) === 'belum') toast('Aktifkan notifikasi di menu Profil agar tidak ketinggalan info penting.', 6000);
}

// mulai
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
window.addEventListener('hashchange', render);
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { sesi.profil = null; render(); } });
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.jenis === 'push') perbaruiLonceng(); });

(async () => {
  try {
    await muatProfil();
  } catch (e) {
    await sb.auth.signOut().catch(() => {});
    return tampilLogin(e.message);
  }
  if (sesi.profil && !location.hash) location.replace(BERANDA[sesi.profil.peran]);
  render();
})();

export { render, BERANDA };
