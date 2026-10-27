-- =====================================================
--  AquaShop POS — Custom Users Table (username + password)
--  ทางเลือกที่ 2: จัดการผู้ใช้เอง ไม่ใช้ Supabase Auth
--
--  รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → New query
-- =====================================================

-- ต้องมี extension pgcrypto สำหรับ hash รหัสผ่าน (bcrypt)
create extension if not exists pgcrypto;

-- ---------- USERS ----------
create table if not exists public.users (
  id            bigint generated always as identity primary key,
  username      text not null unique,
  password_hash text not null,
  role          text not null default 'staff' check (role in ('admin', 'staff')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- =====================================================
--  ROW LEVEL SECURITY
--  ล็อกตารางนี้ไว้แน่น: anon/authenticated อ่าน/เขียนตรง ๆ ไม่ได้เลย
--  การเข้าถึงทั้งหมดทำผ่าน RPC (security definer) ด้านล่างเท่านั้น
--  → password_hash จะไม่มีทางรั่วผ่าน PostgREST
-- =====================================================
alter table public.users enable row level security;
-- ไม่สร้าง policy ใด ๆ = ไม่มีใคร select/insert/update/delete ตรงได้

-- =====================================================
--  RPC: ตรวจสอบการเข้าสู่ระบบ
--  คืนเฉพาะ id, username, role (ไม่คืน password_hash)
--  คืน 0 แถว ถ้า username/password ไม่ถูก หรือบัญชีถูกปิด
-- =====================================================
create or replace function public.verify_login(p_username text, p_password text)
returns table (id bigint, username text, role text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select u.id, u.username, u.role
  from public.users u
  where u.username = lower(trim(p_username))
    and u.active = true
    and u.password_hash = crypt(p_password, u.password_hash);
end;
$$;

-- อนุญาตให้ anon เรียก verify_login ได้ (หน้า login ใช้ anon key)
revoke all on function public.verify_login(text, text) from public;
grant execute on function public.verify_login(text, text) to anon, authenticated;

-- =====================================================
--  RPC: สร้างผู้ใช้ใหม่ (ใช้ตอน setup)
--  hash รหัสผ่านด้วย bcrypt อัตโนมัติ
-- =====================================================
create or replace function public.create_app_user(
  p_username text,
  p_password text,
  p_role     text default 'staff'
)
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_id bigint;
begin
  if p_role not in ('admin', 'staff') then
    raise exception 'role ต้องเป็น admin หรือ staff';
  end if;

  insert into public.users (username, password_hash, role)
  values (lower(trim(p_username)), crypt(p_password, gen_salt('bf')), p_role)
  returning id into new_id;

  return new_id;
end;
$$;

-- RPC นี้ "ไม่" grant ให้ anon — เรียกได้จาก SQL Editor เท่านั้น (ปลอดภัย)
revoke all on function public.create_app_user(text, text, text) from public;

-- =====================================================
--  RPC: เปลี่ยนรหัสผ่าน (ใช้ตอน setup/รีเซ็ต)
-- =====================================================
create or replace function public.set_app_password(p_username text, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.users
  set password_hash = crypt(p_password, gen_salt('bf'))
  where username = lower(trim(p_username));
end;
$$;

revoke all on function public.set_app_password(text, text) from public;

-- =====================================================
--  สร้างผู้ใช้เริ่มต้น (demo)
--    username : admin   รหัสผ่าน : Demo@1234   role : admin
--    username : staff   รหัสผ่าน : Staff@1234  role : staff
--  * เปลี่ยนรหัสผ่านได้ด้วย: select set_app_password('admin', 'รหัสใหม่');
-- =====================================================
select public.create_app_user('admin', 'Demo@1234',  'admin');
select public.create_app_user('staff', 'Staff@1234', 'staff');

-- ตรวจสอบ (จะไม่เห็น password_hash เพราะ RLS ปิดอยู่ — ดูผ่าน table editor ในฐานะ owner ได้)
-- select id, username, role, active from public.users;

-- =====================================================
--  ปรับ RLS ให้สอดคล้องกับ login แบบ custom users
--
--  ⚠️ สำคัญ: login ด้วยตาราง users เอง "ไม่ใช่" Supabase Auth session
--  ดังนั้น client จะเรียก API ด้วย anon key เสมอ (ไม่มี authenticated role)
--  policy ที่อิง is_admin()/authenticated จะบล็อกการเขียนทั้งหมด
--  จึงต้องเปิดให้ anon เขียนได้ และกันสิทธิ์จริงที่ชั้น UI (ตรวจ role ก่อนเข้า Admin)
--
--  หมายเหตุด้านความปลอดภัย: ผู้ที่มี anon key (เปิด DevTools) สามารถเรียก API
--  เขียน/ลบข้อมูล products/categories/sales ได้โดยตรง นี่คือข้อจำกัดของ
--  static site ที่ไม่มี backend — ยอมรับ trade-off นี้ตามที่เลือกทางเลือกที่ 2
-- =====================================================

-- ----- PRODUCTS: anon เขียน/แก้/ลบ ได้ -----
drop policy if exists "products_write_admin" on public.products;
drop policy if exists "products_write_anon"  on public.products;
create policy "products_write_anon"
  on public.products for all
  to anon, authenticated
  using (true) with check (true);

-- ----- CATEGORIES: anon เขียน/แก้/ลบ ได้ -----
drop policy if exists "categories_write_admin" on public.categories;
drop policy if exists "categories_write_anon"  on public.categories;
create policy "categories_write_anon"
  on public.categories for all
  to anon, authenticated
  using (true) with check (true);

-- ----- SALES: anon ลบได้ (ล้างประวัติ) -----
drop policy if exists "sales_delete_admin" on public.sales;
drop policy if exists "sales_delete_anon"  on public.sales;
create policy "sales_delete_anon"
  on public.sales for delete
  to anon, authenticated
  using (true);

-- ----- STORAGE: anon อัปโหลด/แก้/ลบรูปได้ -----
drop policy if exists "product_images_insert_admin" on storage.objects;
drop policy if exists "product_images_update_admin" on storage.objects;
drop policy if exists "product_images_delete_admin" on storage.objects;
drop policy if exists "product_images_insert_anon"  on storage.objects;
drop policy if exists "product_images_update_anon"  on storage.objects;
drop policy if exists "product_images_delete_anon"  on storage.objects;

create policy "product_images_insert_anon"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'product-images');

create policy "product_images_update_anon"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');

create policy "product_images_delete_anon"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'product-images');
