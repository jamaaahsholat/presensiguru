-- =====================================================================
--  PEMBARUAN 1 — jalankan sekali di SQL Editor (untuk proyek yang sudah terpasang)
--  Melindungi riwayat kehadiran: jadwal/guru yang sudah punya catatan
--  kehadiran tidak bisa terhapus tanpa sengaja.
-- =====================================================================
alter table jadwal    drop constraint if exists jadwal_guru_id_fkey,
  add constraint jadwal_guru_id_fkey foreign key (guru_id) references guru(id) on delete restrict;
alter table izin      drop constraint if exists izin_guru_id_fkey,
  add constraint izin_guru_id_fkey foreign key (guru_id) references guru(id) on delete restrict;
alter table kehadiran drop constraint if exists kehadiran_jadwal_id_fkey,
  add constraint kehadiran_jadwal_id_fkey foreign key (jadwal_id) references jadwal(id) on delete restrict;
alter table kehadiran drop constraint if exists kehadiran_guru_id_fkey,
  add constraint kehadiran_guru_id_fkey foreign key (guru_id) references guru(id) on delete restrict;

-- hak akses (sama dengan perbaikan sebelumnya; aman dijalankan ulang)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
revoke execute on function tugas_berkala() from public, anon, authenticated;
revoke execute on function beri_tahu_pengelola(text, text, text, uuid) from public, anon, authenticated;
revoke execute on function sesi_hari(date) from public, anon, authenticated;
