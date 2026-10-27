-- =====================================================
--  AquaShop POS — Supabase Schema
--  รันไฟล์นี้ใน Supabase Dashboard → SQL Editor → New query
-- =====================================================

-- ---------- CATEGORIES ----------
create table if not exists public.categories (
  id         bigint generated always as identity primary key,
  name       text not null unique,
  emoji      text not null default '🏷️',
  created_at timestamptz not null default now()
);

-- ---------- PRODUCTS ----------
create table if not exists public.products (
  id         bigint generated always as identity primary key,
  name       text not null,
  category   text not null,
  price      numeric not null default 0,
  emoji      text not null default '💧',
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- SALES ----------
-- order_no เก็บเลขที่บิลที่แสดงผล (เช่น ORD-0001)
-- items เก็บรายการสินค้าในบิลเป็น JSON
create table if not exists public.sales (
  id         bigint generated always as identity primary key,
  order_no   text not null,
  sold_at    timestamptz not null default now(),
  items      jsonb not null default '[]'::jsonb,
  subtotal   numeric not null default 0,
  discount   numeric not null default 0,
  grand      numeric not null default 0,
  cash       numeric not null default 0,
  change     numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sales_sold_at_idx on public.sales (sold_at desc);

-- =====================================================
--  ROW LEVEL SECURITY
--  - ทุกคน (anon) อ่านสินค้า/หมวดหมู่ได้  → หน้าขายใช้งานได้โดยไม่ต้อง login
--  - เฉพาะผู้ล็อกอิน (authenticated) เท่านั้นที่ เขียน/แก้ไข/ลบ ได้  → ฝั่ง Admin
--  - sales: อ่าน/เขียน เฉพาะผู้ล็อกอิน (ป้องกันข้อมูลยอดขายรั่ว)
--    *ถ้าต้องการให้หน้าขายบันทึกบิลได้โดยไม่ login ให้ดูหมายเหตุด้านล่าง*
-- =====================================================

alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.sales      enable row level security;

-- ----- CATEGORIES policies -----
drop policy if exists "categories_read_all"   on public.categories;
drop policy if exists "categories_write_auth" on public.categories;

create policy "categories_read_all"
  on public.categories for select
  to anon, authenticated
  using (true);

create policy "categories_write_auth"
  on public.categories for all
  to authenticated
  using (true) with check (true);

-- ----- PRODUCTS policies -----
drop policy if exists "products_read_all"   on public.products;
drop policy if exists "products_write_auth" on public.products;

create policy "products_read_all"
  on public.products for select
  to anon, authenticated
  using (true);

create policy "products_write_auth"
  on public.products for all
  to authenticated
  using (true) with check (true);

-- ----- SALES policies -----
-- หน้าขาย (POS) ต้อง "บันทึกบิล" ได้โดยไม่ต้อง login → อนุญาต anon insert
-- แต่การอ่านประวัติ/รายงาน และการลบ ให้เฉพาะผู้ล็อกอิน (Admin)
drop policy if exists "sales_insert_all"  on public.sales;
drop policy if exists "sales_read_auth"   on public.sales;
drop policy if exists "sales_delete_auth" on public.sales;

create policy "sales_insert_all"
  on public.sales for insert
  to anon, authenticated
  with check (true);

create policy "sales_read_auth"
  on public.sales for select
  to anon, authenticated
  using (true);

create policy "sales_delete_auth"
  on public.sales for delete
  to authenticated
  using (true);

-- =====================================================
--  SEED DATA (ข้อมูลเริ่มต้น) — รันครั้งเดียว
-- =====================================================

insert into public.categories (name, emoji) values
  ('น้ำดื่ม',            '💧'),
  ('น้ำผลไม้',           '🧃'),
  ('น้ำอัดลม',           '🥤'),
  ('ชาและกาแฟ',          '☕'),
  ('เครื่องดื่มชูกำลัง',  '⚡'),
  ('นมและโยเกิร์ต',      '🥛')
on conflict (name) do nothing;

insert into public.products (name, category, price, emoji, active) values
  ('น้ำดื่มสิงห์ 600ml',    'น้ำดื่ม',          7,  '💧', true),
  ('น้ำดื่มช้าง 1.5L',      'น้ำดื่ม',          12, '💧', true),
  ('น้ำมิเนรัล Evian',      'น้ำดื่ม',          35, '💧', true),
  ('น้ำแร่ Perrier 330ml',  'น้ำดื่ม',          45, '🧊', true),
  ('น้ำส้ม Tropicana',      'น้ำผลไม้',         25, '🧃', true),
  ('น้ำแอปเปิล Malee',      'น้ำผลไม้',         20, '🧃', true),
  ('น้ำแครอท+ส้ม',          'น้ำผลไม้',         30, '🥤', true),
  ('น้ำมะพร้าว Coco',       'น้ำผลไม้',         22, '🥥', true),
  ('โค้ก 325ml',            'น้ำอัดลม',         20, '🥤', true),
  ('เป๊ปซี่ 325ml',          'น้ำอัดลม',         20, '🥤', true),
  ('สไปรท์ 325ml',          'น้ำอัดลม',         20, '🥤', true),
  ('เอส 325ml',             'น้ำอัดลม',         18, '🥤', true),
  ('ชาเขียว Itoen',         'ชาและกาแฟ',        25, '🍵', true),
  ('กาแฟโอเลี้ยง',          'ชาและกาแฟ',        30, '☕', true),
  ('ชาไทยนม',              'ชาและกาแฟ',        35, '🧋', true),
  ('Latte เย็น',            'ชาและกาแฟ',        55, '☕', true),
  ('กระทิงแดง 150ml',       'เครื่องดื่มชูกำลัง', 15, '⚡', true),
  ('M-150 150ml',           'เครื่องดื่มชูกำลัง', 15, '⚡', true),
  ('Shark 250ml',           'เครื่องดื่มชูกำลัง', 25, '⚡', true),
  ('โสมพลัส 250ml',         'เครื่องดื่มชูกำลัง', 20, '⚡', true),
  ('นมโฟร์โมสต์ 230ml',    'นมและโยเกิร์ต',    18, '🥛', true),
  ('นม UHT ดัชมิลล์',      'นมและโยเกิร์ต',    22, '🥛', true),
  ('โยเกิร์ต Dutch Mill',   'นมและโยเกิร์ต',    20, '🫙', true),
  ('นมถั่วเหลือง V-Soy',   'นมและโยเกิร์ต',    20, '🥛', true);

-- =====================================================
--  สร้างบัญชี Admin สำหรับ login
--  ไปที่ Dashboard → Authentication → Users → "Add user"
--  กรอก email + password แล้วติ๊ก "Auto Confirm User"
--  จากนั้นใช้ email/password นั้น login ที่หน้า Admin ของแอป
-- =====================================================

-- =====================================================
--  IMAGE SUPPORT (เพิ่มภายหลัง)
--  รัน 2 ส่วนนี้เพิ่ม ถ้าคุณรัน schema เวอร์ชันก่อนหน้าไปแล้ว
-- =====================================================

-- 1) เพิ่มคอลัมน์เก็บ URL รูปสินค้า
alter table public.products
  add column if not exists image_url text;

-- 2) สร้าง Storage bucket สำหรับรูปสินค้า (public อ่านได้)
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- 3) Storage policies
--    - ทุกคนอ่าน/ดูรูปได้ (bucket เป็น public)
--    - อัปโหลด/แก้/ลบ ได้เฉพาะผู้ล็อกอิน (Admin)
drop policy if exists "product_images_read"        on storage.objects;
drop policy if exists "product_images_insert_auth" on storage.objects;
drop policy if exists "product_images_update_auth" on storage.objects;
drop policy if exists "product_images_delete_auth" on storage.objects;

create policy "product_images_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

create policy "product_images_insert_auth"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');

create policy "product_images_update_auth"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');

create policy "product_images_delete_auth"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images');

-- =====================================================
--  USER ROLES / PROFILES (เพิ่มภายหลัง)
--  เก็บสิทธิ์ของผู้ใช้ เพื่อควบคุมการเข้าถึง Admin panel
--  รันทั้งบล็อกนี้ใน SQL Editor ได้เลย (รันซ้ำปลอดภัย)
-- =====================================================

-- 1) ตาราง profiles — 1 แถวต่อ 1 ผู้ใช้ auth
--    id อ้างอิง auth.users.id (ลบ user ใน auth แล้ว profile ถูกลบตาม)
--    role: 'admin' = เข้า Admin panel ได้, 'staff' = ใช้ได้แค่หน้าขาย
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2) Helper function: เช็คว่าผู้ใช้ปัจจุบันเป็น admin หรือไม่
--    security definer + search_path ว่าง เพื่อความปลอดภัยและเลี่ยง RLS recursion
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 3) Trigger: สร้าง profile อัตโนมัติเมื่อมี user ใหม่ใน auth.users
--    ผู้ใช้ใหม่จะได้ role 'staff' เป็นค่าเริ่มต้น (ต้องอัปเกรดเป็น admin เอง)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    'staff'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) RLS policies สำหรับ profiles
--    - ผู้ใช้อ่าน profile ของตัวเองได้ (ใช้เช็ค role ฝั่ง client)
--    - admin อ่าน/แก้ไข profile ของทุกคนได้ (จัดการสิทธิ์)
drop policy if exists "profiles_read_own"    on public.profiles;
drop policy if exists "profiles_read_admin"  on public.profiles;
drop policy if exists "profiles_update_admin" on public.profiles;

create policy "profiles_read_own"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_read_admin"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =====================================================
--  5) อัปเกรด RLS เดิม: เปลี่ยนจาก "ผู้ล็อกอินทุกคน" → "เฉพาะ admin"
--     เพื่อให้ role มีผลจริงในระดับฐานข้อมูล
--     (หน้าขายยังอ่านสินค้า/หมวดหมู่ และบันทึกบิลได้เหมือนเดิม)
-- =====================================================

-- ----- PRODUCTS: เขียน/แก้/ลบ เฉพาะ admin -----
drop policy if exists "products_write_auth"  on public.products;
drop policy if exists "products_write_admin" on public.products;
create policy "products_write_admin"
  on public.products for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----- CATEGORIES: เขียน/แก้/ลบ เฉพาะ admin -----
drop policy if exists "categories_write_auth"  on public.categories;
drop policy if exists "categories_write_admin" on public.categories;
create policy "categories_write_admin"
  on public.categories for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----- SALES: ลบประวัติ เฉพาะ admin -----
drop policy if exists "sales_delete_auth"  on public.sales;
drop policy if exists "sales_delete_admin" on public.sales;
create policy "sales_delete_admin"
  on public.sales for delete
  to authenticated
  using (public.is_admin());

-- ----- STORAGE: อัปโหลด/แก้/ลบรูป เฉพาะ admin -----
drop policy if exists "product_images_insert_auth"  on storage.objects;
drop policy if exists "product_images_update_auth"  on storage.objects;
drop policy if exists "product_images_delete_auth"  on storage.objects;
drop policy if exists "product_images_insert_admin" on storage.objects;
drop policy if exists "product_images_update_admin" on storage.objects;
drop policy if exists "product_images_delete_admin" on storage.objects;

create policy "product_images_insert_admin"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "product_images_update_admin"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

create policy "product_images_delete_admin"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- =====================================================
--  6) สร้าง profile ให้ user ที่มีอยู่แล้ว (รันครั้งเดียว)
--     เผื่อคุณสร้าง Admin user ไว้ก่อนมีตาราง profiles
-- =====================================================
insert into public.profiles (id, email, role)
select id, email, 'staff'
from auth.users
on conflict (id) do nothing;

-- =====================================================
--  7) ตั้งผู้ใช้ให้เป็น admin  ← แก้อีเมลให้ตรงกับบัญชีคุณ แล้วรัน
-- =====================================================
-- update public.profiles
-- set role = 'admin'
-- where email = 'your-admin@example.com';

-- =====================================================
--  DEMO ADMIN USER (login ด้วย USERNAME + PASSWORD)
--
--  ระบบ login ใช้ username แต่เบื้องหลัง Supabase ยังผูกกับ email
--  โค้ดจะแปลง username → email ภายในอัตโนมัติ: <username>@aquashop.local
--  ดังนั้น username 'admin' = email 'admin@aquashop.local'
--
--  ⚠️ ต้องสร้าง user ใน Dashboard ก่อน (SQL สร้าง login user ไม่ได้)
--     Authentication → Users → Add user
--       Email    : admin@aquashop.local      ← (username คือ 'admin')
--       Password : Demo@1234
--       ☑ Auto Confirm User
--
--  แล้วเข้าหน้า Admin ของแอป โดยกรอก:
--       ชื่อผู้ใช้ : admin
--       รหัสผ่าน  : Demo@1234
--
--  จากนั้นรันคำสั่งด้านล่างเพื่อตั้งให้เป็น admin:
-- =====================================================
update public.profiles
set role = 'admin'
where email = 'admin@aquashop.local';

-- ตรวจสอบผล: ควรเห็น role = 'admin'
-- select email, role from public.profiles where email = 'admin@aquashop.local';
