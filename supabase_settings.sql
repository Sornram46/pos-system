-- =====================================================
--  AquaShop POS — Settings + PromptPay
--  รันไฟล์นี้ใน Supabase SQL Editor (หลัง supabase_schema.sql)
-- =====================================================

-- ---------- SETTINGS (key-value singleton) ----------
create table if not exists public.settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.settings enable row level security;

drop policy if exists "settings_read_all"  on public.settings;
drop policy if exists "settings_write_all" on public.settings;

create policy "settings_read_all"
  on public.settings for select
  to anon, authenticated
  using (true);

create policy "settings_write_all"
  on public.settings for all
  to anon, authenticated
  using (true) with check (true);

-- ค่าตั้งต้น (แก้ได้ภายหลังผ่านหน้า Admin)
insert into public.settings (key, value) values
  ('shop_name',       'AquaShop'),
  ('promptpay_id',    ''),          -- เบอร์โทร 0812345678 หรือเลขบัตรประชาชน 13 หลัก
  ('promptpay_name',  '')           -- ชื่อบัญชี (แสดงบนหน้าจอ QR เฉย ๆ)
on conflict (key) do nothing;

-- ---------- เพิ่มคอลัมน์วิธีชำระเงินในตาราง sales ----------
alter table public.sales
  add column if not exists payment_method text not null default 'cash';
  -- ค่า: 'cash' = เงินสด, 'promptpay' = โอนผ่าน PromptPay

-- =====================================================
--  เพิ่มรูปภาพให้หมวดหมู่ (รันเพิ่มได้เลย)
--  รูปเก็บใน bucket 'product-images' เดิม (โฟลเดอร์ categories/)
-- =====================================================
alter table public.categories
  add column if not exists image_url text;
