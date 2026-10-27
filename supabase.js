/* ===================================================
   AquaShop POS — supabase.js
   Config + Client + Data Layer (CRUD + Auth)
   =================================================== */

// ─── 1) ใส่ค่าจาก Supabase Dashboard → Project Settings → API ───
const SUPABASE_URL      = 'https://ycmkpjubyynqjnkymjmy.supabase.co';      // เช่น https://xxxxx.supabase.co
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljbWtwanVieXlucWpua3ltam15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwNjg3NTAsImV4cCI6MjEwODY0NDc1MH0.K-qih24MrAoE2Rm2k_A3KulxgqfXwc_b06KPOl7pgaY'; // anon public key

// ─── 2) สร้าง client (ใช้ global `supabase` จาก CDN ใน index.html) ───
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// =====================================================
//  DATA LAYER
//  คืนค่าเป็น object ที่ "แปลงรูปแบบ" ให้ตรงกับที่ app.js ใช้งานอยู่
// =====================================================

// แปลง row ของ sales จาก DB → รูปแบบที่ app.js ใช้
function mapSaleRow(row) {
  return {
    id:       row.order_no,            // app.js ใช้ sale.id เป็นเลขที่บิลที่แสดง
    rowId:    row.id,                  // id จริงใน DB (ใช้ตอนลบ)
    date:     new Date(row.sold_at).toLocaleString('th-TH'),
    dateObj:  row.sold_at,             // ISO string — parseSaleDate รองรับ
    items:    row.items || [],
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    grand:    Number(row.grand),
    cash:     Number(row.cash),
    change:   Number(row.change),
  };
}

const _db = {
  // ---------- CATEGORIES ----------
  async getCategories() {
    const { data, error } = await sb
      .from('categories')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return data.map(c => ({ id: c.id, name: c.name, emoji: c.emoji }));
  },

  async addCategory({ name, emoji }) {
    const { data, error } = await sb
      .from('categories')
      .insert({ name, emoji })
      .select()
      .single();
    if (error) throw error;
    return { id: data.id, name: data.name, emoji: data.emoji };
  },

  async updateCategory(id, { name, emoji }) {
    const { error } = await sb
      .from('categories')
      .update({ name, emoji })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteCategory(id) {
    const { error } = await sb.from('categories').delete().eq('id', id);
    if (error) throw error;
  },

  // ---------- PRODUCTS ----------
  async getProducts() {
    const { data, error } = await sb
      .from('products')
      .select('*')
      .order('id', { ascending: true });
    if (error) throw error;
    return data.map(p => ({
      id: p.id, name: p.name, category: p.category,
      price: Number(p.price), emoji: p.emoji, active: p.active,
      image_url: p.image_url || null,
    }));
  },

  async addProduct({ name, category, price, emoji, active, image_url }) {
    const { data, error } = await sb
      .from('products')
      .insert({ name, category, price, emoji, active, image_url: image_url || null })
      .select()
      .single();
    if (error) throw error;
    return {
      id: data.id, name: data.name, category: data.category,
      price: Number(data.price), emoji: data.emoji, active: data.active,
      image_url: data.image_url || null,
    };
  },

  async updateProduct(id, { name, category, price, emoji, active, image_url }) {
    const { error } = await sb
      .from('products')
      .update({ name, category, price, emoji, active, image_url: image_url || null })
      .eq('id', id);
    if (error) throw error;
  },

  async deleteProduct(id) {
    const { error } = await sb.from('products').delete().eq('id', id);
    if (error) throw error;
  },

  // เปลี่ยนชื่อหมวดหมู่ของสินค้าทั้งหมดที่อยู่ในหมวดเดิม (bulk)
  async renameProductsCategory(oldName, newName) {
    const { error } = await sb
      .from('products')
      .update({ category: newName })
      .eq('category', oldName);
    if (error) throw error;
  },

  // ---------- IMAGE STORAGE ----------
  // อัปโหลดรูปสินค้าไป bucket 'product-images' แล้วคืน public URL + path
  async uploadProductImage(file) {
    const ext  = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await sb.storage
      .from('product-images')
      .upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || undefined,
      });
    if (error) throw error;

    const { data } = sb.storage.from('product-images').getPublicUrl(path);
    return { url: data.publicUrl, path };
  },

  // ลบรูปออกจาก storage (รับได้ทั้ง public URL หรือ path)
  async deleteProductImage(urlOrPath) {
    if (!urlOrPath) return;
    const marker = '/product-images/';
    let path = urlOrPath;
    const idx = urlOrPath.indexOf(marker);
    if (idx !== -1) path = urlOrPath.slice(idx + marker.length);
    const { error } = await sb.storage.from('product-images').remove([path]);
    if (error) console.warn('ลบรูปไม่สำเร็จ:', error.message);
  },

  // ---------- SALES ----------
  async getSales() {
    const { data, error } = await sb
      .from('sales')
      .select('*')
      .order('sold_at', { ascending: false });
    if (error) throw error;
    return data.map(mapSaleRow);
  },

  async addSale(sale) {
    const { data, error } = await sb
      .from('sales')
      .insert({
        order_no: sale.id,
        sold_at:  sale.dateObj || new Date().toISOString(),
        items:    sale.items,
        subtotal: sale.subtotal,
        discount: sale.discount,
        grand:    sale.grand,
        cash:     sale.cash,
        change:   sale.change,
      })
      .select()
      .single();
    if (error) throw error;
    return mapSaleRow(data);
  },

  async countSales() {
    const { count, error } = await sb
      .from('sales')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count || 0;
  },

  async clearSales() {
    // ลบทุกแถว (id > 0 ครอบคลุมทั้งหมดเพราะ identity เริ่มที่ 1)
    const { error } = await sb.from('sales').delete().gt('id', 0);
    if (error) throw error;
  },
};

// =====================================================
//  AUTH LAYER (ฝั่ง Admin)
//  ใช้ตาราง public.users เอง (username + password) ผ่าน RPC verify_login
//  session เก็บฝั่ง client ใน sessionStorage (หายเมื่อปิดแท็บ)
// =====================================================

const SESSION_KEY = 'aq_user_session';
const _authListeners = [];

function _loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; }
  catch { return null; }
}

function _saveSession(user) {
  if (user) sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else      sessionStorage.removeItem(SESSION_KEY);
  // แจ้งผู้ฟังทุกคน
  _authListeners.forEach(cb => { try { cb(user); } catch (e) { console.error(e); } });
}

const _auth = {
  // login ด้วย username + password → เรียก RPC verify_login
  // คืน user { id, username, role } ถ้าสำเร็จ, โยน error ถ้าไม่สำเร็จ
  async signIn(username, password) {
    const { data, error } = await sb.rpc('verify_login', {
      p_username: String(username).trim().toLowerCase(),
      p_password: password,
    });
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('INVALID_CREDENTIALS');
    }
    const user = data[0]; // { id, username, role }
    _saveSession(user);
    return user;
  },

  async signOut() {
    _saveSession(null);
  },

  // session = user object หรือ null
  getSession() {
    return _loadSession();
  },

  getUser() {
    return _loadSession();
  },

  // profile ก็คือ user object เอง (มี role อยู่แล้ว)
  getProfile() {
    return _loadSession();
  },

  isAdmin() {
    const u = _loadSession();
    return u?.role === 'admin';
  },

  // callback(user|null) จะถูกเรียกเมื่อ login/logout
  onChange(callback) {
    _authListeners.push(callback);
  },
};

// ให้ app.js เข้าถึงได้
window.aqDB   = _db;
window.aqAuth = _auth;
window.aqClient = sb;
