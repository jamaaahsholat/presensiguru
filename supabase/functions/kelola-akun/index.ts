// Membuat akun guru secara massal, menambah admin/kepala, dan mengatur ulang kata sandi.
// Hanya bisa dipanggil oleh pengguna berperan admin.
import { createClient } from 'npm:@supabase/supabase-js@2';

const EMAIL_DOMAIN = 'presensi.local'; // harus sama dengan js/config.js
const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const jawab = (data: unknown, status = 200) => Response.json(data, { status, headers: CORS });

const GELAR = /^(dra?s?|dr|hj?|ir|kh|ust(adz|adzah)?|prof|ny)$/i;
function buatUsername(nama: string, terpakai: Set<string>) {
  const kata = nama.split(',')[0].split(/\s+/)
    .map((k) => k.replace(/\./g, ''))
    .filter((k) => k && !GELAR.test(k))
    .map((k) => k.toLowerCase().replace(/[^a-z]/g, ''))
    .filter((k) => k.length > 1);
  const dasar = (kata.slice(0, 2).join('.') || 'guru').slice(0, 30);
  let u = dasar, i = 2;
  while (terpakai.has(u)) u = `${dasar}${i++}`;
  terpakai.add(u);
  return u;
}
function buatSandi() {
  const huruf = 'abcdefghjkmnpqrstuvwxyz23456789';
  const acak = crypto.getRandomValues(new Uint32Array(8));
  return Array.from(acak, (n) => huruf[n % huruf.length]).join('');
}
async function buatUser(username: string, sandi: string) {
  const { data, error } = await admin.auth.admin.createUser({ email: `${username}@${EMAIL_DOMAIN}`, password: sandi, email_confirm: true });
  if (error) throw new Error(`${username}: ${error.message}`);
  return data.user.id;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    // siapa yang memanggil?
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? '';
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return jawab({ error: 'Silakan login ulang' }, 401);
    const { data: saya } = await admin.from('pengguna').select('peran').eq('user_id', user.id).maybeSingle();
    if (saya?.peran !== 'admin') return jawab({ error: 'Hanya admin/waka kurikulum' }, 403);

    const body = await req.json();
    const { data: semua } = await admin.from('pengguna').select('username');
    const terpakai = new Set((semua ?? []).map((p) => p.username));

    if (body.aksi === 'buat_guru') {
      const { data: guru, error } = await admin.from('guru').select('id, nama').is('user_id', null).eq('aktif', true).order('nama');
      if (error) throw error;
      const akun = [];
      for (const g of guru ?? []) {
        const username = buatUsername(g.nama, terpakai), sandi = buatSandi();
        const id = await buatUser(username, sandi);
        const { error: e1 } = await admin.from('pengguna').insert({ user_id: id, username, nama: g.nama, peran: 'guru', guru_id: g.id });
        if (e1) throw e1;
        await admin.from('guru').update({ user_id: id }).eq('id', g.id);
        akun.push({ nama: g.nama, username, sandi });
      }
      return jawab({ akun });
    }

    if (body.aksi === 'buat_pengelola') {
      const username = String(body.username ?? '').toLowerCase().trim();
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return jawab({ error: 'Username 3–30 huruf kecil/angka, boleh titik' }, 400);
      if (terpakai.has(username)) return jawab({ error: 'Username sudah dipakai' }, 400);
      if (!['admin', 'kepala'].includes(body.peran)) return jawab({ error: 'Peran tidak dikenal' }, 400);
      const sandi = buatSandi();
      const id = await buatUser(username, sandi);
      const { error } = await admin.from('pengguna').insert({ user_id: id, username, nama: String(body.nama).trim(), peran: body.peran });
      if (error) throw error;
      return jawab({ akun: { nama: body.nama, username, sandi } });
    }

    if (body.aksi === 'reset_sandi') {
      const { data: p } = await admin.from('pengguna').select('nama, username').eq('user_id', body.user_id).maybeSingle();
      if (!p) return jawab({ error: 'Pengguna tidak ditemukan' }, 404);
      const sandi = buatSandi();
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: sandi });
      if (error) throw error;
      return jawab({ akun: { nama: p.nama, username: p.username, sandi } });
    }

    return jawab({ error: 'Aksi tidak dikenal' }, 400);
  } catch (e) {
    console.error(e);
    return jawab({ error: (e as Error).message ?? String(e) }, 500);
  }
});
