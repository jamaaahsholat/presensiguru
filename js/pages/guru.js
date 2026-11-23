import { sb, sesi, q, rpc, atur } from '../api.js';
import { h, ikon, lencana, jamLokal, jamDariUTC, tanggalPanjang, tanggalPendek, hariIni, toast, salah, teksTanda, bacaGPS, jarakMeter } from '../ui.js';

// waktu WIB sekarang, format sama dengan kolom timestamp dari database ("YYYY-MM-DDTHH:MM:SS")
function sekarangWIB() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
const geser = (ts, menit) => {
  const d = new Date(ts.replace(' ', 'T') + 'Z'); d.setUTCMinutes(d.getUTCMinutes() + menit);
  return d.toISOString().slice(0, 19);
};
const norm = (ts) => String(ts || '').replace(' ', 'T').slice(0, 19);

function keadaan(s) {
  const now = sekarangWIB(), buka = Number(atur('buka_checkin_menit', 10));
  if (s.kehadiran_id) {
    if (s.verifikasi === 'perlu_dicek') return 'cek';
    return s.status;
  }
  if (s.izin) return 'izin';
  if (!s.mulai) return 'nanti';
  if (now < geser(norm(s.mulai), -buka)) return 'nanti';
  if (now <= norm(s.selesai)) return 'buka';
  return 'tidak_hadir';
}

function kartuSesi(s, k) {
  const jam = s.jam_mulai === s.jam_selesai ? s.jam_mulai : `${s.jam_mulai}–${s.jam_selesai}`;
  let ket = `${jamLokal(s.mulai)}–${jamLokal(s.selesai)}`;
  if (s.waktu_checkin) ket += ` · check-in ${jamDariUTC(s.waktu_checkin)}`;
  if (s.kehadiran_id && ['hadir', 'terlambat'].includes(s.status)) ket += s.ada_jurnal ? ' · jurnal terisi' : ' · jurnal belum diisi';
  if (s.digantikan) ket += ' · sebagai guru pengganti';
  const href = k === 'buka' ? `#/checkin/${s.jadwal_id}`
    : (s.kehadiran_id && ['hadir', 'terlambat'].includes(s.status)) ? `#/jurnal/${s.kehadiran_id}` : null;
  const tag = href ? 'a' : 'div';
  return `<${tag} class="sesi ${k === 'buka' ? 'aktif' : ''}" ${href ? `href="${href}"` : ''}>
    <div class="jam"><span>Jam</span><b>${h(jam)}</b></div>
    <div class="tumbuh"><div style="font-weight:700">${h(s.kelas)} · ${h(s.mapel)}</div><div class="redup">${h(ket)}</div></div>
    ${lencana(k)}</${tag}>`;
}

export async function beranda(el) {
  const t = hariIni();
  const data = await rpc('jadwal_saya', { p_tanggal: t });
  const daftar = data.map((s) => ({ s, k: keadaan(s) }));
  const sorot = daftar.find((x) => x.k === 'buka') || daftar.find((x) => x.k === 'nanti');
  const jurnalKosong = daftar.find((x) => x.s.kehadiran_id && ['hadir', 'terlambat'].includes(x.s.status) && !x.s.ada_jurnal);

  el.innerHTML = `
    <div class="kartu" style="gap:2px"><div style="font-weight:700;font-size:17px">Assalamu'alaikum, ${h(sesi.profil.nama)}</div>
      <div class="redup">${h(tanggalPanjang(t))}</div></div>
    ${sorot ? `<div class="kartu sorot">
      <div class="baris antara">${sorot.k === 'buka' ? lencana('buka', 'Check-in dibuka') : lencana('nanti', 'Berikutnya')}
        <span class="redup">Jam ke-${h(sorot.s.jam_mulai)}${sorot.s.jam_selesai !== sorot.s.jam_mulai ? '–' + h(sorot.s.jam_selesai) : ''}</span></div>
      <div><div style="font-size:26px;font-weight:800">${h(sorot.s.kelas)}</div>
        <div class="redup" style="font-size:15px">${h(sorot.s.mapel)} · ${jamLokal(sorot.s.mulai)}–${jamLokal(sorot.s.selesai)} · ${h(sorot.s.ruang_nama || '-')}</div></div>
      ${sorot.k === 'buka' ? `<a class="tombol besar" href="#/checkin/${sorot.s.jadwal_id}">${ikon('lokasi', 20)} Check-in di ${h(sorot.s.kelas)}</a>`
        : `<p class="redup" style="margin:0">Check-in dibuka ${h(atur('buka_checkin_menit', 10))} menit sebelum jam dimulai.</p>`}
    </div>` : ''}
    ${jurnalKosong ? `<a class="info awas" href="#/jurnal/${jurnalKosong.s.kehadiran_id}" style="text-decoration:none">
      ${ikon('jurnal')}<div><b>Jurnal ${h(jurnalKosong.s.kelas)} belum diisi</b>Ketuk untuk melengkapi.</div></a>` : ''}
    <h2 class="judul-bagian">Jadwal hari ini</h2>
    ${daftar.length ? daftar.map((x) => kartuSesi(x.s, x.k)).join('')
      : '<div class="info netral"><div><b>Tidak ada jadwal mengajar hari ini</b></div></div>'}
    <p class="redup" style="margin:2px">Jadwal sudah termasuk perubahan hari ini dari waka kurikulum.</p>`;

  const timer = setInterval(() => beranda(el).catch((e) => console.warn(e)), 60000);
  return () => clearInterval(timer);
}

// ------------------------------------------------------------------
export async function checkin(el, { id }) {
  const jadwalId = Number(id);
  const daftar = await rpc('jadwal_saya', { p_tanggal: hariIni() });
  const s = daftar.find((x) => x.jadwal_id === jadwalId);
  if (!s) throw new Error('Sesi ini tidak ada di jadwal Anda hari ini.');
  if (s.kehadiran_id) { location.replace(`#/jurnal/${s.kehadiran_id}`); return; }
  const r = s.ruang_id ? await q(sb.from('ruang').select('nama, lat, lng, radius_m').eq('id', s.ruang_id).single()) : null;
  const durasi = Number(atur('durasi_gps_detik', 5));

  el.innerHTML = `
    <div class="kartu"><div class="baris antara">
      <div><div style="font-size:24px;font-weight:800">${h(s.kelas)}</div><div class="redup">${h(s.mapel)} · Jam ke-${h(s.jam_mulai)}</div></div>
      <div style="text-align:right"><div style="font-weight:700">${jamLokal(s.mulai)}–${jamLokal(s.selesai)}</div><div class="redup">Ruang ${h(r?.nama || '-')}</div></div>
    </div></div>
    <div id="gps-area"></div>`;
  const area = el.querySelector('#gps-area');

  if (!r || r.lat == null) {
    area.innerHTML = `<div class="info awas"><div><b>Titik lokasi ruang belum diatur</b>Hubungi admin/waka kurikulum untuk mengatur titik ruang ${h(r?.nama || s.kelas)}.</div></div>`;
    return;
  }

  let sampel = [], selesai = false, batal = false;
  area.innerHTML = `
    <div class="peta" id="peta"></div>
    <div class="kartu" style="gap:8px">
      <div class="baris antara"><b id="gps-judul">Membaca lokasi…</b><span class="redup" id="gps-detik"></span></div>
      <div class="progres"><div id="gps-bar"></div></div>
      <div class="redup" id="gps-ket">Tetap di dalam kelas selama ${durasi} detik.</div>
    </div>
    <div id="gps-hasil"></div>
    <button class="tombol besar" id="btn-checkin" disabled>Check-in sekarang</button>
    <button class="tombol garis" id="btn-ulang" hidden>Baca ulang lokasi</button>
    <p class="redup" style="text-align:center;margin:0">Di luar radius? Check-in tetap tercatat dan menunggu persetujuan admin/waka kurikulum.</p>`;

  const $ = (x) => area.querySelector(x);
  const gambarPeta = (lat, lng, acc) => {
    const skala = 70 / Math.max(r.radius_m, 1); // radius ruang = 70 px
    const W = 320, H = 220, cx = W / 2, cy = H / 2;
    let titik = '';
    if (lat != null) {
      const dy = (lat - r.lat) * 111320, dx = (lng - r.lng) * 111320 * Math.cos(r.lat * Math.PI / 180);
      const px = Math.max(10, Math.min(W - 10, cx + dx * skala)), py = Math.max(10, Math.min(H - 10, cy - dy * skala));
      titik = `<circle cx="${px}" cy="${py}" r="${Math.min(90, Math.max(8, acc * skala))}" fill="#1D6FD6" fill-opacity=".15"/>
               <circle cx="${px}" cy="${py}" r="8" fill="#1D6FD6" stroke="#fff" stroke-width="3"/>`;
    }
    $('#peta').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Posisi Anda terhadap titik ruang">
      <circle cx="${cx}" cy="${cy}" r="70" fill="#0B5E45" fill-opacity=".12" stroke="#0B5E45" stroke-width="2" stroke-dasharray="6 5"/>
      <circle cx="${cx}" cy="${cy}" r="5" fill="#0B5E45"/>${titik}</svg>`;
  };
  gambarPeta(null);

  const baca = async () => {
    sampel = []; selesai = false;
    $('#btn-checkin').disabled = true; $('#btn-ulang').hidden = true; $('#gps-hasil').innerHTML = '';
    $('#gps-judul').textContent = 'Membaca lokasi…';
    const mulai = Date.now();
    const tik = setInterval(() => {
      const d = Math.min(durasi, (Date.now() - mulai) / 1000);
      $('#gps-bar').style.width = `${(d / durasi) * 100}%`;
      $('#gps-detik').textContent = `${Math.ceil(durasi - d)} detik`;
    }, 200);
    try {
      sampel = await bacaGPS(durasi, (x) => {
        if (batal) return;
        const j = jarakMeter(x.lat, x.lng, r.lat, r.lng);
        gambarPeta(x.lat, x.lng, x.acc);
        $('#gps-ket').textContent = `Jarak ${Math.round(j)} m dari titik · radius ${r.radius_m} m · akurasi ±${Math.round(x.acc)} m`;
      });
    } catch (e) {
      clearInterval(tik); if (batal) return;
      $('#gps-judul').textContent = 'Lokasi gagal dibaca';
      $('#gps-hasil').innerHTML = `<div class="info salah"><div>${h(e.message)}</div></div>`;
      $('#btn-ulang').hidden = false; return;
    }
    clearInterval(tik); if (batal) return;
    selesai = true;
    $('#gps-bar').style.width = '100%'; $('#gps-detik').textContent = '';
    if (!sampel.length) {
      $('#gps-judul').textContent = 'Lokasi belum terbaca';
      $('#gps-hasil').innerHTML = '<div class="info awas"><div>Coba dekati jendela lalu baca ulang.</div></div>';
      $('#btn-ulang').hidden = false; return;
    }
    const akhir = sampel[sampel.length - 1];
    const j = jarakMeter(akhir.lat, akhir.lng, r.lat, r.lng);
    const dalam = j <= r.radius_m + Math.min(akhir.acc, 10);
    $('#gps-judul').textContent = 'Lokasi terbaca';
    $('#gps-hasil').innerHTML = dalam
      ? `<div class="info ok">${ikon('setuju', 24)}<div><b>Dalam radius ruang ${h(r.nama)}</b>Jarak ${Math.round(j)} m · akurasi GPS ±${Math.round(akhir.acc)} m</div></div>`
      : `<div class="info awas"><div><b>Di luar radius (±${Math.round(j)} m)</b>Anda tetap bisa check-in, tetapi perlu disetujui admin. Coba baca ulang bila Anda sudah di dalam kelas.</div></div>`;
    if (akhir.acc > 30) $('#gps-hasil').insertAdjacentHTML('beforeend', '<div class="info awas" style="margin-top:8px"><div>Sinyal GPS lemah. Coba dekati jendela.</div></div>');
    $('#btn-checkin').disabled = false; $('#btn-ulang').hidden = false;
  };

  $('#btn-ulang').addEventListener('click', baca);
  $('#btn-checkin').addEventListener('click', async () => {
    if (!selesai || !sampel.length) return;
    const b = $('#btn-checkin'); b.disabled = true; b.textContent = 'Menyimpan…';
    try {
      const k = await rpc('checkin', { p_jadwal_id: jadwalId, p_sampel: sampel.map((x) => ({ lat: x.lat, lng: x.lng, acc: x.acc, t: x.t })) });
      toast(k.verifikasi === 'perlu_dicek' ? 'Check-in tercatat, menunggu pemeriksaan admin.' : `Check-in berhasil · ${k.status === 'terlambat' ? 'terlambat' : 'tepat waktu'}`);
      location.hash = `#/jurnal/${k.id}`;
    } catch (e) {
      b.disabled = false; b.textContent = 'Check-in sekarang';
      $('#gps-hasil').innerHTML = `<div class="info salah"><div><b>Check-in gagal</b>${h(e.message)}</div></div>`;
    }
  });

  baca(); // GPS langsung dibaca begitu halaman dibuka
  return () => { batal = true; };
}

// ------------------------------------------------------------------
export async function jurnal(el, { id }) {
  const kid = Number(id);
  const k = await q(sb.from('kehadiran')
    .select('id, tanggal, status, verifikasi, waktu_checkin, tanda, jadwal:jadwal_id(kelas, mapel, jam_mulai, jam_selesai), jurnal(*)')
    .eq('id', kid).single());
  const j = Array.isArray(k.jurnal) ? k.jurnal[0] : k.jurnal;
  const bisaUbah = k.tanggal === hariIni() && ['hadir', 'terlambat'].includes(k.status);

  el.innerHTML = `
    <div class="info ${k.verifikasi === 'perlu_dicek' ? 'awas' : 'ok'}">${ikon('setuju', 24)}<div>
      <b>Check-in ${jamDariUTC(k.waktu_checkin)} · ${k.status === 'terlambat' ? 'terlambat' : 'tepat waktu'}</b>
      ${h(k.jadwal.kelas)} · ${h(k.jadwal.mapel)} · Jam ke-${h(k.jadwal.jam_mulai)}
      ${k.verifikasi === 'perlu_dicek' ? `<br>Menunggu pemeriksaan admin: ${h(teksTanda(k.tanda))}.` : ''}</div></div>
    <form class="kartu form" id="f-jurnal">
      <div class="isian"><label for="materi">Materi pokok</label>
        <input id="materi" required placeholder="mis. Teks editorial: struktur dan kebahasaan" value="${h(j?.materi)}"></div>
      <div class="isian"><label for="kegiatan">Kegiatan pembelajaran</label>
        <textarea id="kegiatan" placeholder="mis. Diskusi kelompok, presentasi">${h(j?.kegiatan)}</textarea></div>
      <fieldset class="isian" style="border:0;margin:0;padding:0"><legend class="label" style="margin-bottom:6px">Siswa tidak hadir</legend>
        <div class="tiga">
          <div class="isian"><label for="sakit" class="redup" style="font-weight:600">Sakit</label><input id="sakit" type="number" min="0" inputmode="numeric" value="${h(j?.sakit ?? 0)}"></div>
          <div class="isian"><label for="izinS" class="redup" style="font-weight:600">Izin</label><input id="izinS" type="number" min="0" inputmode="numeric" value="${h(j?.izin ?? 0)}"></div>
          <div class="isian"><label for="alpa" class="redup" style="font-weight:600">Alpa</label><input id="alpa" type="number" min="0" inputmode="numeric" value="${h(j?.alpa ?? 0)}"></div>
        </div>
        <input id="siswa" aria-label="Nama siswa yang tidak hadir" placeholder="Nama siswa (opsional)" value="${h(j?.siswa_absen)}" style="margin-top:8px">
      </fieldset>
      <div class="isian"><label for="catatan">Catatan <span class="redup" style="font-weight:400">(opsional)</span></label>
        <input id="catatan" placeholder="mis. Tugas dikumpulkan pekan depan" value="${h(j?.catatan)}"></div>
      ${bisaUbah ? '<button class="tombol besar" type="submit">Simpan jurnal</button><p class="redup" style="margin:0;text-align:center">Jurnal masih bisa dilengkapi sampai akhir hari ini.</p>'
        : '<div class="info netral"><div>Jurnal hanya bisa diubah pada hari yang sama.</div></div>'}
    </form>`;

  if (!bisaUbah) { el.querySelectorAll('input, textarea').forEach((x) => (x.disabled = true)); return; }
  el.querySelector('#f-jurnal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (x) => el.querySelector(x).value.trim();
    const b = e.target.querySelector('button'); b.disabled = true;
    try {
      await q(sb.from('jurnal').upsert({
        kehadiran_id: kid, materi: v('#materi'), kegiatan: v('#kegiatan') || null,
        sakit: Number(v('#sakit') || 0), izin: Number(v('#izinS') || 0), alpa: Number(v('#alpa') || 0),
        siswa_absen: v('#siswa') || null, catatan: v('#catatan') || null, diubah_at: new Date().toISOString(),
      }));
      toast('Jurnal tersimpan');
      location.hash = '#/beranda';
    } catch (err) { b.disabled = false; toast(err.message, 5000); }
  });
}

// ------------------------------------------------------------------
export async function riwayat(el) {
  const awal = hariIni(-45);
  const data = await q(sb.from('kehadiran')
    .select('id, tanggal, status, verifikasi, waktu_checkin, tanda, jadwal:jadwal_id(kelas, mapel, jam_mulai, jam_selesai), jurnal(kehadiran_id)')
    .eq('guru_id', sesi.profil.guru_id).gte('tanggal', awal)
    .order('tanggal', { ascending: false }).order('waktu_checkin', { ascending: false }));
  const bulan = hariIni().slice(0, 7);
  const ini = data.filter((x) => x.tanggal.startsWith(bulan));
  const hit = (s) => ini.filter((x) => x.status === s).length;

  el.innerHTML = `
    <div class="grid-statistik">
      <div class="statistik"><span>Hadir bulan ini</span><strong style="color:var(--hijau)">${hit('hadir')}</strong></div>
      <div class="statistik"><span>Terlambat</span><strong style="color:var(--kuning)">${hit('terlambat')}</strong></div>
      <div class="statistik"><span>Tidak hadir</span><strong style="color:var(--merah)">${hit('tidak_hadir')}</strong></div>
    </div>
    <h2 class="judul-bagian">45 hari terakhir</h2>
    ${data.length ? data.map((k) => {
      const st = k.verifikasi === 'perlu_dicek' ? 'cek' : k.status;
      const ada = (k.jurnal || []).length > 0 || (k.jurnal && !Array.isArray(k.jurnal));
      return `<div class="sesi"><div class="tumbuh">
        <div style="font-weight:700">${h(k.jadwal?.kelas)} · ${h(k.jadwal?.mapel)}</div>
        <div class="redup">${h(tanggalPendek(k.tanggal))} · jam ke-${h(k.jadwal?.jam_mulai)}${k.waktu_checkin ? ' · ' + jamDariUTC(k.waktu_checkin) : ''}${['hadir', 'terlambat'].includes(k.status) ? (ada ? ' · jurnal ✓' : ' · tanpa jurnal') : ''}
        ${k.verifikasi === 'ditolak' ? ' · check-in ditolak admin' : ''}</div></div>${lencana(st)}</div>`;
    }).join('') : '<div class="info netral"><div>Belum ada riwayat.</div></div>'}`;
}

// ------------------------------------------------------------------
export async function izin(el) {
  const data = await q(sb.from('izin').select('*').eq('guru_id', sesi.profil.guru_id).order('dibuat_at', { ascending: false }).limit(30));
  const t = hariIni();
  el.innerHTML = `
    <form class="kartu form" id="f-izin">
      <h2 style="font-size:16px">Ajukan izin</h2>
      <div class="isian"><label for="jenis">Jenis</label>
        <select id="jenis"><option value="sakit">Sakit</option><option value="dinas">Dinas luar</option>
          <option value="keluarga">Keperluan keluarga</option><option value="lainnya">Lainnya</option></select></div>
      <div class="baris">
        <div class="isian tumbuh"><label for="mulai">Mulai</label><input id="mulai" type="date" value="${t}" required></div>
        <div class="isian tumbuh"><label for="sampai">Sampai</label><input id="sampai" type="date" value="${t}" required></div>
      </div>
      <div class="isian"><label for="alasan">Keterangan</label><textarea id="alasan" required placeholder="mis. Demam, ada surat dokter"></textarea></div>
      <button class="tombol besar" type="submit">Kirim pengajuan</button>
      <p class="redup" style="margin:0">Pengajuan dikirim ke waka kurikulum dan kepala madrasah. Salah satu dari mereka yang akan memutuskan.</p>
    </form>
    <h2 class="judul-bagian">Pengajuan saya</h2>
    ${data.length ? data.map((i) => `<div class="kartu" style="gap:4px">
        <div class="baris antara"><b>${h(i.jenis[0].toUpperCase() + i.jenis.slice(1))}</b>${lencana(i.status)}</div>
        <div class="redup">${h(tanggalPendek(i.tanggal_mulai))}${i.tanggal_selesai !== i.tanggal_mulai ? ' – ' + h(tanggalPendek(i.tanggal_selesai)) : ''} · ${h(i.alasan)}</div>
        ${i.status !== 'menunggu' ? `<div class="redup">Diputuskan oleh ${i.diputus_peran === 'kepala' ? 'Kepala Madrasah' : 'Waka Kurikulum'}${i.catatan_putusan ? ': ' + h(i.catatan_putusan) : ''}</div>` : ''}
      </div>`).join('') : '<div class="info netral"><div>Belum ada pengajuan.</div></div>'}`;

  el.querySelector('#f-izin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (x) => el.querySelector(x).value;
    if (v('#sampai') < v('#mulai')) return toast('Tanggal "sampai" tidak boleh sebelum tanggal mulai');
    const b = e.target.querySelector('button'); b.disabled = true;
    try {
      await rpc('ajukan_izin', { p_mulai: v('#mulai'), p_selesai: v('#sampai'), p_jenis: v('#jenis'), p_alasan: v('#alasan').trim() });
      toast('Pengajuan izin terkirim');
      izin(el);
    } catch (err) { b.disabled = false; toast(err.message, 5000); }
  });
}
