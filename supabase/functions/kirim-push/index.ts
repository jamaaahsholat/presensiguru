// Mengirim notifikasi browser (Web Push) setiap ada baris baru di tabel `notifikasi`.
// Dipanggil oleh Database Webhook Supabase (lihat README.md, langkah 7).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

Deno.serve(async (req) => {
  // hanya webhook dari database kita yang boleh memanggil fungsi ini
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  const body = await req.json();
  const n = body.record;
  if (!n?.user_id) return new Response('abaikan', { status: 200 });

  const { data: langganan, error } = await sb.from('push_langganan').select('id, endpoint, p256dh, auth').eq('user_id', n.user_id);
  if (error) return new Response(error.message, { status: 500 });

  const muatan = JSON.stringify({ judul: n.judul, isi: n.isi, tautan: n.tautan, tag: `notif-${n.id}` });
  let terkirim = 0;
  await Promise.all((langganan ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, muatan, { TTL: 60 * 60 * 12 });
      terkirim++;
    } catch (e) {
      // langganan kedaluwarsa / dicabut dari browser → hapus
      if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_langganan').delete().eq('id', s.id);
      else console.error('push gagal', e?.statusCode, e?.body);
    }
  }));
  return Response.json({ terkirim });
});
