import { sb, sesi, q, rpc, atur, muatProfil } from '../api.js';
import { h, ikon, lencana, jamLokal, jamDariUTC, tanggalPendek, tanggalPanjang, hariIni, toast, teksTanda, bacaGPS, bacaCSV, unduhFile } from '../ui.js';

const HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const isAdmin = () => sesi.profil.peran === 'admin';
const satu = (x) => (Array.isArray(x) ? x[0] : x);

// ================== PERSETUJUAN ==================
export async function persetujuan(el) {
  const [izinMenunggu, izinBaru, cek] = await Promise.all([
    q(sb.from('izin').select('*, guru:guru_id(nama)').eq('status', 'menunggu').order('dibuat_at')),
    q(sb.from('izin').select('*, guru:guru_id(nama)').neq('status', 'menunggu').order('diputus_at', { ascending: false }).limit(10)),
    q(sb.from('kehadiran').select('id, tanggal, status, waktu_checkin, jarak_m, akurasi_m, tanda, guru:guru_id(nama), jadwal:jadwal_id(kelas, mapel, jam_mulai), ruang:ruang_id(nama, radius_m)')
      .eq('verifikasi', 'perlu_dicek').order('tanggal', { ascending: false }).limit(100)),
  ]);

  el.innerHTML = `
    <h2 class="judul-bagian">Pengajuan izin (${izinMenunggu.length})</h2>
    ${izinMenunggu.length ? izinMenunggu.map((i) => `<div class="kartu" data-izin="${i.id}">
        <div class="baris antara bungkus"><b>${h(satu(i.guru)?.nama)}</b>${lencana('menunggu')}</div>
        <div>${h(i.jenis[0].toUpperCase() + i.jenis.slice(1))} · ${h(tanggalPendek(i.tanggal_mulai))}${i.tanggal_selesai !== i.tanggal_mulai ? ' – ' + h(tanggalPendek(i.tanggal_selesai)) : ''}</div>
        <div class="redup">${h(i.alasan)}</div>
        <div class="isian"><label class="sr" for="cat-${i.id}">Catatan</label><input id="cat-${i.id}" placeholder="Catatan untuk guru (opsional)"></div>
        <div class="baris bungkus"><button class="tombol kecil" data-aksi="setuju">Setujui</button><button class="tombol kecil garis" data-aksi="tolak">Tolak</button></div>
      </div>`).join('') : '<div class="info netral"><div>Tidak ada pengajuan izin yang menunggu.</div></div>'}

    <h2 class="judul-bagian">Check-in perlu dicek (${cek.length})</h2>
    ${!isAdmin() && cek.length ? '<p class="redup" style="margin:0 2px">Persetujuan check-in dilakukan oleh admin/waka kurikulum.</p>' : ''}
    ${cek.length ? cek.map((k) => `<div class="kartu" data-cek="${k.id}">
        <div class="baris antara bungkus"><b>${h(satu(k.guru)?.nama)} · ${h(satu(k.jadwal)?.kelas)}</b>${lencana('cek')}</div>
        <div class="redup">${h(tanggalPendek(k.tanggal))} · jam ke-${h(satu(k.jadwal)?.jam_mulai)} · check-in ${jamDariUTC(k.waktu_checkin)} · ${h(satu(k.jadwal)?.mapel)}</div>
        <div>Jarak ${h(Math.round(k.jarak_m ?? 0))} m dari titik ${h(satu(k.ruang)?.nama)} (radius ${h(satu(k.ruang)?.radius_m)} m) · akurasi ±${h(Math.round(k.akurasi_m ?? 0))} m</div>
        <div class="info awas" style="padding:10px 12px"><div><b>Alasan:</b> ${h(teksTanda(k.tanda))}</div></div>
        ${isAdmin() ? `<div class="baris bungkus"><button class="tombol kecil" data-aksi="sah">Setujui (sah hadir)</button>
          <button class="tombol kecil garis" data-aksi="tidak">Tolak (tidak hadir)</button></div>` : ''}
      </div>`).join('') : '<div class="info netral"><div>Tidak ada check-in yang perlu dicek.</div></div>'}

    <h2 class="judul-bagian">Izin yang sudah diputuskan</h2>
    <div class="kartu tabel-bungkus"><table><thead><tr><th>Guru</th><th>Tanggal</th><th>Jenis</th><th>Status</th><th>Oleh</th></tr></thead><tbody>
      ${izinBaru.map((i) => `<tr><td>${h(satu(i.guru)?.nama)}</td><td>${h(tanggalPendek(i.tanggal_mulai))}</td><td>${h(i.jenis)}</td>
        <td>${lencana(i.status)}</td><td>${i.diputus_peran === 'kepala' ? 'Kepala Madrasah' : 'Waka Kurikulum'}</td></tr>`).join('') || '<tr><td colspan="5" class="redup">Belum ada.</td></tr>'}
    </tbody></table></div>`;

  el.querySelectorAll('[data-izin] button').forEach((b) => b.addEventListener('click', async () => {
    const kartu = b.closest('[data-izin]'); const id = Number(kartu.dataset.izin);
    kartu.querySelectorAll('button').forEach((x) => (x.disabled = true));
    try {
      await rpc('putuskan_izin', { p_id: id, p_setuju: b.dataset.aksi === 'setuju', p_catatan: kartu.querySelector('input').value.trim() || null });
      toast(b.dataset.aksi === 'setuju' ? 'Izin disetujui. Guru dan pengelola lain sudah diberi tahu.' : 'Izin ditolak');
    } catch (e) { toast(e.message, 5000); }
    persetujuan(el);
  }));
  el.querySelectorAll('[data-cek] button').forEach((b) => b.addEventListener('click', async () => {
    const id = Number(b.closest('[data-cek]').dataset.cek);
    try {
      await rpc('verifikasi_kehadiran', { p_id: id, p_setuju: b.dataset.aksi === 'sah' });
      toast('Tersimpan');
    } catch (e) { toast(e.message, 5000); }
    persetujuan(el);
  }));
}

// ================== PERUBAHAN HARIAN ==================
export async function perubahan(el, param, tgl = hariIni()) {
  const [sesiHari, daftar, guru, ruang] = await Promise.all([
    rpc('laporan_harian', { p_tanggal: tgl }),
    q(sb.from('perubahan').select('*, jadwal:jadwal_id(kelas, mapel, jam_mulai, jam_selesai, guru:guru_id(nama)), pengganti:guru_pengganti_id(nama), ruang:ruang_id(nama)')
      .eq('tanggal', tgl).order('id')),
    q(sb.from('guru').select('id, nama').eq('aktif', true).order('nama')),
    q(sb.from('ruang').select('id, nama').order('nama')),
  ]);
  const izinTanpaPengganti = sesiHari.filter((s) => s.status === 'izin' && !s.digantikan);
  const labelSesi = (s) => `Jam ${s.jam_mulai}${s.jam_selesai !== s.jam_mulai ? '–' + s.jam_selesai : ''} · ${s.kelas} · ${s.mapel} · ${s.guru_nama}`;
  const NAMA_JENIS = { pengganti: 'Guru pengganti', batal: 'Pelajaran ditiadakan', pindah_ruang: 'Pindah ruang', libur: 'Libur / kegiatan' };

  el.innerHTML = `
    <div class="kartu"><div class="baris bungkus">
      <div class="isian"><label for="tgl">Tanggal</label><input id="tgl" type="date" value="${tgl}"></div>
      <div class="redup" style="align-self:flex-end;padding-bottom:12px">${h(tanggalPanjang(tgl))} · ${sesiHari.length} sesi terjadwal</div>
    </div></div>
    ${izinTanpaPengganti.length ? `<div class="info awas"><div><b>${izinTanpaPengganti.length} sesi gurunya izin, belum ada pengganti</b>
      ${izinTanpaPengganti.map((s) => h(labelSesi(s))).join('<br>')}</div></div>` : ''}
    <form class="kartu form" id="f-ubah">
      <h2 style="font-size:16px">Tambah perubahan</h2>
      <div class="isian"><label for="jenis">Jenis</label><select id="jenis">
        ${Object.entries(NAMA_JENIS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="isian" id="b-sesi"><label for="sesi">Sesi</label><select id="sesi">
        ${sesiHari.map((s) => `<option value="${s.jadwal_id}">${h(labelSesi(s))}${s.status === 'izin' ? ' (izin)' : ''}</option>`).join('')}</select></div>
      <div class="isian" id="b-guru"><label for="guru">Guru pengganti</label><select id="guru">
        ${guru.map((g) => `<option value="${g.id}">${h(g.nama)}</option>`).join('')}</select></div>
      <div class="isian" id="b-ruang" hidden><label for="ruang">Pindah ke ruang</label><select id="ruang">
        ${ruang.map((r) => `<option value="${r.id}">${h(r.nama)}</option>`).join('')}</select></div>
      <div class="baris" id="b-jam" hidden>
        <div class="isian tumbuh"><label for="jm">Dari jam ke-</label><input id="jm" type="number" min="1" max="15" placeholder="kosong = sehari"></div>
        <div class="isian tumbuh"><label for="js">Sampai jam ke-</label><input id="js" type="number" min="1" max="15"></div>
      </div>
      <div class="isian"><label for="ket">Keterangan</label><input id="ket" placeholder="mis. Rapat dinas, PHBI, sakit"></div>
      <button class="tombol" type="submit">Simpan perubahan</button>
    </form>
    <h2 class="judul-bagian">Perubahan tanggal ini</h2>
    ${daftar.length ? daftar.map((p) => {
      const j = satu(p.jadwal);
      const isi = p.jenis === 'libur'
        ? (p.jam_mulai ? `Jam ke-${p.jam_mulai}–${p.jam_selesai}` : 'Sehari penuh')
        : `Jam ${j?.jam_mulai} · ${j?.kelas} · ${j?.mapel} · ${satu(j?.guru)?.nama}` +
          (p.jenis === 'pengganti' ? ` → ${satu(p.pengganti)?.nama}` : p.jenis === 'pindah_ruang' ? ` → ${satu(p.ruang)?.nama}` : '');
      return `<div class="kartu" style="gap:4px"><div class="baris antara"><b>${NAMA_JENIS[p.jenis]}</b>
        <button class="tombol kecil garis" data-hapus="${p.id}">Hapus</button></div>
        <div>${h(isi)}</div>${p.keterangan ? `<div class="redup">${h(p.keterangan)}</div>` : ''}</div>`;
    }).join('') : '<div class="info netral"><div>Belum ada perubahan.</div></div>'}`;

  const $ = (x) => el.querySelector(x);
  const atur_ = () => {
    const j = $('#jenis').value;
    $('#b-sesi').hidden = j === 'libur'; $('#b-guru').hidden = j !== 'pengganti';
    $('#b-ruang').hidden = j !== 'pindah_ruang'; $('#b-jam').hidden = j !== 'libur';
  };
  $('#jenis').addEventListener('change', atur_); atur_();
  $('#tgl').addEventListener('change', (e) => perubahan(el, param, e.target.value));
  $('#f-ubah').addEventListener('submit', async (e) => {
    e.preventDefault();
    const j = $('#jenis').value;
    const baris = { tanggal: tgl, jenis: j, keterangan: $('#ket').value.trim() || null, dibuat_oleh: sesi.user.id };
    if (j !== 'libur') { if (!$('#sesi').value) return toast('Pilih sesi terlebih dahulu'); baris.jadwal_id = Number($('#sesi').value); }
    if (j === 'pengganti') baris.guru_pengganti_id = Number($('#guru').value);
    if (j === 'pindah_ruang') baris.ruang_id = Number($('#ruang').value);
    if (j === 'libur' && $('#jm').value) { baris.jam_mulai = Number($('#jm').value); baris.jam_selesai = Number($('#js').value || $('#jm').value); }
    try { await q(sb.from('perubahan').insert(baris)); toast('Perubahan tersimpan'); perubahan(el, param, tgl); }
    catch (err) { toast(err.message, 5000); }
  });
  el.querySelectorAll('[data-hapus]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Hapus perubahan ini?')) return;
    try { await q(sb.from('perubahan').delete().eq('id', Number(b.dataset.hapus))); perubahan(el, param, tgl); }
    catch (err) { toast(err.message, 5000); }
  }));
}

// ================== TITIK RUANG ==================
export async function ruang(el) {
  const [daftar, aturan] = await Promise.all([
    q(sb.from('ruang').select('*').order('nama')),
    q(sb.from('aturan_ruang').select('id, mapel_mengandung, ruang:ruang_id(nama)')),
  ]);
  const siap = daftar.filter((r) => r.lat != null).length;
  const radiusAwal = Number(atur('radius_default_m', 8));

  el.innerHTML = `
    <div class="kartu form">
      <div><b>${siap} dari ${daftar.length} ruang sudah punya titik</b>
        <div class="redup">Berdiri di tengah ruangan, pilih ruangnya, lalu tekan Ambil titik. HP membaca GPS selama 30 detik dan memakai nilai tengahnya.</div></div>
      <div class="isian"><label for="r-pilih">Ruang</label><select id="r-pilih">
        ${daftar.map((r) => `<option value="${r.id}">${h(r.nama)}${r.lat != null ? ' ✓' : ''}</option>`).join('')}</select></div>
      <div class="baris">
        <div class="isian tumbuh"><label for="r-radius">Radius (meter)</label><input id="r-radius" type="number" min="3" max="500"></div>
        <button class="tombol garis" id="r-simpan-radius" style="align-self:flex-end">Simpan radius</button>
      </div>
      <div id="r-status" class="redup"></div>
      <div class="progres" hidden id="r-prog"><div id="r-bar"></div></div>
      <button class="tombol" id="r-ambil">${ikon('lokasi', 20)} Ambil titik di sini</button>
    </div>
    <div class="kartu tabel-bungkus"><table><thead><tr><th>Ruang</th><th>Titik</th><th class="angka">Radius</th><th>Diatur</th></tr></thead><tbody>
      ${daftar.map((r) => `<tr><td><b>${h(r.nama)}</b></td><td>${r.lat != null ? lencana('hadir', 'Tersimpan') : lencana('nanti', 'Belum ada')}</td>
        <td class="angka">${h(r.radius_m)} m</td><td class="redup">${r.diatur_at ? h(tanggalPendek(r.diatur_at)) : '—'}</td></tr>`).join('')}
    </tbody></table></div>
    <form class="kartu form" id="f-ruang-baru"><h2 style="font-size:16px">Tambah ruang lain</h2>
      <div class="baris bungkus"><div class="isian tumbuh"><label for="rb-nama">Nama ruang</label><input id="rb-nama" placeholder="mis. Lab Biologi" required></div>
      <div class="isian"><label for="rb-rad">Radius</label><input id="rb-rad" type="number" value="${radiusAwal}" min="3" max="500" style="width:100px"></div></div>
      <button class="tombol garis">Tambah ruang</button></form>
    <div class="kartu form"><h2 style="font-size:16px">Mapel yang selalu di ruang tertentu</h2>
      <div class="redup">Contoh: mapel yang mengandung kata "Penjasorkes" selalu check-in di Lapangan.</div>
      ${aturan.map((a) => `<div class="baris antara"><span>"${h(a.mapel_mengandung)}" → <b>${h(satu(a.ruang)?.nama)}</b></span>
        <button class="tombol kecil garis" data-hapus-aturan="${a.id}">Hapus</button></div>`).join('')}
      <form class="baris bungkus" id="f-aturan">
        <div class="isian tumbuh"><label for="a-mapel">Nama mapel mengandung</label><input id="a-mapel" required placeholder="mis. Biologi (P)"></div>
        <div class="isian tumbuh"><label for="a-ruang">Ruang</label><select id="a-ruang">${daftar.map((r) => `<option value="${r.id}">${h(r.nama)}</option>`).join('')}</select></div>
        <button class="tombol garis" style="align-self:flex-end">Tambah</button></form>
    </div>`;

  const $ = (x) => el.querySelector(x);
  const pilih = () => daftar.find((r) => r.id === Number($('#r-pilih').value));
  const tampil = () => {
    const r = pilih(); $('#r-radius').value = r.radius_m;
    $('#r-status').textContent = r.lat != null ? `Titik tersimpan (${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}). Mengambil ulang akan menimpanya.` : 'Belum ada titik.';
  };
  $('#r-pilih').addEventListener('change', tampil); tampil();

  let batal = false;
  $('#r-ambil').addEventListener('click', async () => {
    const r = pilih(); const b = $('#r-ambil'); b.disabled = true; $('#r-prog').hidden = false;
    const mulai = Date.now();
    const tik = setInterval(() => { $('#r-bar').style.width = `${Math.min(100, (Date.now() - mulai) / 300)}%`; }, 200);
    try {
      const s = await bacaGPS(30, (x, semua) => { $('#r-status').textContent = `Mengambil titik ${r.nama}… ${semua.length} pembacaan · akurasi ±${Math.round(x.acc)} m`; });
      clearInterval(tik); if (batal) return;
      if (!s.length) throw new Error('GPS tidak terbaca');
      const median = (a) => { const x = [...a].sort((p, q2) => p - q2); return x[Math.floor(x.length / 2)]; };
      const lat = median(s.map((x) => x.lat)), lng = median(s.map((x) => x.lng)), acc = median(s.map((x) => x.acc));
      if (acc > 25 && !confirm(`Akurasi GPS kurang baik (±${Math.round(acc)} m). Tetap simpan titik ini?`)) throw new Error('Dibatalkan. Coba lagi di dekat jendela.');
      await q(sb.from('ruang').update({ lat, lng, radius_m: Number($('#r-radius').value) || r.radius_m, diatur_at: new Date().toISOString() }).eq('id', r.id));
      toast(`Titik ${r.nama} tersimpan (akurasi ±${Math.round(acc)} m)`);
      ruang(el);
    } catch (e) {
      clearInterval(tik); b.disabled = false; $('#r-prog').hidden = true; $('#r-status').textContent = e.message;
    }
  });
  $('#r-simpan-radius').addEventListener('click', async () => {
    try { await q(sb.from('ruang').update({ radius_m: Number($('#r-radius').value) }).eq('id', pilih().id)); toast('Radius tersimpan'); ruang(el); }
    catch (e) { toast(e.message, 5000); }
  });
  $('#f-ruang-baru').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await q(sb.from('ruang').insert({ nama: $('#rb-nama').value.trim(), radius_m: Number($('#rb-rad').value) || radiusAwal })); toast('Ruang ditambahkan'); ruang(el); }
    catch (err) { toast(err.message, 5000); }
  });
  $('#f-aturan').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await q(sb.from('aturan_ruang').insert({ mapel_mengandung: $('#a-mapel').value.trim(), ruang_id: Number($('#a-ruang').value) })); ruang(el); }
    catch (err) { toast(err.message, 5000); }
  });
  el.querySelectorAll('[data-hapus-aturan]').forEach((b) => b.addEventListener('click', async () => {
    await q(sb.from('aturan_ruang').delete().eq('id', Number(b.dataset.hapusAturan))); ruang(el);
  }));
  return () => { batal = true; };
}

// ================== JADWAL & JAM PELAJARAN ==================
export async function jadwal(el) {
  const [versi, jam, guru] = await Promise.all([
    q(sb.from('jadwal_versi').select('*').order('berlaku_mulai', { ascending: false })),
    q(sb.from('jam_pelajaran').select('*').order('hari').order('jam_ke')),
    q(sb.from('guru').select('id, nama').order('nama')),
  ]);
  const aktif = versi.find((v) => v.berlaku_mulai <= hariIni());

  el.innerHTML = `
    <div class="kartu form"><h2 style="font-size:16px">Versi jadwal</h2>
      ${versi.length ? `<div class="tabel-bungkus"><table><thead><tr><th>Nama</th><th>Berlaku mulai</th><th></th></tr></thead><tbody>
        ${versi.map((v) => `<tr><td>${h(v.nama)}</td><td>${h(tanggalPendek(v.berlaku_mulai))}</td>
          <td>${v === aktif ? lencana('hadir', 'Berlaku sekarang') : v.berlaku_mulai > hariIni() ? lencana('menunggu', 'Akan berlaku') : lencana('nanti', 'Arsip')}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="info awas"><div>Belum ada jadwal. Impor dulu file CSV jadwal.</div></div>'}
    </div>
    <form class="kartu form" id="f-impor"><h2 style="font-size:16px">Impor jadwal baru</h2>
      <div class="redup">File CSV dengan kolom: <code>guru, hari, jam_mulai, jam_selesai, kelas, mapel</code>. Jadwal lama tetap tersimpan untuk laporan bulan-bulan sebelumnya.</div>
      <div class="isian"><label for="i-nama">Nama versi</label><input id="i-nama" required placeholder="mis. Semester Ganjil 2026/2027 revisi 2"></div>
      <div class="isian"><label for="i-tgl">Berlaku mulai</label><input id="i-tgl" type="date" required value="${hariIni(1)}"></div>
      <div class="isian"><label for="i-file">File CSV</label><input id="i-file" type="file" accept=".csv,text/csv" required></div>
      <div id="i-pratinjau" class="redup"></div>
      <button class="tombol">Impor jadwal</button>
    </form>
    <div class="kartu form"><h2 style="font-size:16px">Jam pelajaran</h2>
      <div class="isian"><label for="j-hari">Hari</label><select id="j-hari">${[1, 2, 3, 4, 5, 6].map((d) => `<option value="${d}">${HARI[d]}</option>`).join('')}</select></div>
      <div id="j-tabel"></div>
      <div class="baris bungkus"><button class="tombol garis" id="j-tambah">Tambah jam</button><button class="tombol" id="j-simpan">Simpan jam</button>
        <button class="tombol garis" id="j-salin">Salin ke Senin–Kamis</button></div>
    </div>
    <div class="kartu form"><h2 style="font-size:16px">Lihat jadwal guru</h2>
      <div class="isian"><label for="g-pilih">Guru</label><select id="g-pilih"><option value="">— pilih —</option>${guru.map((g) => `<option value="${g.id}">${h(g.nama)}</option>`).join('')}</select></div>
      <div id="g-jadwal"></div></div>`;

  const $ = (x) => el.querySelector(x);

  // --- impor
  let baris = [];
  $('#i-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    baris = bacaCSV(await f.text());
    const wajib = ['guru', 'hari', 'jam_mulai', 'jam_selesai', 'kelas', 'mapel'];
    const kurang = wajib.filter((k) => !(k in (baris[0] || {})));
    $('#i-pratinjau').innerHTML = kurang.length ? `<span style="color:var(--merah)">Kolom tidak ditemukan: ${h(kurang.join(', '))}</span>`
      : `${baris.length} baris · ${new Set(baris.map((b) => b.guru)).size} guru · ${new Set(baris.map((b) => b.kelas)).size} kelas`;
  });
  $('#f-impor').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!baris.length) return toast('Pilih file CSV terlebih dahulu');
    const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Mengimpor…';
    try {
      const n = await rpc('impor_jadwal', { p_nama: $('#i-nama').value.trim(), p_berlaku: $('#i-tgl').value,
        p_baris: baris.map((x) => ({ ...x, jam_mulai: Number(x.jam_mulai), jam_selesai: Number(x.jam_selesai) })) });
      toast(`${n} baris jadwal diimpor`); jadwal(el);
    } catch (err) { b.disabled = false; b.textContent = 'Impor jadwal'; toast(err.message, 6000); }
  });

  // --- jam pelajaran
  let baru = 0;
  const tabelJam = () => {
    const d = Number($('#j-hari').value);
    const rows = jam.filter((x) => x.hari === d);
    $('#j-tabel').innerHTML = `<div class="tabel-bungkus"><table><thead><tr><th>Jam ke-</th><th>Mulai</th><th>Selesai</th><th></th></tr></thead><tbody>
      ${rows.map((x) => `<tr data-jam="${x.jam_ke}"><td><b>${x.jam_ke}</b></td>
        <td><input type="time" value="${x.mulai.slice(0, 5)}" aria-label="Mulai jam ${x.jam_ke}" style="min-height:44px;border:1.5px solid var(--input);border-radius:8px;padding:0 8px"></td>
        <td><input type="time" value="${x.selesai.slice(0, 5)}" aria-label="Selesai jam ${x.jam_ke}" style="min-height:44px;border:1.5px solid var(--input);border-radius:8px;padding:0 8px"></td>
        <td><button class="tombol kecil garis" data-hapus-jam="${x.jam_ke}" type="button">Hapus</button></td></tr>`).join('')}
    </tbody></table></div>`;
    el.querySelectorAll('[data-hapus-jam]').forEach((b) => b.addEventListener('click', async () => {
      await q(sb.from('jam_pelajaran').delete().eq('hari', d).eq('jam_ke', Number(b.dataset.hapusJam)));
      jam.splice(jam.findIndex((x) => x.hari === d && x.jam_ke === Number(b.dataset.hapusJam)), 1); tabelJam();
    }));
  };
  const bacaTabel = () => [...el.querySelectorAll('[data-jam]')].map((tr) => {
    const [m, s] = tr.querySelectorAll('input'); return { jam_ke: Number(tr.dataset.jam), mulai: m.value, selesai: s.value };
  });
  $('#j-hari').addEventListener('change', tabelJam); tabelJam();
  $('#j-tambah').addEventListener('click', () => {
    const d = Number($('#j-hari').value); const maks = Math.max(0, ...jam.filter((x) => x.hari === d).map((x) => x.jam_ke));
    jam.push({ hari: d, jam_ke: maks + 1, mulai: '00:00', selesai: '00:00' }); baru++; tabelJam();
  });
  $('#j-simpan').addEventListener('click', async () => {
    const d = Number($('#j-hari').value);
    const data = bacaTabel().map((x) => ({ hari: d, ...x }));
    if (data.some((x) => x.selesai <= x.mulai)) return toast('Jam selesai harus setelah jam mulai');
    try { await q(sb.from('jam_pelajaran').upsert(data)); toast(`Jam pelajaran ${HARI[d]} tersimpan`); }
    catch (e) { toast(e.message, 5000); }
  });
  $('#j-salin').addEventListener('click', async () => {
    const data = bacaTabel();
    if (!confirm('Salin jam hari ini ke Senin, Selasa, Rabu, dan Kamis?')) return;
    try { await q(sb.from('jam_pelajaran').upsert([1, 2, 3, 4].flatMap((d) => data.map((x) => ({ hari: d, ...x }))))); toast('Disalin'); jadwal(el); }
    catch (e) { toast(e.message, 5000); }
  });

  // --- jadwal per guru
  $('#g-pilih').addEventListener('change', async (e) => {
    if (!e.target.value || !aktif) { $('#g-jadwal').innerHTML = aktif ? '' : '<div class="redup">Belum ada jadwal berlaku.</div>'; return; }
    const d = await q(sb.from('jadwal').select('hari, jam_mulai, jam_selesai, kelas, mapel').eq('versi_id', aktif.id)
      .eq('guru_id', Number(e.target.value)).order('hari').order('jam_mulai'));
    $('#g-jadwal').innerHTML = `<div class="tabel-bungkus"><table><thead><tr><th>Hari</th><th>Jam</th><th>Kelas</th><th>Mapel</th></tr></thead><tbody>
      ${d.map((x) => `<tr><td>${HARI[x.hari]}</td><td>${x.jam_mulai}${x.jam_selesai !== x.jam_mulai ? '–' + x.jam_selesai : ''}</td><td>${h(x.kelas)}</td><td>${h(x.mapel)}</td></tr>`).join('')}
    </tbody></table></div><p class="redup">${d.reduce((n, x) => n + x.jam_selesai - x.jam_mulai + 1, 0)} jam pelajaran per pekan</p>`;
  });
}

// ================== AKUN ==================
async function panggilAkun(body) {
  const { data, error } = await sb.functions.invoke('kelola-akun', { body });
  if (error) {
    let pesan = error.message;
    try { pesan = (await error.context.json()).error || pesan; } catch (_) { /* biarkan */ }
    throw new Error(pesan);
  }
  return data;
}

export async function akun(el) {
  const [pengguna, guru] = await Promise.all([
    q(sb.from('pengguna').select('user_id, username, nama, peran, guru_id').order('peran').order('nama')),
    q(sb.from('guru').select('id, nama, user_id, aktif').order('nama')),
  ]);
  const tanpaAkun = guru.filter((g) => !g.user_id && g.aktif);
  const NP = { guru: 'Guru', admin: 'Admin / Waka Kurikulum', kepala: 'Kepala Madrasah' };

  el.innerHTML = `
    <div class="kartu form"><h2 style="font-size:16px">Akun guru</h2>
      <div>${guru.length - tanpaAkun.length} dari ${guru.filter((g) => g.aktif).length} guru sudah punya akun.</div>
      ${tanpaAkun.length ? `<button class="tombol" id="a-massal">Buat akun untuk ${tanpaAkun.length} guru</button>
        <div class="redup">Username dan kata sandi awal akan ditampilkan sekali dan bisa diunduh untuk dibagikan ke guru.</div>` : ''}
      <div id="a-hasil"></div>
    </div>
    <form class="kartu form" id="f-pengelola"><h2 style="font-size:16px">Tambah admin / kepala madrasah</h2>
      <div class="baris bungkus">
        <div class="isian tumbuh"><label for="p-user">Username</label><input id="p-user" required pattern="[a-z0-9._-]+" placeholder="mis. kepala"></div>
        <div class="isian tumbuh"><label for="p-nama">Nama</label><input id="p-nama" required></div>
        <div class="isian tumbuh"><label for="p-peran">Peran</label><select id="p-peran"><option value="admin">Admin / Waka Kurikulum</option><option value="kepala">Kepala Madrasah</option></select></div>
      </div>
      <button class="tombol garis">Buat akun</button></form>
    <div class="kartu tabel-bungkus"><table><thead><tr><th>Nama</th><th>Username</th><th>Peran</th><th></th></tr></thead><tbody>
      ${pengguna.map((p) => `<tr><td>${h(p.nama)}</td><td><code>${h(p.username)}</code></td><td>${NP[p.peran]}</td>
        <td>${p.user_id !== sesi.user.id ? `<button class="tombol kecil garis" data-reset="${p.user_id}" data-nama="${h(p.nama)}">Atur ulang sandi</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>`;

  const $ = (x) => el.querySelector(x);
  const tampilHasil = (akunBaru) => {
    $('#a-hasil').innerHTML = `<div class="info awas"><div><b>Catat atau unduh sekarang.</b> Kata sandi tidak bisa dilihat lagi setelah halaman ini ditutup.</div></div>
      <div class="tabel-bungkus"><table><thead><tr><th>Nama</th><th>Username</th><th>Kata sandi awal</th></tr></thead><tbody>
      ${akunBaru.map((a) => `<tr><td>${h(a.nama)}</td><td><code>${h(a.username)}</code></td><td><code>${h(a.sandi)}</code></td></tr>`).join('')}</tbody></table></div>
      <button class="tombol garis" id="a-unduh">${ikon('unduh', 18)} Unduh daftar (CSV)</button>`;
    $('#a-unduh').addEventListener('click', () => unduhFile('akun-guru.csv',
      'nama,username,kata_sandi\n' + akunBaru.map((a) => `"${a.nama.replace(/"/g, '""')}",${a.username},${a.sandi}`).join('\n'), 'text/csv'));
  };
  $('#a-massal')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Membuat akun…';
    try { const r = await panggilAkun({ aksi: 'buat_guru' }); tampilHasil(r.akun); toast(`${r.akun.length} akun dibuat`); e.target.remove(); }
    catch (err) { e.target.disabled = false; e.target.textContent = 'Coba lagi'; toast(err.message, 6000); }
  });
  $('#f-pengelola').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await panggilAkun({ aksi: 'buat_pengelola', username: $('#p-user').value.trim(), nama: $('#p-nama').value.trim(), peran: $('#p-peran').value });
      tampilHasil([r.akun]); e.target.reset();
    } catch (err) { toast(err.message, 6000); }
  });
  el.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm(`Atur ulang kata sandi ${b.dataset.nama}?`)) return;
    try { const r = await panggilAkun({ aksi: 'reset_sandi', user_id: b.dataset.reset }); tampilHasil([r.akun]); window.scrollTo(0, 0); }
    catch (err) { toast(err.message, 6000); }
  }));
}

// ================== PENGATURAN ==================
export async function pengaturan(el) {
  const isian = [
    ['toleransi_terlambat_menit', 'Toleransi terlambat (menit)', 'Check-in setelah lewat menit ini dari jam mulai dihitung terlambat.'],
    ['buka_checkin_menit', 'Check-in dibuka sebelum jam mulai (menit)', ''],
    ['durasi_gps_detik', 'Lama pembacaan GPS saat check-in (detik)', 'Makin lama makin akurat mendeteksi GPS palsu.'],
    ['min_sampel_gps', 'Minimal jumlah pembacaan GPS', 'Kurang dari ini, check-in ditandai perlu dicek.'],
    ['radius_default_m', 'Radius bawaan ruang baru (meter)', ''],
  ];
  el.innerHTML = `<form class="kartu form" id="f-atur">
    ${isian.map(([k, l, ket]) => `<div class="isian"><label for="${k}">${l}</label>
      <input id="${k}" type="number" min="0" value="${h(atur(k, ''))}">${ket ? `<span class="redup">${ket}</span>` : ''}</div>`).join('')}
    <div class="isian"><label for="tanggal_mulai_sistem">Tanggal mulai aplikasi dipakai</label>
      <input id="tanggal_mulai_sistem" type="date" value="${h(atur('tanggal_mulai_sistem', ''))}">
      <span class="redup">Rekap tidak menghitung tanggal sebelum ini.</span></div>
    <button class="tombol">Simpan pengaturan</button></form>`;
  el.querySelector('#f-atur').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = isian.map(([k]) => ({ kunci: k, nilai: Number(el.querySelector('#' + k).value) }));
    data.push({ kunci: 'tanggal_mulai_sistem', nilai: el.querySelector('#tanggal_mulai_sistem').value });
    try { await q(sb.from('pengaturan').upsert(data)); await muatProfil(); toast('Pengaturan tersimpan'); }
    catch (err) { toast(err.message, 5000); }
  });
}
