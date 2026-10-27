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
