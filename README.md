# AquaShop POS

ระบบ POS ร้านน้ำดื่ม (HTML/CSS/JS ล้วน) เชื่อมต่อ Supabase สำหรับฐานข้อมูล, Storage รูปสินค้า และระบบ Login ฝั่ง Admin

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|------|---------|
| `index.html` | โครงหน้าเว็บ (POS + Admin + Modals) |
| `style.css` | สไตล์ทั้งหมด |
| `app.js` | ตรรกะหน้าขาย, Admin, รายงาน, auth gate |
| `supabase.js` | Config + Supabase client + data/auth/storage layer |
| `supabase_schema.sql` | SQL สร้างตาราง + RLS + Storage (รันใน Supabase SQL Editor) |
| `render.yaml` | ตั้งค่า deploy บน Render (static site) |

## ตั้งค่า Supabase (ทำครั้งเดียว)

1. สร้างโปรเจคที่ [supabase.com](https://supabase.com)
2. เปิด **SQL Editor → New query** วางเนื้อหาจาก `supabase_schema.sql` แล้ว **Run**
   - สร้างตาราง `categories`, `products`, `sales`
   - ตั้ง Row Level Security (RLS)
   - สร้าง Storage bucket `product-images` + policy
   - ใส่ข้อมูลสินค้าเริ่มต้น
3. สร้างบัญชี Admin: **Authentication → Users → Add user** กรอก email/password และติ๊ก **Auto Confirm User**
4. คัดลอก **Project URL** และ **anon public key** จาก **Project Settings → API** มาใส่ใน `supabase.js` (ด้านบนไฟล์)

> หมายเหตุ: anon key ออกแบบมาให้เปิดเผยฝั่ง client ได้ ความปลอดภัยมาจาก RLS **อย่า** นำ `service_role` key มาใส่ในฝั่ง client เด็ดขาด

## รันในเครื่อง (local)

ต้องเปิดผ่าน HTTP server (ไม่ใช่เปิดไฟล์ตรง ๆ) เพราะ Supabase/CDN ต้องการ origin:

```bash
npx serve .
```

เปิด URL ที่แสดง (เช่น `http://localhost:3000`)

## Deploy ขึ้น Render

Render deploy จาก Git repository ขั้นตอน:

1. **สร้าง Git repo และ push ขึ้น GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit: AquaShop POS"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo>.git
   git push -u origin main
   ```

2. **เชื่อม Render กับ repo**
   - ไปที่ [dashboard.render.com](https://dashboard.render.com) → **New → Static Site**
   - เลือก repo ที่เพิ่ง push
   - Render จะอ่าน `render.yaml` ให้อัตโนมัติ (หรือตั้งค่าเอง: Build Command เว้นว่าง, Publish Directory = `.`)
   - กด **Create Static Site**

3. **ตั้งค่า URL ใน Supabase หลัง deploy**
   - คัดลอก URL ของ Render (เช่น `https://aquashop-pos.onrender.com`)
   - Supabase Dashboard → **Authentication → URL Configuration**
   - เพิ่ม URL นั้นใน **Site URL** และ **Redirect URLs**

4. เปิด URL ของ Render ใช้งานได้เลย

## ความปลอดภัย (สรุป)

- หน้าขาย (POS): ใช้งานได้โดยไม่ต้อง login (อ่านสินค้า + บันทึกบิล)
- หน้า Admin: ต้อง login ด้วยบัญชี Supabase ก่อน
- การแก้ไข/ลบสินค้า หมวดหมู่ และอัปโหลดรูป: ทำได้เฉพาะผู้ login (บังคับผ่าน RLS)
