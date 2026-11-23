import { sb, sesi, q, rpc } from '../api.js';
import { h, ikon, lencana, jamLokal, jamDariUTC, tanggalPanjang, tanggalPendek, hariIni, toast, teksTanda } from '../ui.js';
import { NAMA_MADRASAH } from '../config.js';

const satu = (x) => (Array.isArray(x) ? x[0] : x);
const LABEL = { hadir: 'Hadir', terlambat: 'Terlambat', tidak_hadir: 'Tidak hadir', izin: 'Izin', belum_hadir: 'Belum hadir', belum_mulai: 'Belum mulai' };

// ---------- ekspor ----------
async function keExcel(namaFile, lembar) {
  const XLSX = await import('https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs');
  const wb = XLSX.utils.book_new();
  for (const [nama, baris] of lembar) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(baris), nama.slice(0, 31));
  XLSX.writeFile(wb, namaFile);
}
async function kePDF(namaFile, judul, subjudul, kepala, isi, mendatar = true) {
  const { jsPDF } = await import('https://esm.sh/jspdf@2.5.2');
  const { default: autoTable } = await import('https://esm.sh/jspdf-autotable@3.8.4');
  const doc = new jsPDF({ orientation: mendatar ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  doc.setFontSize(14); doc.text(judul, 14, 15);
  doc.setFontSize(10); doc.text(subjudul, 14, 21);
  autoTable(doc, { head: [kepala], body: isi, startY: 26, styles: { fontSize: 8.5, cellPadding: 1.6 }, headStyles: { fillColor: [11, 94, 69] } });
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFontSize(8); doc.text(`${NAMA_MADRASAH} · halaman ${i}/${n}`, 14, doc.internal.pageSize.getHeight() - 6); }
  doc.save(namaFile);
}
function tombolEkspor() {
  return `<div class="baris bungkus"><button class="tombol kecil garis" data-ekspor="xlsx">${ikon('unduh', 18)} Excel</button>
    <button class="tombol kecil garis" data-ekspor="pdf">${ikon('unduh', 18)} PDF</button></div>`;
}
function pasangEkspor(el, fn) {
  el.querySelectorAll('[data-ekspor]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await fn(b.dataset.ekspor); } catch (e) { toast('Gagal mengekspor: ' + e.message, 5000); }
    b.disabled = false;
  }));
}

// ================== DASHBOARD ==================
export async function dashboard(el, param, tgl = hariIni(), saring = 'semua') {
  const [data, { count: jmlIzin }] = await Promise.all([
    rpc('laporan_harian', { p_tanggal: tgl }),
    sb.from('izin').select('id', { count: 'exact', head: true }).eq('status', 'menunggu'),
  ]);
  const n = (f) => data.filter(f).length;
  const kosong = data.filter((s) => s.status === 'belum_hadir');
  const cek = data.filter((s) => s.verifikasi === 'perlu_dicek');
  const sudah = data.filter((s) => s.status !== 'belum_mulai');

  const SARING = {
    semua: () => true,
    masalah: (s) => ['belum_hadir', 'tidak_hadir'].includes(s.status),
    cek: (s) => s.verifikasi === 'perlu_dicek',
    izin: (s) => s.status === 'izin',
  };
  const tampil = data.filter(SARING[saring]);

  el.innerHTML = `
    <div class="kartu"><div class="baris antara bungkus">
      <div class="isian"><label for="tgl">Tanggal</label><input id="tgl" type="date" value="${tgl}"></div>
      <div class="redup">${h(tanggalPanjang(tgl))} · ${data.length} sesi terjadwal${tgl === hariIni() ? ` · ${sudah.length} sudah dimulai` : ''}</div>
      ${tombolEkspor()}
    </div></div>
    <div class="grid-statistik">
      <div class="statistik"><span>Hadir</span><strong style="color:var(--hijau)">${n((s) => s.status === 'hadir')}</strong></div>
      <div class="statistik"><span>Terlambat</span><strong style="color:var(--kuning)">${n((s) => s.status === 'terlambat')}</strong></div>
      <div class="statistik"><span>Izin</span><strong style="color:var(--biru)">${n((s) => s.status === 'izin')}</strong></div>
      <div class="statistik"><span>Tidak / belum hadir</span><strong style="color:var(--merah)">${n((s) => ['tidak_hadir', 'belum_hadir'].includes(s.status))}</strong></div>
      <div class="statistik"><span>Perlu dicek</span><strong style="color:var(--kuning)">${cek.length}</strong></div>
    </div>
    <div class="dua-kolom">
      <section class="kartu lebar">
        <div class="baris antara bungkus"><h2 style="font-size:16px">Kehadiran per sesi</h2>
          <div class="isian"><label class="sr" for="saring">Saring</label><select id="saring">
            <option value="semua">Semua sesi</option><option value="masalah">Belum / tidak hadir</option>
            <option value="cek">Perlu dicek</option><option value="izin">Izin</option></select></div></div>
        <div class="tabel-bungkus"><table><thead><tr><th>Jam</th><th>Guru</th><th>Kelas · Mapel</th><th>Check-in</th><th>Status</th><th>Jurnal</th></tr></thead><tbody>
          ${tampil.map((s) => `<tr><td>${s.jam_mulai}${s.jam_selesai !== s.jam_mulai ? '–' + s.jam_selesai : ''}<div class="redup">${jamLokal(s.mulai)}</div></td>
            <td>${h(s.guru_nama)}${s.digantikan ? '<div class="redup">pengganti</div>' : ''}</td>
            <td>${h(s.kelas)} · ${h(s.mapel)}<div class="redup">${h(s.ruang_nama || '')}</div></td>
            <td>${s.waktu_checkin ? jamDariUTC(s.waktu_checkin) + (s.jarak_m != null ? `<div class="redup">${Math.round(s.jarak_m)} m</div>` : '') : '—'}</td>
            <td>${s.verifikasi === 'perlu_dicek' ? lencana('cek') : lencana(s.status)}</td>
            <td>${['hadir', 'terlambat'].includes(s.status) ? (s.ada_jurnal ? '✓' : '<span class="redup">belum</span>') : ''}</td></tr>`).join('')
            || '<tr><td colspan="6" class="redup">Tidak ada data.</td></tr>'}
        </tbody></table></div>
      </section>
      <aside class="sisi">
        <h2 class="judul-bagian">Perlu tindakan</h2>
        ${kosong.map((s) => `<div class="kartu bahaya" style="gap:4px">
          <span style="font-size:12px;font-weight:700;color:var(--merah)">KELAS KOSONG</span>
          <b>${h(s.kelas)} belum ada guru</b>
          <span class="redup">${h(s.guru_nama)} · ${h(s.mapel)} · jam ke-${s.jam_mulai} (${jamLokal(s.mulai)})</span>
          ${sesi.profil.peran === 'admin' ? '<a class="tombol kecil" href="#/perubahan">Catat guru pengganti</a>' : ''}</div>`).join('')}
        ${cek.length ? `<a class="kartu" href="#/persetujuan" style="text-decoration:none;color:inherit;gap:4px">
          <span style="font-size:12px;font-weight:700;color:var(--kuning)">PERLU DICEK</span>
          <b>${cek.length} check-in mencurigakan</b>
          <span class="redup">${cek.slice(0, 3).map((s) => h(s.guru_nama) + ' (' + h(teksTanda(s.tanda)) + ')').join('<br>')}</span></a>` : ''}
        ${jmlIzin ? `<a class="kartu" href="#/persetujuan" style="text-decoration:none;color:inherit;gap:4px">
          <span style="font-size:12px;font-weight:700;color:var(--biru)">IZIN MENUNGGU</span><b>${jmlIzin} pengajuan izin</b>
          <span class="redup">Ketuk untuk menyetujui atau menolak</span></a>` : ''}
        ${!kosong.length && !cek.length && !jmlIzin ? '<div class="info ok"><div>Tidak ada yang perlu ditindaklanjuti.</div></div>' : ''}
      </aside>
    </div>`;

  el.querySelector('#saring').value = saring;
  el.querySelector('#saring').addEventListener('change', (e) => dashboard(el, param, tgl, e.target.value));
  el.querySelector('#tgl').addEventListener('change', (e) => dashboard(el, param, e.target.value, saring));
  pasangEkspor(el, async (jenis) => {
    const kepala = ['Jam', 'Mulai', 'Guru', 'Kelas', 'Mapel', 'Ruang', 'Check-in', 'Jarak (m)', 'Status', 'Verifikasi', 'Jurnal'];
    const isi = data.map((s) => [`${s.jam_mulai}${s.jam_selesai !== s.jam_mulai ? '-' + s.jam_selesai : ''}`, jamLokal(s.mulai), s.guru_nama, s.kelas, s.mapel,
      s.ruang_nama || '', s.waktu_checkin ? jamDariUTC(s.waktu_checkin) : '', s.jarak_m != null ? Math.round(s.jarak_m) : '',
      LABEL[s.status] || s.status, s.verifikasi === 'perlu_dicek' ? 'Perlu dicek: ' + teksTanda(s.tanda) : (s.verifikasi || ''),
      ['hadir', 'terlambat'].includes(s.status) ? (s.ada_jurnal ? 'Ya' : 'Belum') : '']);
    if (jenis === 'xlsx') await keExcel(`kehadiran-${tgl}.xlsx`, [['Kehadiran ' + tgl, [kepala, ...isi]]]);
    else await kePDF(`kehadiran-${tgl}.pdf`, 'Laporan Kehadiran Guru', `${NAMA_MADRASAH} · ${tanggalPanjang(tgl)}`, kepala, isi);
  });

  if (tgl !== hariIni()) return;
  const timer = setInterval(() => dashboard(el, param, tgl, el.querySelector('#saring')?.value || saring).catch(console.warn), 60000);
  return () => clearInterval(timer);
}

// ================== REKAP BULANAN ==================
export async function rekap(el, param, bulan = hariIni().slice(0, 7)) {
  const [th, bl] = bulan.split('-').map(Number);
  const data = await rpc('rekap_bulanan', { p_tahun: th, p_bulan: bl });
  const persen = (r) => (r.terjadwal ? Math.round(((Number(r.hadir) + Number(r.terlambat) + Number(r.izin)) / r.terjadwal) * 100) : 0);
  const namaBulan = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(th, bl - 1, 1)));
  const tot = (k) => data.reduce((a, r) => a + Number(r[k]), 0);

  el.innerHTML = `
    <div class="kartu"><div class="baris antara bungkus">
      <div class="isian"><label for="bln">Bulan</label><input id="bln" type="month" value="${bulan}"></div>
      <div class="redup">${data.length} guru · ${tot('terjadwal')} sesi · rata-rata kehadiran ${tot('terjadwal') ? Math.round(((tot('hadir') + tot('terlambat') + tot('izin')) / tot('terjadwal')) * 100) : 0}%</div>
      ${tombolEkspor()}</div></div>
    <div class="kartu tabel-bungkus"><table><thead><tr><th>Guru</th><th class="angka">Sesi</th><th class="angka">Hadir</th><th class="angka">Terlambat</th>
      <th class="angka">Izin</th><th class="angka">Tidak hadir</th><th class="angka">Perlu dicek</th><th class="angka">Jurnal</th><th class="angka">Kehadiran</th></tr></thead><tbody>
      ${data.map((r) => { const p = persen(r); return `<tr><td>${h(r.guru_nama)}</td><td class="angka">${r.terjadwal}</td><td class="angka">${r.hadir}</td>
        <td class="angka">${r.terlambat}</td><td class="angka">${r.izin}</td>
        <td class="angka" ${r.tidak_hadir > 0 ? 'style="color:var(--merah);font-weight:700"' : ''}>${r.tidak_hadir}</td>
        <td class="angka">${r.perlu_dicek}</td><td class="angka">${r.jurnal_terisi}</td>
        <td class="angka" style="font-weight:700;${p < 90 ? 'color:var(--merah)' : ''}">${p}%</td></tr>`; }).join('')
        || '<tr><td colspan="9" class="redup">Belum ada data untuk bulan ini.</td></tr>'}
    </tbody></table>
    <p class="redup">Kehadiran = (hadir + terlambat + izin) ÷ sesi terjadwal. Sesi yang belum selesai tidak dihitung.</p></div>`;

  el.querySelector('#bln').addEventListener('change', (e) => e.target.value && rekap(el, param, e.target.value));
  pasangEkspor(el, async (jenis) => {
    const kepala = ['Guru', 'Sesi', 'Hadir', 'Terlambat', 'Izin', 'Tidak hadir', 'Perlu dicek', 'Jurnal terisi', 'Kehadiran (%)'];
    const isi = data.map((r) => [r.guru_nama, r.terjadwal, r.hadir, r.terlambat, r.izin, r.tidak_hadir, r.perlu_dicek, r.jurnal_terisi, persen(r)].map((x) => (typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : x)));
    if (jenis === 'xlsx') await keExcel(`rekap-kehadiran-${bulan}.xlsx`, [['Rekap ' + bulan, [kepala, ...isi]]]);
    else await kePDF(`rekap-kehadiran-${bulan}.pdf`, 'Rekap Kehadiran Guru', `${NAMA_MADRASAH} · ${namaBulan}`, kepala, isi);
  });
}

// ================== JURNAL PER KELAS ==================
export async function jurnalKelas(el, param, kelas = '', bulan = hariIni().slice(0, 7)) {
  const daftarKelas = await q(sb.from('kelas').select('nama').order('nama'));
  if (!kelas) kelas = daftarKelas[0]?.nama || '';
  const [th, bl] = bulan.split('-').map(Number);
  const akhir = new Date(Date.UTC(th, bl, 0)).toISOString().slice(0, 10);
  const data = kelas ? await q(sb.from('kehadiran')
    .select('tanggal, status, waktu_checkin, guru:guru_id(nama), jadwal:jadwal_id!inner(kelas, mapel, jam_mulai, jam_selesai), jurnal(*)')
    .eq('jadwal.kelas', kelas).gte('tanggal', `${bulan}-01`).lte('tanggal', akhir).in('status', ['hadir', 'terlambat'])
    .order('tanggal', { ascending: false })) : [];
  data.sort((a, b) => (a.tanggal === b.tanggal ? satu(a.jadwal).jam_mulai - satu(b.jadwal).jam_mulai : a.tanggal < b.tanggal ? 1 : -1));

  el.innerHTML = `
    <div class="kartu"><div class="baris bungkus" style="align-items:flex-end">
      <div class="isian"><label for="kls">Kelas</label><select id="kls">${daftarKelas.map((k) => `<option ${k.nama === kelas ? 'selected' : ''}>${h(k.nama)}</option>`).join('')}</select></div>
      <div class="isian"><label for="bln">Bulan</label><input id="bln" type="month" value="${bulan}"></div>
      <div class="tumbuh"></div>${tombolEkspor()}</div></div>
    <div class="kartu tabel-bungkus"><table><thead><tr><th>Tanggal</th><th>Jam</th><th>Mapel · Guru</th><th>Materi</th><th>Kegiatan</th><th class="angka">S/I/A</th></tr></thead><tbody>
      ${data.map((k) => { const j = satu(k.jurnal); const jd = satu(k.jadwal); return `<tr><td>${h(tanggalPendek(k.tanggal))}</td>
        <td>${jd.jam_mulai}${jd.jam_selesai !== jd.jam_mulai ? '–' + jd.jam_selesai : ''}</td>
        <td>${h(jd.mapel)}<div class="redup">${h(satu(k.guru)?.nama)}</div></td>
        <td>${j ? h(j.materi) : '<span class="redup">jurnal belum diisi</span>'}${j?.catatan ? `<div class="redup">${h(j.catatan)}</div>` : ''}</td>
        <td>${h(j?.kegiatan || '')}${j?.siswa_absen ? `<div class="redup">Tidak hadir: ${h(j.siswa_absen)}</div>` : ''}</td>
        <td class="angka">${j ? `${j.sakit}/${j.izin}/${j.alpa}` : ''}</td></tr>`; }).join('')
        || '<tr><td colspan="6" class="redup">Belum ada jurnal untuk kelas dan bulan ini.</td></tr>'}
    </tbody></table></div>`;

  el.querySelector('#kls').addEventListener('change', (e) => jurnalKelas(el, param, e.target.value, bulan));
  el.querySelector('#bln').addEventListener('change', (e) => e.target.value && jurnalKelas(el, param, kelas, e.target.value));
  pasangEkspor(el, async (jenis) => {
    const kepala = ['Tanggal', 'Jam', 'Mapel', 'Guru', 'Materi', 'Kegiatan', 'Sakit', 'Izin', 'Alpa', 'Siswa tidak hadir', 'Catatan'];
    const isi = data.map((k) => { const j = satu(k.jurnal) || {}; const jd = satu(k.jadwal);
      return [k.tanggal, `${jd.jam_mulai}${jd.jam_selesai !== jd.jam_mulai ? '-' + jd.jam_selesai : ''}`, jd.mapel, satu(k.guru)?.nama,
        j.materi || '(belum diisi)', j.kegiatan || '', j.sakit ?? '', j.izin ?? '', j.alpa ?? '', j.siswa_absen || '', j.catatan || '']; });
    if (jenis === 'xlsx') await keExcel(`jurnal-${kelas}-${bulan}.xlsx`, [[`Jurnal ${kelas}`, [kepala, ...isi]]]);
    else await kePDF(`jurnal-${kelas}-${bulan}.pdf`, `Jurnal Mengajar Kelas ${kelas}`, `${NAMA_MADRASAH} · ${bulan}`, kepala, isi);
  });
}
