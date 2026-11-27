import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL_DOMAIN, VAPID_PUBLIC_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const sesi = { user: null, profil: null, pengaturan: {} };

// jalankan query Supabase dan lempar error berbahasa manusia
export async function q(janji) {
  const { data, error } = await janji;
  if (error) throw new Error(terjemahError(error.message));
  return data;
}
export const rpc = (nama, arg) => q(sb.rpc(nama, arg));

function terjemahError(m) {
  if (/Invalid login credentials/i.test(m)) return 'Username atau kata sandi salah';
  if (/JWT expired/i.test(m)) return 'Sesi login habis, silakan login ulang';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Tidak ada koneksi internet';
  if (/row-level security/i.test(m)) return 'Anda tidak punya akses untuk tindakan ini';
  if (/foreign key constraint/i.test(m)) return 'Data ini masih dipakai oleh jadwal atau catatan kehadiran, jadi tidak bisa dihapus. Ubah atau nonaktifkan saja.';
  if (/duplicate key/i.test(m)) return 'Nama ini sudah ada';
  return m;
}

export const emailDari = (username) => `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export async function masuk(username, sandi) {
  await q(sb.auth.signInWithPassword({ email: emailDari(username), password: sandi }));
  return muatProfil();
}

export async function keluar() {
  try { await hapusLanggananPush(); } catch (e) { console.warn(e); }
  await sb.auth.signOut();
  sesi.user = sesi.profil = null;
}

export async function muatProfil() {
  const { data: { user } } = await sb.auth.getUser();
  sesi.user = user;
  if (!user) { sesi.profil = null; return null; }
  sesi.profil = await q(sb.from('pengguna').select('username, nama, peran, guru_id').eq('user_id', user.id).maybeSingle());
  if (!sesi.profil) throw new Error('Akun ini belum didaftarkan sebagai pengguna aplikasi. Hubungi admin.');
  const atur = await q(sb.from('pengaturan').select('kunci, nilai'));
  sesi.pengaturan = Object.fromEntries(atur.map((r) => [r.kunci, r.nilai]));
  return sesi.profil;
}

export const atur = (kunci, bawaan) => sesi.pengaturan[kunci] ?? bawaan;

export async function jumlahNotifBaru() {
  const { count } = await sb.from('notifikasi').select('id', { count: 'exact', head: true }).eq('dibaca', false);
  return count || 0;
}

// ---------- Notifikasi browser (Web Push) ----------
export const pushDidukung = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function kunciVapid() {
  const pad = '='.repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4);
  const b64 = (VAPID_PUBLIC_KEY + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function aktifkanPush() {
  if (!pushDidukung()) throw new Error('Browser ini belum mendukung notifikasi. Di iPhone, tambahkan aplikasi ke Layar Utama terlebih dahulu.');
  const izin = await Notification.requestPermission();
  if (izin !== 'granted') throw new Error('Izin notifikasi tidak diberikan');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: kunciVapid() }));
  const j = sub.toJSON();
  await q(sb.from('push_langganan').upsert(
    { user_id: sesi.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth },
    { onConflict: 'endpoint' }));
}

export async function statusPush() {
  if (!pushDidukung()) return 'tidak_didukung';
  if (Notification.permission === 'denied') return 'ditolak';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub && Notification.permission === 'granted' ? 'aktif' : 'belum';
}

async function hapusLanggananPush() {
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) {
    await sb.from('push_langganan').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
}
