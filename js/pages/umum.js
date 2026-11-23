import { sb, sesi, q, keluar, aktifkanPush, statusPush } from '../api.js';
import { h, ikon, toast, waktuRelatif } from '../ui.js';
import { MENU, perbaruiLonceng } from '../app.js';

export async function notifikasi(el) {
  const data = await q(sb.from('notifikasi').select('*').order('dibuat_at', { ascending: false }).limit(60));
  const adaBaru = data.some((n) => !n.dibaca);
  el.innerHTML = `
    ${adaBaru ? '<button class="tombol garis kecil" id="semua" style="align-self:flex-end">Tandai semua dibaca</button>' : ''}
    ${data.length ? data.map((n) => `<a class="notif ${n.dibaca ? '' : 'baru'}" href="${h(n.tautan || '#/notifikasi')}" data-id="${n.id}">
        <b>${h(n.judul)}</b><span>${h(n.isi)}</span><span class="redup">${h(waktuRelatif(n.dibuat_at))}</span></a>`).join('')
      : '<div class="info netral"><div>Belum ada notifikasi.</div></div>'}`;

  el.querySelectorAll('[data-id]').forEach((a) => a.addEventListener('click', () => {
    sb.from('notifikasi').update({ dibaca: true }).eq('id', Number(a.dataset.id)).then(() => perbaruiLonceng());
  }));
  el.querySelector('#semua')?.addEventListener('click', async () => {
    await q(sb.from('notifikasi').update({ dibaca: true }).eq('dibaca', false).eq('user_id', sesi.user.id));
    perbaruiLonceng(); notifikasi(el);
  });
}

export async function profil(el) {
  const st = await statusPush();
  const ketPush = {
    aktif: '<div class="info ok"><div><b>Notifikasi aktif</b>Anda akan menerima pemberitahuan di HP ini.</div></div>',
    belum: '<div class="info awas"><div><b>Notifikasi belum aktif</b>Aktifkan agar tidak ketinggalan info izin, persetujuan, dan kelas kosong.</div></div>',
    ditolak: '<div class="info salah"><div><b>Notifikasi diblokir</b>Buka pengaturan situs di browser, izinkan notifikasi, lalu muat ulang halaman.</div></div>',
    tidak_didukung: '<div class="info awas"><div><b>Notifikasi belum bisa dipakai di sini</b>Di iPhone: buka di Safari → tombol Bagikan → Tambahkan ke Layar Utama, lalu buka dari ikon tersebut.</div></div>',
  }[st];

  el.innerHTML = `
    <div class="kartu" style="gap:2px"><b style="font-size:17px">${h(sesi.profil.nama)}</b><span class="redup">Username: ${h(sesi.profil.username)}</span></div>
    <div class="kartu">${ketPush}${st === 'belum' ? `<button class="tombol" id="push">${ikon('lonceng', 20)} Aktifkan notifikasi</button>` : ''}</div>
    <form class="kartu form" id="f-sandi"><h2 style="font-size:16px">Ganti kata sandi</h2>
      <div class="isian"><label for="s1">Kata sandi baru</label><input id="s1" type="password" minlength="6" autocomplete="new-password" required></div>
      <div class="isian"><label for="s2">Ulangi kata sandi baru</label><input id="s2" type="password" minlength="6" autocomplete="new-password" required></div>
      <button class="tombol garis">Simpan kata sandi</button></form>
    <div class="kartu"><b>Pasang di layar utama HP</b>
      <span class="redup">Android (Chrome): menu ⋮ → Tambahkan ke layar utama. iPhone (Safari): tombol Bagikan → Tambahkan ke Layar Utama.</span></div>
    <button class="tombol bahaya" id="keluar">Keluar</button>`;

  el.querySelector('#push')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await aktifkanPush(); toast('Notifikasi aktif'); profil(el); }
    catch (err) { e.target.disabled = false; toast(err.message, 6000); }
  });
  el.querySelector('#f-sandi').addEventListener('submit', async (e) => {
    e.preventDefault();
    const s1 = el.querySelector('#s1').value;
    if (s1 !== el.querySelector('#s2').value) return toast('Kata sandi tidak sama');
    try { await q(sb.auth.updateUser({ password: s1 })); toast('Kata sandi diganti'); e.target.reset(); }
    catch (err) { toast(err.message, 5000); }
  });
  el.querySelector('#keluar').addEventListener('click', async () => { await keluar(); location.hash = ''; location.reload(); });
}

// daftar semua menu (untuk tombol "Lainnya" di HP)
export async function menu(el) {
  el.innerHTML = MENU[sesi.profil.peran].map(([r, l, i]) =>
    `<a class="sesi" href="#/${r}">${ikon(i)}<div class="tumbuh" style="font-weight:700">${h(l)}</div></a>`).join('');
}
