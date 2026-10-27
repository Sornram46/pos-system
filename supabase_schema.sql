-- =====================================================
--  AquaShop POS — Supabase Schema (ตารางข้อมูลหลัก)
--  รันไฟล์นี้ก่อน แล้วค่อยรัน supabase_users.sql (ระบบ login)
--  เปิดใน Supabase Dashboard → SQL Editor → New query
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
  image_url  text,
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
--
--  ระบบ login ใช้ตาราง public.users เอง (ดู supabase_users.sql)
--  ซึ่ง "ไม่ใช่" Supabase Auth → client เรียก API ด้วย anon key เสมอ
--  ดังนั้น policy การเขียนจึงเปิดให้ anon ได้ และกันสิทธิ์จริงที่ชั้น UI
--  (แอปจะตรวจ role ของผู้ใช้ก่อนให้เข้า Admin panel)
--
--  trade-off: ผู้ที่มี anon key (เปิด DevTools) เรียก API เขียน/ลบ
--  products/categories/sales ได้โดยตรง — เป็นข้อจำกัดของ static site
--  ที่ไม่มี backend
-- =====================================================

alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.sales      enable row level security;

-- ----- CATEGORIES -----
drop policy if exists "categories_read_all"  on public.categories;
drop policy if exists "categories_write_all" on public.categories;

create policy "categories_read_all"
  on public.categories for select
  to anon, authenticated
  using (true);

create policy "categories_write_all"
  on public.categories for all
  to anon, authenticated
  using (true) with check (true);

-- ----- PRODUCTS -----
drop policy if exists "products_read_all"  on public.products;
drop policy if exists "products_write_all" on public.products;

create policy "products_read_all"
  on public.products for select
  to anon, authenticated
  using (true);

create policy "products_write_all"
  on public.products for all
  to anon, authenticated
  using (true) with check (true);

-- ----- SALES -----
drop policy if exists "sales_read_all"   on public.sales;
drop policy if exists "sales_insert_all" on public.sales;
drop policy if exists "sales_delete_all" on public.sales;

create policy "sales_read_all"
  on public.sales for select
  to anon, authenticated
  using (true);

create policy "sales_insert_all"
  on public.sales for insert
  to anon, authenticated
  with check (true);

create policy "sales_delete_all"
  on public.sales for delete
  to anon, authenticated
  using (true);

-- =====================================================
--  STORAGE — รูปสินค้า
--    - bucket public: ทุกคนดูรูปได้
--    - อัปโหลด/แก้/ลบ: เปิดให้ anon (กันสิทธิ์จริงที่ชั้น UI)
-- =====================================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product_images_read"       on storage.objects;
drop policy if exists "product_images_insert_all" on storage.objects;
drop policy if exists "product_images_update_all" on storage.objects;
drop policy if exists "product_images_delete_all" on storage.objects;

create policy "product_images_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

create policy "product_images_insert_all"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'product-images');

create policy "product_images_update_all"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'product-images')
  with check (bucket_id = 'product-images');

create policy "product_images_delete_all"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'product-images');

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
--  ขั้นถัดไป: รัน supabase_users.sql เพื่อสร้างระบบ login
--  (ตาราง users + RPC verify_login + ผู้ใช้เริ่มต้น)
-- =====================================================
