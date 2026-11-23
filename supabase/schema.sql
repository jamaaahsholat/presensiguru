-- =====================================================================
--  Presensi & Jurnal Guru — MAN 1 Pasuruan
--  Jalankan seluruh file ini sekali di Supabase: SQL Editor → New query → Run
--  Zona waktu aplikasi: Asia/Jakarta (WIB)
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
--  Jenis data
-- ---------------------------------------------------------------------
do $$ begin
  create type peran as enum ('guru','admin','kepala');
exception when duplicate_object then null; end $$;
do $$ begin
  create type status_hadir as enum ('hadir','terlambat','tidak_hadir','izin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type status_verifikasi as enum ('ok','perlu_dicek','disetujui','ditolak');
exception when duplicate_object then null; end $$;
do $$ begin
  create type status_izin as enum ('menunggu','disetujui','ditolak');
exception when duplicate_object then null; end $$;
do $$ begin
  create type jenis_perubahan as enum ('pengganti','batal','pindah_ruang','libur');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
--  Tabel utama
-- ---------------------------------------------------------------------
create table if not exists guru (
  id        bigint generated always as identity primary key,
  nama      text not null unique,
  user_id   uuid unique references auth.users(id) on delete set null,
  aktif     boolean not null default true
);

create table if not exists pengguna (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  username  text not null unique,
  nama      text not null,
  peran     peran not null default 'guru',
  guru_id   bigint unique references guru(id) on delete set null,
  dibuat_at timestamptz not null default now()
);

create table if not exists ruang (
  id        bigint generated always as identity primary key,
  nama      text not null unique,
  lat       double precision,
  lng       double precision,
  radius_m  integer not null default 8 check (radius_m between 3 and 500),
  diatur_at timestamptz
);

-- ruang default untuk setiap kelas
create table if not exists kelas (
  nama      text primary key,
  ruang_id  bigint references ruang(id) on delete set null
);

-- mapel tertentu selalu di ruang tertentu (mis. Penjasorkes → Lapangan)
create table if not exists aturan_ruang (
  id        bigint generated always as identity primary key,
  mapel_mengandung text not null unique,
  ruang_id  bigint not null references ruang(id) on delete cascade
);

-- jam pelajaran per hari (1 = Senin … 6 = Sabtu)
create table if not exists jam_pelajaran (
  hari      smallint not null check (hari between 1 and 7),
  jam_ke    smallint not null check (jam_ke between 1 and 15),
  mulai     time not null,
  selesai   time not null check (selesai > mulai),
  primary key (hari, jam_ke)
);

create table if not exists jadwal_versi (
  id            bigint generated always as identity primary key,
  nama          text not null,
  berlaku_mulai date not null unique,
  dibuat_at     timestamptz not null default now()
);

create table if not exists jadwal (
  id          bigint generated always as identity primary key,
  versi_id    bigint not null references jadwal_versi(id) on delete cascade,
  guru_id     bigint not null references guru(id) on delete cascade,
  hari        smallint not null check (hari between 1 and 7),
  jam_mulai   smallint not null,
  jam_selesai smallint not null check (jam_selesai >= jam_mulai),
  kelas       text not null,
  mapel       text not null,
  ruang_id    bigint references ruang(id) on delete set null
);
create index if not exists jadwal_versi_hari on jadwal(versi_id, hari);
create index if not exists jadwal_guru on jadwal(guru_id);

-- perubahan sementara untuk satu tanggal
create table if not exists perubahan (
  id          bigint generated always as identity primary key,
  tanggal     date not null,
  jenis       jenis_perubahan not null,
  jadwal_id   bigint references jadwal(id) on delete cascade,  -- null untuk 'libur'
  guru_pengganti_id bigint references guru(id) on delete set null,
  ruang_id    bigint references ruang(id) on delete set null,
  jam_mulai   smallint,      -- untuk 'libur': rentang jam (null = sehari penuh)
  jam_selesai smallint,
  keterangan  text,
  dibuat_oleh uuid references auth.users(id) on delete set null,
  dibuat_at   timestamptz not null default now(),
  check (jenis = 'libur' or jadwal_id is not null),
  check (jenis <> 'pengganti' or guru_pengganti_id is not null),
  check (jenis <> 'pindah_ruang' or ruang_id is not null)
);
create index if not exists perubahan_tanggal on perubahan(tanggal);

create table if not exists izin (
  id              bigint generated always as identity primary key,
  guru_id         bigint not null references guru(id) on delete cascade,
  tanggal_mulai   date not null,
  tanggal_selesai date not null check (tanggal_selesai >= tanggal_mulai),
  jenis           text not null check (jenis in ('sakit','dinas','keluarga','lainnya')),
  alasan          text not null,
  status          status_izin not null default 'menunggu',
  diputus_oleh    uuid references auth.users(id) on delete set null,
  diputus_peran   peran,
  diputus_at      timestamptz,
  catatan_putusan text,
  dibuat_at       timestamptz not null default now()
);
create index if not exists izin_guru_tgl on izin(guru_id, tanggal_mulai, tanggal_selesai);

create table if not exists kehadiran (
  id            bigint generated always as identity primary key,
  tanggal       date not null,
  jadwal_id     bigint not null references jadwal(id) on delete cascade,
  guru_id       bigint not null references guru(id) on delete cascade,
  status        status_hadir not null,
  verifikasi    status_verifikasi not null default 'ok',
  waktu_checkin timestamptz,
  lat           double precision,
  lng           double precision,
  akurasi_m     double precision,
  jarak_m       double precision,
  ruang_id      bigint references ruang(id) on delete set null,
  tanda         text[] not null default '{}',
  sampel_gps    jsonb,
  diverifikasi_oleh uuid references auth.users(id) on delete set null,
  diverifikasi_at   timestamptz,
  unique (tanggal, jadwal_id, guru_id)
);
create index if not exists kehadiran_tgl on kehadiran(tanggal);
create index if not exists kehadiran_guru on kehadiran(guru_id, tanggal);

create table if not exists jurnal (
  kehadiran_id bigint primary key references kehadiran(id) on delete cascade,
  materi       text not null,
  kegiatan     text,
  sakit        smallint not null default 0 check (sakit >= 0),
  izin         smallint not null default 0 check (izin >= 0),
  alpa         smallint not null default 0 check (alpa >= 0),
  siswa_absen  text,
  catatan      text,
  diubah_at    timestamptz not null default now()
);

create table if not exists notifikasi (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  judul     text not null,
  isi       text not null,
  tautan    text,
  dibaca    boolean not null default false,
  dibuat_at timestamptz not null default now()
);
create index if not exists notifikasi_user on notifikasi(user_id, dibuat_at desc);

create table if not exists push_langganan (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users(id) on delete cascade,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  dibuat_at timestamptz not null default now()
);

create table if not exists pengaturan (
  kunci text primary key,
  nilai jsonb not null
);

-- peringatan "kelas kosong" yang sudah dikirim (agar tidak berulang)
create table if not exists peringatan_terkirim (
  tanggal   date not null,
  jadwal_id bigint not null references jadwal(id) on delete cascade,
  primary key (tanggal, jadwal_id)
);

-- ---------------------------------------------------------------------
--  Fungsi bantu
-- ---------------------------------------------------------------------

-- waktu sekarang dalam WIB (bisa ditimpa lewat setting app.now untuk uji coba)
create or replace function sekarang() returns timestamp language sql stable as $$
  select coalesce(nullif(current_setting('app.now', true), '')::timestamp,
                  (now() at time zone 'Asia/Jakarta'))
$$;

create or replace function atur(k text) returns jsonb language sql stable as $$
  select nilai from pengaturan where kunci = k
$$;

create or replace function peran_saya() returns peran
language sql stable security definer set search_path = public as $$
  select peran from pengguna where user_id = auth.uid()
$$;

create or replace function guru_saya() returns bigint
language sql stable security definer set search_path = public as $$
  select guru_id from pengguna where user_id = auth.uid()
$$;

create or replace function pengelola() returns boolean language sql stable as $$
  select coalesce(peran_saya() in ('admin','kepala'), false)
$$;

create or replace function is_admin() returns boolean language sql stable as $$
  select coalesce(peran_saya() = 'admin', false)
$$;

-- jarak dua titik (meter), rumus haversine
create or replace function jarak_meter(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- kirim notifikasi ke semua admin dan kepala madrasah (kecuali pengecualian)
create or replace function beri_tahu_pengelola(p_judul text, p_isi text, p_tautan text, p_kecuali uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into notifikasi(user_id, judul, isi, tautan)
  select user_id, p_judul, p_isi, p_tautan from pengguna
  where peran in ('admin','kepala') and user_id is distinct from p_kecuali
$$;

-- versi jadwal yang berlaku pada suatu tanggal
create or replace function versi_berlaku(p_tanggal date) returns bigint language sql stable as $$
  select id from jadwal_versi where berlaku_mulai <= p_tanggal order by berlaku_mulai desc limit 1
$$;

-- ---------------------------------------------------------------------
--  Jadwal final satu tanggal: jadwal tetap + perubahan harian + izin
-- ---------------------------------------------------------------------
create or replace function sesi_hari(p_tanggal date)
returns table (
  jadwal_id bigint, guru_id bigint, guru_nama text, guru_asli_id bigint,
  kelas text, mapel text, jam_mulai smallint, jam_selesai smallint,
  mulai timestamp, selesai timestamp,
  ruang_id bigint, ruang_nama text, digantikan boolean, izin_id bigint
)
language sql stable security definer set search_path = public as $$
  with j as (
    select j.* from jadwal j
    where j.versi_id = versi_berlaku(p_tanggal)
      and j.hari = extract(isodow from p_tanggal)::int
  ),
  hidup as (
    select j.* from j
    where not exists (select 1 from perubahan p where p.tanggal = p_tanggal and p.jenis = 'batal' and p.jadwal_id = j.id)
      and not exists (select 1 from perubahan p where p.tanggal = p_tanggal and p.jenis = 'libur'
                      and (p.jam_mulai is null or (j.jam_mulai <= p.jam_selesai and p.jam_mulai <= j.jam_selesai)))
  ),
  final as (
    select h.id as jadwal_id,
           coalesce(pg.guru_pengganti_id, h.guru_id) as guru_id,
           h.guru_id as guru_asli_id,
           h.kelas, h.mapel, h.jam_mulai, h.jam_selesai,
           coalesce(pr.ruang_id, h.ruang_id,
                    (select a.ruang_id from aturan_ruang a where h.mapel ilike '%' || a.mapel_mengandung || '%' limit 1),
                    (select k.ruang_id from kelas k where k.nama = h.kelas)) as ruang_id,
           pg.id is not null as digantikan
    from hidup h
    left join lateral (select * from perubahan p where p.tanggal = p_tanggal and p.jenis = 'pengganti'
                       and p.jadwal_id = h.id order by p.id desc limit 1) pg on true
    left join lateral (select * from perubahan p where p.tanggal = p_tanggal and p.jenis = 'pindah_ruang'
                       and p.jadwal_id = h.id order by p.id desc limit 1) pr on true
  )
  select f.jadwal_id, f.guru_id, g.nama, f.guru_asli_id, f.kelas, f.mapel, f.jam_mulai, f.jam_selesai,
         p_tanggal + jm.mulai, p_tanggal + js.selesai,
         f.ruang_id, r.nama, f.digantikan,
         (select i.id from izin i where i.guru_id = f.guru_id and i.status = 'disetujui'
            and p_tanggal between i.tanggal_mulai and i.tanggal_selesai limit 1)
  from final f
  join guru g on g.id = f.guru_id
  left join ruang r on r.id = f.ruang_id
  left join jam_pelajaran jm on jm.hari = extract(isodow from p_tanggal)::int and jm.jam_ke = f.jam_mulai
  left join jam_pelajaran js on js.hari = extract(isodow from p_tanggal)::int and js.jam_ke = f.jam_selesai
$$;

-- Rekap satu tanggal: setiap sesi + status kehadirannya (untuk dashboard)
create or replace function laporan_harian(p_tanggal date)
returns table (
  jadwal_id bigint, guru_id bigint, guru_nama text, kelas text, mapel text,
  jam_mulai smallint, jam_selesai smallint, mulai timestamp, selesai timestamp,
  ruang_nama text, digantikan boolean,
  kehadiran_id bigint, status text, verifikasi text, waktu_checkin timestamptz,
  jarak_m float8, akurasi_m float8, tanda text[], ada_jurnal boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not pengelola() then raise exception 'Hanya admin/waka kurikulum dan kepala madrasah'; end if;
  return query
  select s.jadwal_id, s.guru_id, s.guru_nama, s.kelas, s.mapel, s.jam_mulai, s.jam_selesai, s.mulai, s.selesai,
         s.ruang_nama, s.digantikan,
         k.id,
         case when k.id is not null then k.status::text
              when s.izin_id is not null then 'izin'
              when sekarang() > s.selesai then 'tidak_hadir'
              when sekarang() >= s.mulai then 'belum_hadir'
              else 'belum_mulai' end,
         k.verifikasi::text, k.waktu_checkin, k.jarak_m, k.akurasi_m, coalesce(k.tanda, '{}'),
         exists (select 1 from jurnal jr where jr.kehadiran_id = k.id)
  from sesi_hari(p_tanggal) s
  left join kehadiran k on k.tanggal = p_tanggal and k.jadwal_id = s.jadwal_id and k.guru_id = s.guru_id
  order by s.jam_mulai, s.guru_nama;
end $$;

-- Jadwal hari ini untuk guru yang login
create or replace function jadwal_saya(p_tanggal date default null)
returns table (
  jadwal_id bigint, kelas text, mapel text, jam_mulai smallint, jam_selesai smallint,
  mulai timestamp, selesai timestamp, ruang_id bigint, ruang_nama text,
  ruang_siap boolean, digantikan boolean, izin boolean,
  kehadiran_id bigint, status text, verifikasi text, waktu_checkin timestamptz, ada_jurnal boolean
)
language plpgsql stable security definer set search_path = public as $$
declare t date := coalesce(p_tanggal, sekarang()::date); g bigint := guru_saya();
begin
  if g is null then raise exception 'Akun ini belum terhubung ke data guru'; end if;
  return query
  select s.jadwal_id, s.kelas, s.mapel, s.jam_mulai, s.jam_selesai, s.mulai, s.selesai, s.ruang_id, s.ruang_nama,
         (r.lat is not null), s.digantikan, s.izin_id is not null,
         k.id, k.status::text, k.verifikasi::text, k.waktu_checkin,
         exists (select 1 from jurnal jr where jr.kehadiran_id = k.id)
  from sesi_hari(t) s
  left join ruang r on r.id = s.ruang_id
  left join kehadiran k on k.tanggal = t and k.jadwal_id = s.jadwal_id and k.guru_id = s.guru_id
  where s.guru_id = g
  order by s.jam_mulai;
end $$;

-- ---------------------------------------------------------------------
--  CHECK-IN: cek waktu, jarak ke titik ruang, dan pola GPS palsu
--  p_sampel: [{"lat":..,"lng":..,"acc":..,"t":epoch_ms}, ...] (±5 detik)
-- ---------------------------------------------------------------------
create or replace function checkin(p_jadwal_id bigint, p_sampel jsonb)
returns kehadiran
language plpgsql security definer set search_path = public as $$
declare
  g bigint := guru_saya();
  now_ timestamp := sekarang();
  t date := now_::date;
  s record; r ruang; hasil kehadiran;
  n int; lat_ float8; lng_ float8; acc_ float8; jarak float8;
  tanda text[] := '{}';
  buka int := coalesce((atur('buka_checkin_menit'))::int, 10);
  toleransi int := coalesce((atur('toleransi_terlambat_menit'))::int, 10);
  min_sampel int := coalesce((atur('min_sampel_gps'))::int, 3);
  st status_hadir; prev record; beda_lat float8; beda_lng float8;
begin
  if g is null then raise exception 'Akun ini belum terhubung ke data guru'; end if;

  select * into s from sesi_hari(t) x where x.jadwal_id = p_jadwal_id and x.guru_id = g;
  if not found then raise exception 'Sesi ini tidak ada di jadwal Anda hari ini'; end if;
  if s.mulai is null then raise exception 'Jam pelajaran belum diatur oleh admin'; end if;
  if now_ < s.mulai - make_interval(mins => buka) then
    raise exception 'Check-in baru dibuka % menit sebelum jam dimulai', buka; end if;
  if now_ > s.selesai then raise exception 'Jam pelajaran ini sudah selesai'; end if;
  if exists (select 1 from kehadiran k where k.tanggal = t and k.jadwal_id = p_jadwal_id and k.guru_id = g) then
    raise exception 'Anda sudah check-in untuk sesi ini'; end if;

  select * into r from ruang where id = s.ruang_id;
  if r.id is null or r.lat is null then raise exception 'Titik lokasi ruang % belum diatur admin', coalesce(s.ruang_nama, s.kelas); end if;

  -- ringkas sampel GPS: median posisi, akurasi terbaik
  n := coalesce(jsonb_array_length(p_sampel), 0);
  if n = 0 then raise exception 'Data GPS tidak terbaca'; end if;
  select percentile_cont(0.5) within group (order by (e->>'lat')::float8),
         percentile_cont(0.5) within group (order by (e->>'lng')::float8),
         min((e->>'acc')::float8),
         max((e->>'lat')::float8) - min((e->>'lat')::float8),
         max((e->>'lng')::float8) - min((e->>'lng')::float8)
    into lat_, lng_, acc_, beda_lat, beda_lng
  from jsonb_array_elements(p_sampel) e;

  jarak := jarak_meter(lat_, lng_, r.lat, r.lng);

  -- 1) di luar radius (memperhitungkan akurasi GPS, maksimal tambahan 10 m)
  if jarak > r.radius_m + least(coalesce(acc_, 0), 10) then tanda := tanda || 'di_luar_radius'::text; end if;
  -- 2) sampel terlalu sedikit
  if n < min_sampel then tanda := tanda || 'sampel_kurang'::text; end if;
  -- 3) koordinat diam sempurna: GPS asli selalu bergoyang sedikit
  if n >= 3 and beda_lat = 0 and beda_lng = 0 then tanda := tanda || 'koordinat_identik'::text; end if;
  -- 4) akurasi tidak wajar: < 1 m, atau semua sampel bernilai bulat yang sama
  if acc_ is not null and acc_ < 1 then tanda := tanda || 'akurasi_tidak_wajar'::text;
  elsif n >= 3 and (select count(distinct (e->>'acc')) = 1 and bool_and((e->>'acc')::float8 = round((e->>'acc')::float8))
                    from jsonb_array_elements(p_sampel) e) then tanda := tanda || 'akurasi_tidak_wajar'::text; end if;
  -- 5) teleport: dibanding check-in sebelumnya hari ini, kecepatan > 15 m/detik (54 km/jam)
  select k.lat, k.lng, k.waktu_checkin into prev from kehadiran k
   where k.guru_id = g and k.tanggal = t and k.lat is not null order by k.waktu_checkin desc limit 1;
  if prev.lat is not null and jarak_meter(prev.lat, prev.lng, lat_, lng_) /
       greatest(extract(epoch from (now() - prev.waktu_checkin)), 1) > 15 then
    tanda := tanda || 'lompatan_lokasi'::text; end if;
  -- 6) titik sama persis dengan check-in hari lain (sampai 7 angka desimal)
  if exists (select 1 from kehadiran k where k.guru_id = g and k.tanggal <> t
             and round(k.lat::numeric, 7) = round(lat_::numeric, 7) and round(k.lng::numeric, 7) = round(lng_::numeric, 7)) then
    tanda := tanda || 'titik_berulang'::text; end if;

  st := case when now_ > s.mulai + make_interval(mins => toleransi) then 'terlambat' else 'hadir' end;

  insert into kehadiran(tanggal, jadwal_id, guru_id, status, verifikasi, waktu_checkin, lat, lng, akurasi_m,
                        jarak_m, ruang_id, tanda, sampel_gps)
  values (t, p_jadwal_id, g, st, (case when cardinality(tanda) = 0 then 'ok' else 'perlu_dicek' end)::status_verifikasi,
          now(), lat_, lng_, acc_, round(jarak::numeric, 1), r.id, tanda, p_sampel)
  returning * into hasil;
  return hasil;
end $$;

-- Admin/waka kurikulum menyetujui atau menolak check-in yang perlu dicek
create or replace function verifikasi_kehadiran(p_id bigint, p_setuju boolean)
returns void language plpgsql security definer set search_path = public as $$
declare k kehadiran; u uuid;
begin
  if not is_admin() then raise exception 'Hanya admin/waka kurikulum'; end if;
  update kehadiran set verifikasi = (case when p_setuju then 'disetujui' else 'ditolak' end)::status_verifikasi,
         status = case when p_setuju then status else 'tidak_hadir'::status_hadir end,
         diverifikasi_oleh = auth.uid(), diverifikasi_at = now()
   where id = p_id returning * into k;
  if k.id is null then raise exception 'Data tidak ditemukan'; end if;
  select user_id into u from guru where id = k.guru_id;
  if u is not null then
    insert into notifikasi(user_id, judul, isi, tautan)
    values (u, case when p_setuju then 'Check-in disetujui' else 'Check-in ditolak' end,
            'Check-in Anda tanggal ' || to_char(k.tanggal, 'DD-MM-YYYY') ||
            case when p_setuju then ' telah disetujui.' else ' ditolak dan dicatat tidak hadir.' end, '#/riwayat');
  end if;
end $$;

-- ---------------------------------------------------------------------
--  IZIN: diajukan guru, diputus admin ATAU kepala (keputusan pertama berlaku)
-- ---------------------------------------------------------------------
create or replace function ajukan_izin(p_mulai date, p_selesai date, p_jenis text, p_alasan text)
returns izin language plpgsql security definer set search_path = public as $$
declare g bigint := guru_saya(); i izin; nama_ text;
begin
  if g is null then raise exception 'Akun ini belum terhubung ke data guru'; end if;
  insert into izin(guru_id, tanggal_mulai, tanggal_selesai, jenis, alasan)
  values (g, p_mulai, p_selesai, p_jenis, p_alasan) returning * into i;
  select nama into nama_ from guru where id = g;
  perform beri_tahu_pengelola('Pengajuan izin baru',
    nama_ || ' mengajukan izin ' || p_jenis || ' (' || to_char(p_mulai, 'DD-MM') ||
    case when p_selesai <> p_mulai then ' s.d. ' || to_char(p_selesai, 'DD-MM') else '' end || ').',
    '#/persetujuan');
  return i;
end $$;

create or replace function putuskan_izin(p_id bigint, p_setuju boolean, p_catatan text default null)
returns void language plpgsql security definer set search_path = public as $$
declare i izin; nama_guru text; nama_pemutus text; jabatan text; u uuid; sesi_kosong int := 0; d date;
begin
  if not pengelola() then raise exception 'Hanya admin/waka kurikulum dan kepala madrasah'; end if;
  update izin set status = case when p_setuju then 'disetujui'::status_izin else 'ditolak'::status_izin end,
         diputus_oleh = auth.uid(), diputus_peran = peran_saya(), diputus_at = now(), catatan_putusan = p_catatan
   where id = p_id and status = 'menunggu' returning * into i;
  if i.id is null then raise exception 'Izin ini sudah diputuskan oleh pengelola lain'; end if;

  select g.nama, g.user_id into nama_guru, u from guru g where g.id = i.guru_id;
  select nama into nama_pemutus from pengguna where user_id = auth.uid();
  jabatan := case when peran_saya() = 'kepala' then 'Kepala Madrasah' else 'Waka Kurikulum' end;

  -- ke guru
  if u is not null then
    insert into notifikasi(user_id, judul, isi, tautan)
    values (u, case when p_setuju then 'Izin disetujui' else 'Izin ditolak' end,
            'Izin Anda ' || case when p_setuju then 'disetujui' else 'ditolak' end || ' oleh ' || jabatan ||
            coalesce(' (' || nama_pemutus || ')', '') || coalesce('. Catatan: ' || p_catatan, '.'), '#/izin');
  end if;
  -- ke pengelola lain, supaya tidak diproses dua kali
  perform beri_tahu_pengelola('Izin sudah diputuskan',
    'Izin ' || nama_guru || ' sudah ' || case when p_setuju then 'disetujui' else 'ditolak' end ||
    ' oleh ' || jabatan || coalesce(' (' || nama_pemutus || ')', '') || '.', '#/persetujuan', auth.uid());

  -- pengingat guru pengganti
  if p_setuju then
    for d in select generate_series(i.tanggal_mulai, i.tanggal_selesai, interval '1 day')::date loop
      sesi_kosong := sesi_kosong + (select count(*) from sesi_hari(d) s where s.guru_id = i.guru_id);
    end loop;
    if sesi_kosong > 0 then
      insert into notifikasi(user_id, judul, isi, tautan)
      select user_id, 'Perlu guru pengganti',
             nama_guru || ' izin: ' || sesi_kosong || ' sesi mengajar belum ada pengganti.', '#/perubahan'
      from pengguna where peran = 'admin';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------
--  Tugas berkala (tiap 5 menit): peringatan kelas kosong + tandai tidak hadir
-- ---------------------------------------------------------------------
create or replace function tugas_berkala() returns void
language plpgsql security definer set search_path = public as $$
declare now_ timestamp := sekarang(); t date := now_::date; s record;
        toleransi int := coalesce((atur('toleransi_terlambat_menit'))::int, 10);
begin
  for s in select * from sesi_hari(t) loop
    continue when s.mulai is null or s.izin_id is not null;
    -- kelas kosong: lewat toleransi, belum ada check-in
    if now_ > s.mulai + make_interval(mins => toleransi) and now_ < s.selesai
       and not exists (select 1 from kehadiran k where k.tanggal = t and k.jadwal_id = s.jadwal_id and k.guru_id = s.guru_id)
       and not exists (select 1 from peringatan_terkirim p where p.tanggal = t and p.jadwal_id = s.jadwal_id) then
      insert into peringatan_terkirim values (t, s.jadwal_id);
      perform beri_tahu_pengelola('Kelas kosong: ' || s.kelas,
        s.kelas || ' belum ada guru. ' || s.guru_nama || ', ' || s.mapel || ', jam ke-' || s.jam_mulai ||
        ' (' || to_char(s.mulai, 'HH24.MI') || ').', '#/dashboard');
    end if;
    -- sesi selesai tanpa check-in → tidak hadir
    if now_ > s.selesai then
      insert into kehadiran(tanggal, jadwal_id, guru_id, status, ruang_id)
      values (t, s.jadwal_id, s.guru_id, 'tidak_hadir', s.ruang_id)
      on conflict (tanggal, jadwal_id, guru_id) do nothing;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
--  Rekap bulanan per guru
-- ---------------------------------------------------------------------
create or replace function rekap_bulanan(p_tahun int, p_bulan int)
returns table (guru_id bigint, guru_nama text, terjadwal bigint, hadir bigint, terlambat bigint,
               izin bigint, tidak_hadir bigint, perlu_dicek bigint, jurnal_terisi bigint)
language plpgsql stable security definer set search_path = public as $$
declare awal date := greatest(make_date(p_tahun, p_bulan, 1),
                               coalesce((atur('tanggal_mulai_sistem') #>> '{}')::date, make_date(p_tahun, p_bulan, 1)));
        akhir date := least((awal + interval '1 month - 1 day')::date, sekarang()::date);
begin
  if not pengelola() then raise exception 'Hanya admin/waka kurikulum dan kepala madrasah'; end if;
  return query
  with sesi as (
    select d::date as tgl, s.* from generate_series(awal, akhir, interval '1 day') d
    cross join lateral sesi_hari(d::date) s
  ),
  gabung as (
    select s.guru_id, s.guru_nama, s.izin_id, k.id as kid, k.status, k.verifikasi, s.selesai
    from sesi s left join kehadiran k on k.tanggal = s.tgl and k.jadwal_id = s.jadwal_id and k.guru_id = s.guru_id
    where s.selesai <= sekarang() or k.id is not null
  )
  select g.guru_id, g.guru_nama, count(*),
         count(*) filter (where g.status = 'hadir'),
         count(*) filter (where g.status = 'terlambat'),
         count(*) filter (where g.kid is null and g.izin_id is not null),
         count(*) filter (where g.status = 'tidak_hadir' or (g.kid is null and g.izin_id is null)),
         count(*) filter (where g.verifikasi = 'perlu_dicek'),
         count(*) filter (where exists (select 1 from jurnal j where j.kehadiran_id = g.kid))
  from gabung g group by g.guru_id, g.guru_nama order by g.guru_nama;
end $$;

-- ---------------------------------------------------------------------
--  Impor jadwal dari CSV (dipanggil halaman admin)
--  p_baris: [{"guru","hari","jam_mulai","jam_selesai","kelas","mapel"}, ...]
-- ---------------------------------------------------------------------
create or replace function impor_jadwal(p_nama text, p_berlaku date, p_baris jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v bigint; n int;
begin
  if not is_admin() then raise exception 'Hanya admin/waka kurikulum'; end if;
  if exists (select 1 from jadwal_versi where berlaku_mulai = p_berlaku) then
    raise exception 'Sudah ada versi jadwal yang berlaku mulai %', p_berlaku; end if;

  insert into guru(nama) select distinct trim(e->>'guru') from jsonb_array_elements(p_baris) e
  on conflict (nama) do nothing;
  insert into kelas(nama) select distinct trim(e->>'kelas') from jsonb_array_elements(p_baris) e
  on conflict (nama) do nothing;
  -- buat ruang dengan nama kelas bila belum ada, lalu hubungkan
  insert into ruang(nama) select k.nama from kelas k where k.ruang_id is null on conflict (nama) do nothing;
  update kelas k set ruang_id = r.id from ruang r where k.ruang_id is null and r.nama = k.nama;

  insert into jadwal_versi(nama, berlaku_mulai) values (p_nama, p_berlaku) returning id into v;
  insert into jadwal(versi_id, guru_id, hari, jam_mulai, jam_selesai, kelas, mapel)
  select v, g.id,
         case lower(trim(e->>'hari')) when 'senin' then 1 when 'selasa' then 2 when 'rabu' then 3
              when 'kamis' then 4 when 'jumat' then 5 when 'jum''at' then 5 when 'sabtu' then 6 when 'minggu' then 7 end,
         (e->>'jam_mulai')::smallint, (e->>'jam_selesai')::smallint, trim(e->>'kelas'), trim(e->>'mapel')
  from jsonb_array_elements(p_baris) e join guru g on g.nama = trim(e->>'guru');
  get diagnostics n = row_count;
  if exists (select 1 from jadwal where versi_id = v and hari is null) then
    raise exception 'Ada nama hari yang tidak dikenali'; end if;
  return n;
end $$;

-- ---------------------------------------------------------------------
--  Row Level Security
-- ---------------------------------------------------------------------
alter table guru enable row level security;
alter table pengguna enable row level security;
alter table ruang enable row level security;
alter table kelas enable row level security;
alter table aturan_ruang enable row level security;
alter table jam_pelajaran enable row level security;
alter table jadwal_versi enable row level security;
alter table jadwal enable row level security;
alter table perubahan enable row level security;
alter table izin enable row level security;
alter table kehadiran enable row level security;
alter table jurnal enable row level security;
alter table notifikasi enable row level security;
alter table push_langganan enable row level security;
alter table pengaturan enable row level security;
alter table peringatan_terkirim enable row level security;

-- data referensi: semua pengguna login boleh baca, hanya admin boleh ubah
do $$
declare t text;
begin
  foreach t in array array['guru','ruang','kelas','aturan_ruang','jam_pelajaran','jadwal_versi','jadwal','perubahan','pengaturan'] loop
    execute format('drop policy if exists baca on %I', t);
    execute format('create policy baca on %I for select to authenticated using (true)', t);
    execute format('drop policy if exists ubah_admin on %I', t);
    execute format('create policy ubah_admin on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

drop policy if exists baca on pengguna;
create policy baca on pengguna for select to authenticated using (user_id = auth.uid() or pengelola());
drop policy if exists ubah_admin on pengguna;
create policy ubah_admin on pengguna for all to authenticated using (is_admin()) with check (is_admin());

-- izin: guru melihat miliknya; pengelola melihat semua. Penulisan lewat fungsi.
drop policy if exists baca on izin;
create policy baca on izin for select to authenticated using (guru_id = guru_saya() or pengelola());

-- kehadiran: guru melihat miliknya; pengelola melihat semua. Penulisan lewat fungsi checkin().
drop policy if exists baca on kehadiran;
create policy baca on kehadiran for select to authenticated using (guru_id = guru_saya() or pengelola());

-- jurnal: guru menulis jurnal untuk kehadirannya sendiri (sampai akhir hari itu)
drop policy if exists baca on jurnal;
create policy baca on jurnal for select to authenticated using (
  pengelola() or exists (select 1 from kehadiran k where k.id = kehadiran_id and k.guru_id = guru_saya()));
drop policy if exists tulis_guru on jurnal;
create policy tulis_guru on jurnal for insert to authenticated with check (
  exists (select 1 from kehadiran k where k.id = kehadiran_id and k.guru_id = guru_saya()
          and k.status in ('hadir','terlambat') and k.tanggal = sekarang()::date));
drop policy if exists ubah_guru on jurnal;
create policy ubah_guru on jurnal for update to authenticated using (
  exists (select 1 from kehadiran k where k.id = kehadiran_id and k.guru_id = guru_saya() and k.tanggal = sekarang()::date));

drop policy if exists milik_sendiri on notifikasi;
create policy milik_sendiri on notifikasi for select to authenticated using (user_id = auth.uid());
drop policy if exists tandai_dibaca on notifikasi;
create policy tandai_dibaca on notifikasi for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists milik_sendiri on push_langganan;
create policy milik_sendiri on push_langganan for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- fungsi internal tidak boleh dipanggil langsung dari aplikasi
revoke execute on function tugas_berkala() from public, anon, authenticated;
revoke execute on function beri_tahu_pengelola(text, text, text, uuid) from public, anon, authenticated;
revoke execute on function sesi_hari(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
--  Data awal
-- ---------------------------------------------------------------------
insert into pengaturan(kunci, nilai) values
  ('toleransi_terlambat_menit', '10'),
  ('buka_checkin_menit', '10'),
  ('durasi_gps_detik', '5'),
  ('min_sampel_gps', '3'),
  ('radius_default_m', '8'),
  ('nama_madrasah', '"MAN 1 Pasuruan"'),
  ('tanggal_mulai_sistem', to_jsonb(current_date))
on conflict (kunci) do nothing;

-- Jam pelajaran sesuai Jadwal KBM (Senin–Kamis = 1–4, Jumat = 5, Sabtu = 6)
insert into jam_pelajaran(hari, jam_ke, mulai, selesai)
select h, x.jam, x.m::time, x.s::time
from generate_series(1, 4) h,
  (values (1,'07:00','07:40'),(2,'07:40','08:20'),(3,'08:20','09:00'),(4,'09:00','09:40'),
          (5,'10:10','10:50'),(6,'10:50','11:30'),(7,'12:30','13:10'),(8,'13:10','13:50'),
          (9,'13:50','14:30'),(10,'14:30','15:10'),(11,'15:10','15:50')) x(jam, m, s)
on conflict do nothing;
insert into jam_pelajaran(hari, jam_ke, mulai, selesai) values
  (5,1,'07:00','07:35'),(5,2,'07:35','08:10'),(5,3,'08:10','08:45'),(5,4,'08:45','09:40'),
  (5,5,'09:55','10:30'),(5,6,'10:30','11:05'),(5,7,'12:45','13:20'),(5,8,'13:20','13:55'),
  (5,9,'13:55','14:30'),(5,10,'14:30','15:10'),(5,11,'15:10','15:50'),
  (6,1,'07:00','07:45'),(6,2,'07:45','08:30'),(6,3,'08:30','09:15'),(6,4,'09:15','10:00'),
  (6,5,'10:20','11:15'),(6,6,'11:15','12:00'),(6,7,'12:30','13:10'),(6,8,'13:10','13:50')
on conflict do nothing;

-- Ruang khusus
insert into ruang(nama, radius_m) values ('Lapangan', 30) on conflict (nama) do nothing;
insert into aturan_ruang(mapel_mengandung, ruang_id)
select 'Penjasorkes', id from ruang where nama = 'Lapangan' on conflict do nothing;

-- ---------------------------------------------------------------------
--  Jadwal otomatis (pg_cron) — aktifkan ekstensi pg_cron di Supabase dulu
-- ---------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'presensi-tugas-berkala';
  perform cron.schedule('presensi-tugas-berkala', '*/5 * * * *', 'select public.tugas_berkala()');
exception when others then
  raise notice 'pg_cron belum aktif: aktifkan di Database → Extensions, lalu jalankan bagian ini lagi. (%)', sqlerrm;
end $$;
