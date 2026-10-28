/* ===================================================
   AquaShop POS — app.js
   =================================================== */

// ─── State (โหลดจาก Supabase) ───────────────────────
// db และ auth มาจาก supabase.js (window.aqDB / window.aqAuth)
const db   = window.aqDB;
const auth = window.aqAuth;

let products   = [];
let categories = [];
let cart       = [];
let sales      = [];
let activeCategory = 'ทั้งหมด';
let isAdminAuthed  = false;   // login แล้ว + เป็น admin
let currentProfile = null;    // profile ของผู้ใช้ปัจจุบัน (เก็บ role)
let paymentMethod  = 'cash';  // 'cash' | 'promptpay'
let appSettings    = {};      // { shop_name, promptpay_id, promptpay_name }

// ─── โหลดข้อมูลหลักจาก Supabase ──────────────────────
async function loadCoreData() {
  try {
    [products, categories, appSettings] = await Promise.all([
      db.getProducts(),
      db.getCategories(),
      db.getSettings().catch(() => ({})),  // settings ไม่พังทั้งแอปถ้า error
    ]);
  } catch (err) {
    console.error('โหลดข้อมูลไม่สำเร็จ:', err);
    showToast('เชื่อมต่อฐานข้อมูลไม่สำเร็จ', 'error');
  }
}

// โหลดประวัติการขาย (ใช้ในหน้า Admin)
async function loadSales() {
  try {
    sales = await db.getSales();
  } catch (err) {
    console.error('โหลดประวัติการขายไม่สำเร็จ:', err);
    showToast('โหลดประวัติการขายไม่สำเร็จ', 'error');
  }
}

// ─── Page Navigation ─────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`${page}Page`).classList.add('active');
  const navBtn = document.getElementById(`nav${page.charAt(0).toUpperCase() + page.slice(1)}`);
  if (navBtn) navBtn.classList.add('active');

  // close mobile cart drawer on page change
  if (typeof toggleCart === 'function') toggleCart(false);

  if (page === 'admin') {
    // ต้องเข้าสู่ระบบ + เป็น admin ถึงจะเห็นเนื้อหา Admin
    if (!isAdminAuthed) {
      // login แล้วแต่ไม่ใช่ admin → แจ้งว่าไม่มีสิทธิ์
      const msg = currentProfile && currentProfile.role !== 'admin'
        ? 'บัญชีนี้ไม่มีสิทธิ์เข้าถึง Admin panel (ต้องเป็นผู้ดูแลระบบ)'
        : '';
      showLoginGate(msg);
      return;
    }
    showAdminContent();
    loadAdminData();
  }
  if (page === 'pos') {
    renderCategoryTabs();
    renderProducts();
  }
}

// โหลดข้อมูลฝั่ง Admin (ประวัติการขาย) แล้ว render ทุกส่วน
async function loadAdminData() {
  await loadSales();
  renderAdminTable();
  renderSalesTable();
  renderCategoryGrid();
  updateStats();
  renderReports();
  loadPaymentSettingsForm();
}

// ─── Payment Settings (หลังบ้าน) ─────────────────────
// เติมค่า settings ปัจจุบันลงในฟอร์ม + สร้าง QR ตัวอย่าง
function loadPaymentSettingsForm() {
  const idEl   = document.getElementById('setPromptpayId');
  const nameEl = document.getElementById('setPromptpayName');
  if (!idEl) return;
  idEl.value   = appSettings.promptpay_id   || '';
  nameEl.value = appSettings.promptpay_name || '';
  renderSettingsQrPreview();
}

// สร้าง QR ตัวอย่างในหน้าตั้งค่า (ยอด 0 = QR แบบไม่ล็อกยอด)
function renderSettingsQrPreview() {
  const id       = document.getElementById('setPromptpayId').value.trim();
  const holder   = document.getElementById('setQrPreview');
  const hint     = document.getElementById('setQrHint');
  if (!id) {
    holder.innerHTML = '';
    hint.textContent = 'กรอกเบอร์แล้วกด "บันทึก" เพื่อสร้าง QR';
    return;
  }
  try {
    const payload = window.aqPromptPay(id, null); // static QR
    renderQRInto('setQrPreview', payload, 180);
    hint.textContent = 'QR นี้จะใช้รับเงินในหน้าขาย';
  } catch (err) {
    console.error(err);
    hint.textContent = 'เบอร์ไม่ถูกต้อง';
  }
}

async function savePaymentSettings() {
  const id   = document.getElementById('setPromptpayId').value.trim();
  const name = document.getElementById('setPromptpayName').value.trim();
  const digits = id.replace(/\D/g, '');

  if (id && digits.length !== 10 && digits.length !== 13) {
    showToast('เบอร์ต้อง 10 หลัก หรือเลขบัตร 13 หลัก', 'error');
    return;
  }

  try {
    await db.saveSettings({ promptpay_id: id, promptpay_name: name });
    appSettings.promptpay_id   = id;
    appSettings.promptpay_name = name;
  } catch (err) {
    console.error(err);
    showToast('บันทึกการตั้งค่าไม่สำเร็จ', 'error');
    return;
  }

  renderSettingsQrPreview();
  updateCheckoutButton();
  showToast('บันทึกการตั้งค่าแล้ว', 'success');
}

// ─── Clock ───────────────────────────────────────────
function updateClock() {
  const now  = new Date();
  const days = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  const dateStr = `${days[now.getDay()]} ${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()+543}`;
  const timeStr = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('currentDate').textContent = dateStr;
  document.getElementById('currentTime').textContent = timeStr;
}

// ─── Categories ──────────────────────────────────────
function getCategories() {
  // Return names from managed categories array (keeps order consistent)
  return ['ทั้งหมด', ...categories.map(c => c.name)];
}

// sync <select> in product modal with current categories
function syncCategoryDropdown(selectedValue = '') {
  const sel = document.getElementById('productCategory');
  sel.innerHTML = '<option value="">-- เลือกหมวดหมู่ --</option>' +
    categories.map(c =>
      `<option value="${c.name}" ${c.name === selectedValue ? 'selected' : ''}>${c.emoji} ${c.name}</option>`
    ).join('');
}

function renderCategoryTabs() {
  const wrap = document.getElementById('categoryTabs');
  wrap.innerHTML = '';
  getCategories().forEach(cat => {
    const btn = document.createElement('button');
    btn.className = `cat-tab${cat === activeCategory ? ' active' : ''}`;
    btn.textContent = cat === 'ทั้งหมด' ? `🏪 ${cat}` : cat;
    btn.onclick = () => { activeCategory = cat; renderCategoryTabs(); renderProducts(); };
    wrap.appendChild(btn);
  });
}

// ─── Product Grid ────────────────────────────────────
function getFilteredProducts() {
  const query = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
  return products.filter(p => {
    const matchCat   = activeCategory === 'ทั้งหมด' || p.category === activeCategory;
    const matchQuery = !query || p.name.toLowerCase().includes(query) || p.category.toLowerCase().includes(query);
    return matchCat && matchQuery;
  });
}

function renderProducts() {
  const grid = document.getElementById('productGrid');
  const list = getFilteredProducts();
  if (list.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--gray-400)">
      <i class="fas fa-search" style="font-size:2rem;display:block;margin-bottom:8px"></i>ไม่พบสินค้า
    </div>`;
    return;
  }
  grid.innerHTML = list.map(p => `
    <div class="product-card${!p.active ? ' out-of-stock' : ''}" onclick="${p.active ? `addToCart(${p.id})` : ''}">
      ${p.image_url
        ? `<div class="product-img-wrap"><img class="product-img" src="${p.image_url}" alt="${p.name}" loading="lazy" /></div>`
        : `<span class="product-emoji">${p.emoji}</span>`}
      <div class="product-name">${p.name}</div>
      <div class="product-category-badge">${p.category}</div>
      <div class="product-price">฿${formatNum(p.price)}</div>
      ${p.active ? '<div class="add-to-cart-icon"><i class="fas fa-plus"></i></div>' : '<div style="font-size:0.75rem;color:var(--gray-400);margin-top:4px">หมดสต็อก</div>'}
    </div>
  `).join('');
}

function filterProducts() {
  renderProducts();
}

// ─── Cart ────────────────────────────────────────────
function addToCart(productId) {
  const product = products.find(p => p.id === productId);
  if (!product || !product.active) return;
  const existing = cart.find(c => c.id === productId);
  if (existing) {
    existing.qty++;
  } else {
    cart.push({ id: product.id, name: product.name, emoji: product.emoji, price: product.price, qty: 1 });
  }
  renderCart();
  showToast(`เพิ่ม ${product.name} ลงตะกร้าแล้ว`, 'success');
}

function changeQty(productId, delta) {
  const item = cart.find(c => c.id === productId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) cart = cart.filter(c => c.id !== productId);
  renderCart();
}

function clearCart() {
  if (cart.length === 0) return;
  cart = [];
  document.getElementById('discountInput').value = '';
  document.getElementById('cashInput').value = '';
  renderCart();
  showToast('ล้างตะกร้าแล้ว');
}

// ─── Mobile Cart Drawer ──────────────────────────────
function toggleCart(open) {
  const section  = document.getElementById('cartSection');
  const backdrop = document.getElementById('cartBackdrop');
  const fab      = document.getElementById('cartFab');
  if (open) {
    section.classList.add('open');
    backdrop.classList.add('open');
    fab.classList.add('hidden');
    document.body.style.overflow = 'hidden';
  } else {
    section.classList.remove('open');
    backdrop.classList.remove('open');
    fab.classList.remove('hidden');
    document.body.style.overflow = '';
  }
}

function updateCartFab() {
  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const fab      = document.getElementById('cartFab');
  const count    = document.getElementById('fabCount');
  if (count) count.textContent = totalQty;
  // Hide FAB entirely when empty for a cleaner look
  if (fab) fab.style.display = totalQty > 0 ? '' : '';
}

function renderCart() {
  const wrap = document.getElementById('cartItems');
  if (cart.length === 0) {
    wrap.innerHTML = `<div class="empty-cart"><i class="fas fa-shopping-cart"></i><p>ยังไม่มีสินค้า</p></div>`;
  } else {
    wrap.innerHTML = cart.map(item => `
      <div class="cart-item">
        <span class="cart-item-emoji">${item.emoji}</span>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">฿${formatNum(item.price)} / ชิ้น</div>
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
          <span class="qty-display">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty(${item.id}, +1)">+</button>
        </div>
        <div class="cart-item-total">฿${formatNum(item.price * item.qty)}</div>
      </div>
    `).join('');
  }
  updateCart();
}

function updateCart() {
  const subtotal  = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discount  = parseFloat(document.getElementById('discountInput')?.value) || 0;
  const grand     = Math.max(0, subtotal - discount);
  const totalQty  = cart.reduce((s, i) => s + i.qty, 0);

  document.getElementById('totalItems').textContent  = `${totalQty} รายการ`;
  document.getElementById('subtotal').textContent    = `฿${formatNum(subtotal)}`;
  document.getElementById('grandTotal').textContent  = `฿${formatNum(grand)}`;

  // Quick amount buttons
  buildQuickAmounts(grand);
  calcChange();
  updateCartFab();

  // อัปเดต QR PromptPay ถ้าอยู่โหมดนั้น
  if (paymentMethod === 'promptpay') renderPromptPayQR(grand);

  updateCheckoutButton();
}

// เปิด/ปิดปุ่มชำระเงิน ตามวิธีชำระที่เลือก
function updateCheckoutButton() {
  const btn = document.getElementById('checkoutBtn');
  if (!btn) return;
  if (cart.length === 0) { btn.disabled = true; return; }
  if (paymentMethod === 'promptpay') {
    // ต้องตั้งค่า PromptPay ไว้ก่อน
    btn.disabled = !appSettings.promptpay_id;
  } else {
    btn.disabled = false;
  }
}

// ─── Payment Method Switch ───────────────────────────
function setPaymentMethod(method) {
  paymentMethod = method;
  document.getElementById('payCashBtn').classList.toggle('active', method === 'cash');
  document.getElementById('payQrBtn').classList.toggle('active', method === 'promptpay');
  document.getElementById('cashPane').style.display = method === 'cash' ? '' : 'none';
  document.getElementById('qrPane').style.display   = method === 'promptpay' ? '' : 'none';

  if (method === 'promptpay') {
    const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
    const discount = parseFloat(document.getElementById('discountInput')?.value) || 0;
    renderPromptPayQR(Math.max(0, subtotal - discount));
  }
  updateCheckoutButton();
}

// ─── Render PromptPay QR ─────────────────────────────
function renderPromptPayQR(amount) {
  const box    = document.getElementById('promptpayBox');
  const empty  = document.getElementById('ppEmpty');
  const ppId   = appSettings.promptpay_id;

  if (!ppId) {
    box.style.display   = 'none';
    empty.style.display = 'block';
    return;
  }
  box.style.display   = '';
  empty.style.display = 'none';

  document.getElementById('ppAmount').textContent = `฿${formatNum(amount)}`;
  document.getElementById('ppName').textContent   = appSettings.promptpay_name || '';

  try {
    const payload = window.aqPromptPay(ppId, amount > 0 ? amount : null);
    renderQRInto('ppQrCanvas', payload, 200);
  } catch (err) {
    console.error('สร้าง QR ไม่สำเร็จ:', err);
  }
}

// สร้าง QR ลงใน element (ใช้ qrcodejs — ล้างของเดิมก่อนทุกครั้ง)
function renderQRInto(elementId, payload, size) {
  const el = document.getElementById(elementId);
  if (!el || !window.QRCode) return;
  el.innerHTML = '';
  new window.QRCode(el, {
    text: payload,
    width: size,
    height: size,
    correctLevel: window.QRCode.CorrectLevel.M,
  });
}

function buildQuickAmounts(grand) {
  const wrap = document.getElementById('quickAmounts');
  const roundings = [10, 20, 50, 100];
  const suggestions = [];
  if (grand > 0) {
    suggestions.push(grand); // exact
    roundings.forEach(r => {
      const rounded = Math.ceil(grand / r) * r;
      if (rounded !== grand && !suggestions.includes(rounded)) suggestions.push(rounded);
    });
  } else {
    suggestions.push(20, 50, 100, 500, 1000);
  }
  wrap.innerHTML = suggestions.slice(0, 5).map(amt => `
    <button class="quick-amt-btn" onclick="setCash(${amt})">฿${formatNum(amt)}</button>
  `).join('');
}

function setCash(amt) {
  document.getElementById('cashInput').value = amt;
  calcChange();
}

function calcChange() {
  const discount = parseFloat(document.getElementById('discountInput')?.value) || 0;
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const grand    = Math.max(0, subtotal - discount);
  const cash     = parseFloat(document.getElementById('cashInput')?.value) || 0;
  const change   = cash - grand;

  const el = document.getElementById('changeAmount');
  if (change >= 0) {
    el.textContent = `฿${formatNum(change)}`;
    el.style.color = 'var(--green)';
  } else if (cash > 0) {
    el.textContent = `ขาดอีก ฿${formatNum(Math.abs(change))}`;
    el.style.color = 'var(--red-light)';
  } else {
    el.textContent = '฿0.00';
    el.style.color = 'var(--green)';
  }
}

// ─── Numpad (รับเงิน) ────────────────────────────────
let numpadValue = '';

function currentGrand() {
  const discount = parseFloat(document.getElementById('discountInput')?.value) || 0;
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  return Math.max(0, subtotal - discount);
}

function openNumpad() {
  if (cart.length === 0) { showToast('ยังไม่มีสินค้าในตะกร้า', 'error'); return; }
  // เริ่มจากค่าที่มีอยู่ในช่อง (ถ้ามี)
  const existing = document.getElementById('cashInput').value;
  numpadValue = existing && parseFloat(existing) > 0 ? String(parseFloat(existing)) : '';
  buildNumpadQuick();
  renderNumpad();
  document.getElementById('numpadModal').classList.add('open');
}

function closeNumpad(e) {
  if (!e || e.target.id === 'numpadModal') {
    document.getElementById('numpadModal').classList.remove('open');
  }
}

// ปุ่มลัดจำนวนเงิน (เหมือน quick amounts แต่อยู่ใน numpad)
function buildNumpadQuick() {
  const grand = currentGrand();
  const wrap  = document.getElementById('numpadQuick');
  const roundings = [10, 20, 50, 100, 500, 1000];
  const list = [];
  if (grand > 0) {
    list.push(grand); // พอดี
    roundings.forEach(r => {
      const v = Math.ceil(grand / r) * r;
      if (v !== grand && !list.includes(v)) list.push(v);
    });
  }
  wrap.innerHTML = list.slice(0, 4).map((amt, i) =>
    `<button class="numpad-quick-btn" onclick="numpadSetExact(${amt})">${i === 0 ? 'พอดี ' : ''}฿${formatNum(amt)}</button>`
  ).join('');
}

function numpadSetExact(amt) {
  numpadValue = String(amt);
  renderNumpad();
}

function numpadPress(ch) {
  if (ch === '.') {
    if (numpadValue.includes('.')) return;
    if (numpadValue === '') numpadValue = '0';
    numpadValue += '.';
  } else {
    // จำกัดทศนิยม 2 ตำแหน่ง
    if (numpadValue.includes('.') && numpadValue.split('.')[1].length >= 2) return;
    if (numpadValue === '0') numpadValue = ch; // แทนที่ 0 นำหน้า
    else numpadValue += ch;
  }
  renderNumpad();
}

function numpadBackspace() {
  numpadValue = numpadValue.slice(0, -1);
  renderNumpad();
}

function numpadClear() {
  numpadValue = '';
  renderNumpad();
}

function renderNumpad() {
  const grand  = currentGrand();
  const cash   = parseFloat(numpadValue) || 0;
  const change = cash - grand;

  document.getElementById('numpadDisplay').textContent = numpadValue === '' ? '0' : numpadValue;
  document.getElementById('numpadDue').textContent     = `฿${formatNum(grand)}`;

  const chEl = document.getElementById('numpadChange');
  if (change >= 0) {
    chEl.textContent = `฿${formatNum(change)}`;
    chEl.style.color = 'var(--green)';
  } else {
    chEl.textContent = `ขาดอีก ฿${formatNum(Math.abs(change))}`;
    chEl.style.color = 'var(--red-light)';
  }
}

function numpadConfirm() {
  const cash = parseFloat(numpadValue) || 0;
  document.getElementById('cashInput').value = cash > 0 ? cash : '';
  calcChange();
  closeNumpad();
}

// ─── Checkout ────────────────────────────────────────
async function checkout() {
  if (cart.length === 0) { showToast('ยังไม่มีสินค้าในตะกร้า', 'error'); return; }
  const discount = parseFloat(document.getElementById('discountInput')?.value) || 0;
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const grand    = Math.max(0, subtotal - discount);

  // เงินที่รับ: โหมดเงินสดใช้ค่าจากช่อง, โหมด PromptPay ถือว่าโอนเต็มจำนวน
  let cash, change;
  if (paymentMethod === 'promptpay') {
    if (!appSettings.promptpay_id) { showToast('ยังไม่ได้ตั้งค่า PromptPay', 'error'); return; }
    cash   = grand;
    change = 0;
  } else {
    cash = parseFloat(document.getElementById('cashInput')?.value) || 0;
    if (cash < grand) { showToast('รับเงินไม่เพียงพอ', 'error'); return; }
    change = cash - grand;
  }

  const btn = document.getElementById('checkoutBtn');
  if (btn) btn.disabled = true;

  const now = new Date();
  let sale = {
    id:      `ORD-${String(Date.now()).slice(-6)}`, // ค่าชั่วคราวกันพัง ถ้า DB ล่ม
    date:    now.toLocaleString('th-TH'),
    dateObj: now.toISOString(),
    items:   [...cart],
    subtotal,
    discount,
    grand,
    cash,
    change,
    payment_method: paymentMethod,
  };

  try {
    // สร้างเลขที่บิลแบบเรียงจากจำนวนบิลใน DB
    const total = await db.countSales();
    sale.id = `ORD-${String(total + 1).padStart(4, '0')}`;
    const saved = await db.addSale(sale);
    sale = saved; // ใช้ข้อมูลที่ DB คืนกลับมา
  } catch (err) {
    console.error(err);
    showToast('บันทึกการขายไม่สำเร็จ', 'error');
    if (btn) btn.disabled = false;
    return;
  }

  toggleCart(false);   // close mobile drawer if open
  showReceipt(sale);

  cart = [];
  document.getElementById('discountInput').value = '';
  document.getElementById('cashInput').value = '';
  setPaymentMethod('cash');   // รีเซ็ตกลับโหมดเงินสด
  renderCart();
  showToast(`ชำระเงินสำเร็จ ${sale.id}`, 'success');
}

// ─── Receipt ─────────────────────────────────────────
function showReceipt(sale) {
  const content = document.getElementById('receiptContent');
  content.innerHTML = `
    <div id="receiptPrint" class="receipt-content">
      <div class="receipt-shop">
        <h2>💧 AquaShop</h2>
        <p>ร้านน้ำดื่ม ครบครัน ราคาดี</p>
        <p>โทร: 02-xxx-xxxx</p>
      </div>
      <hr class="receipt-divider" />
      <div style="font-size:0.8rem;color:var(--gray-500);margin-bottom:6px">
        <div>เลขที่: <strong>${sale.id}</strong></div>
        <div>วันที่: ${sale.date}</div>
      </div>
      <hr class="receipt-divider" />
      <div class="receipt-items">
        ${sale.items.map(item => `
          <div class="receipt-item">
            <div class="receipt-item-left">${item.emoji} ${item.name}<br><small style="color:var(--gray-400)">${item.qty} x ฿${formatNum(item.price)}</small></div>
            <div class="receipt-item-right">฿${formatNum(item.price * item.qty)}</div>
          </div>
        `).join('')}
      </div>
      <hr class="receipt-divider" />
      <div class="receipt-total-section">
        <div class="receipt-total-row"><span>ราคารวม</span><span>฿${formatNum(sale.subtotal)}</span></div>
        ${sale.discount > 0 ? `<div class="receipt-total-row"><span>ส่วนลด</span><span>-฿${formatNum(sale.discount)}</span></div>` : ''}
        <div class="receipt-grand-row"><span>ยอดชำระ</span><span>฿${formatNum(sale.grand)}</span></div>
        <div class="receipt-total-row"><span>วิธีชำระ</span><span>${sale.payment_method === 'promptpay' ? 'PromptPay' : 'เงินสด'}</span></div>
        ${sale.payment_method === 'promptpay'
          ? `<div class="receipt-total-row"><span>โอนผ่าน PromptPay</span><span>฿${formatNum(sale.grand)}</span></div>`
          : `<div class="receipt-total-row"><span>รับเงิน</span><span>฿${formatNum(sale.cash)}</span></div>
             <div class="receipt-total-row"><span>เงินทอน</span><span>฿${formatNum(sale.change)}</span></div>`}
      </div>
      <div class="receipt-footer">
        <p>ขอบคุณที่ใช้บริการ 😊</p>
        <p>กรุณาเก็บใบเสร็จไว้เป็นหลักฐาน</p>
      </div>
    </div>
  `;
  document.getElementById('receiptModal').classList.add('open');
}

function closeReceiptModal(e) {
  if (!e || e.target.id === 'receiptModal') {
    document.getElementById('receiptModal').classList.remove('open');
  }
}

function printReceipt() {
  window.print();
}

// ─── Admin Table ─────────────────────────────────────
function renderAdminTable(filter = '') {
  const tbody = document.getElementById('adminProductBody');
  const list  = filter
    ? products.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()) || p.category.toLowerCase().includes(filter.toLowerCase()))
    : products;

  tbody.innerHTML = list.map((p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td class="table-emoji">${p.image_url
        ? `<img class="table-img" src="${p.image_url}" alt="${p.name}" loading="lazy" />`
        : p.emoji}</td>
      <td><strong>${p.name}</strong></td>
      <td><span class="table-category">${p.category}</span></td>
      <td><strong style="color:var(--red-primary)">฿${formatNum(p.price)}</strong></td>
      <td>
        <span class="status-badge ${p.active ? 'status-active' : 'status-inactive'}">
          <i class="fas fa-circle" style="font-size:0.5rem"></i>
          ${p.active ? 'พร้อมขาย' : 'ปิดขาย'}
        </span>
      </td>
      <td>
        <button class="action-btn btn-edit" onclick="openProductModal(${p.id})">
          <i class="fas fa-edit"></i> แก้ไข
        </button>
        <button class="action-btn btn-delete" onclick="deleteProduct(${p.id})">
          <i class="fas fa-trash"></i> ลบ
        </button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--gray-400)">ไม่พบสินค้า</td></tr>`;
}

function filterAdminProducts(val) {
  renderAdminTable(val);
}

// ─── Sales Table ─────────────────────────────────────
function renderSalesTable() {
  const tbody = document.getElementById('salesBody');
  if (sales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--gray-400)">ยังไม่มีประวัติการขาย</td></tr>`;
    return;
  }
  tbody.innerHTML = sales.map(s => `
    <tr>
      <td><strong style="color:var(--red-primary)">${s.id}</strong></td>
      <td>${s.date}</td>
      <td>${s.items.map(i => `${i.emoji}${i.name} x${i.qty}`).join(', ')}</td>
      <td><strong>฿${formatNum(s.grand)}</strong></td>
      <td>฿${formatNum(s.cash)}</td>
      <td>฿${formatNum(s.change)}</td>
    </tr>
  `).join('');
}

async function clearHistory() {
  if (!confirm('ต้องการล้างประวัติการขายทั้งหมด?')) return;
  try {
    await db.clearSales();
    sales = [];
  } catch (err) {
    console.error(err);
    showToast('ล้างประวัติไม่สำเร็จ', 'error');
    return;
  }
  renderSalesTable();
  updateStats();
  renderReports();
  showToast('ล้างประวัติแล้ว');
}

// ─── Stats ───────────────────────────────────────────
function updateStats() {
  document.getElementById('statProducts').textContent   = products.length;
  document.getElementById('statCategories').textContent = categories.length;
  const today = new Date().toLocaleDateString('th-TH');
  const todaySales = sales.filter(s => s.date.startsWith(today.slice(0, 8)) || s.date.includes(today.slice(0, 5)));
  document.getElementById('statOrders').textContent  = todaySales.length;
  document.getElementById('statRevenue').textContent = `฿${formatNum(todaySales.reduce((s, x) => s + x.grand, 0))}`;
}

// ─── Category CRUD ───────────────────────────────────

function renderCategoryGrid() {
  const grid = document.getElementById('categoryGrid');
  if (!grid) return;

  if (categories.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--gray-400)">
      <i class="fas fa-tags" style="font-size:2rem;display:block;margin-bottom:8px"></i>
      ยังไม่มีหมวดหมู่ กด "เพิ่มหมวดหมู่" เพื่อเริ่มต้น
    </div>`;
    return;
  }

  grid.innerHTML = categories.map(cat => {
    const count = products.filter(p => p.category === cat.name).length;
    return `
      <div class="category-item">
        <div class="cat-item-emoji">${cat.image_url
          ? `<img class="cat-item-img" src="${cat.image_url}" alt="${cat.name}" loading="lazy" />`
          : cat.emoji}</div>
        <div class="cat-item-info">
          <div class="cat-item-name">${cat.name}</div>
          <div class="cat-item-count">สินค้า <strong>${count}</strong> รายการ</div>
        </div>
        <div class="cat-item-actions">
          <button class="cat-action-btn edit" title="แก้ไข" onclick="openCategoryModal(${cat.id})">
            <i class="fas fa-pen"></i>
          </button>
          <button class="cat-action-btn del" title="ลบ" onclick="deleteCategory(${cat.id})">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ─── Category Image State ────────────────────────────
let catPendingImageFile = null;
let catCurrentImageUrl  = null;
let catImageWasRemoved  = false;

function setCatImagePreview(src) {
  document.getElementById('catImagePreviewImg').src = src;
  document.getElementById('catImagePreviewImg').style.display = 'block';
  document.getElementById('catImagePreviewEmoji').style.display = 'none';
  document.getElementById('catImageRemoveBtn').style.display = 'flex';
}

function clearCatImagePreview() {
  const img = document.getElementById('catImagePreviewImg');
  img.src = '';
  img.style.display = 'none';
  document.getElementById('catImagePreviewEmoji').style.display = 'block';
  document.getElementById('catImageRemoveBtn').style.display = 'none';
  syncCatEmojiPreview();
}

function syncCatEmojiPreview() {
  const img = document.getElementById('catImagePreviewImg');
  if (img.style.display === 'block') return;
  const val = document.getElementById('categoryEmoji').value.trim() || '🏷️';
  document.getElementById('catImagePreviewEmoji').textContent = val;
}

function handleCategoryImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('กรุณาเลือกไฟล์รูปภาพ', 'error'); e.target.value = ''; return; }
  if (file.size > MAX_IMAGE_BYTES) { showToast('รูปใหญ่เกิน 2MB', 'error'); e.target.value = ''; return; }
  catPendingImageFile = file;
  catImageWasRemoved  = false;
  setCatImagePreview(URL.createObjectURL(file));
}

function removeCategoryImage() {
  catPendingImageFile = null;
  catImageWasRemoved  = true;
  document.getElementById('categoryImageInput').value = '';
  clearCatImagePreview();
}

function openCategoryModal(id = null) {
  document.getElementById('categoryName').value  = '';
  document.getElementById('categoryEmoji').value = '🏷️';
  document.getElementById('editCategoryId').value = '';
  document.getElementById('categoryImageInput').value = '';
  document.getElementById('catModalTitle').innerHTML = '<i class="fas fa-plus-circle"></i> เพิ่มหมวดหมู่';

  // reset image state
  catPendingImageFile = null;
  catCurrentImageUrl  = null;
  catImageWasRemoved  = false;

  if (id) {
    const c = categories.find(x => x.id === id);
    if (!c) return;
    document.getElementById('catModalTitle').innerHTML = '<i class="fas fa-edit"></i> แก้ไขหมวดหมู่';
    document.getElementById('editCategoryId').value    = c.id;
    document.getElementById('categoryName').value      = c.name;
    document.getElementById('categoryEmoji').value     = c.emoji;
    catCurrentImageUrl = c.image_url || null;
    if (catCurrentImageUrl) setCatImagePreview(catCurrentImageUrl);
    else clearCatImagePreview();
  } else {
    clearCatImagePreview();
  }
  document.getElementById('categoryModal').classList.add('open');
}

function closeCategoryModal(e) {
  if (!e || e.target.id === 'categoryModal') {
    document.getElementById('categoryModal').classList.remove('open');
  }
}

async function saveCategory() {
  const name   = document.getElementById('categoryName').value.trim();
  const emoji  = document.getElementById('categoryEmoji').value.trim() || '🏷️';
  const editId = document.getElementById('editCategoryId').value;

  if (!name) { showToast('กรุณาระบุชื่อหมวดหมู่', 'error'); return; }

  try {
    // จัดการรูป: อัปโหลดใหม่ / คงเดิม / ลบ
    let imageUrl = catCurrentImageUrl;
    if (catPendingImageFile) {
      const uploaded = await db.uploadProductImage(catPendingImageFile);
      imageUrl = uploaded.url;
      if (editId && catCurrentImageUrl) await db.deleteProductImage(catCurrentImageUrl);
    } else if (catImageWasRemoved) {
      if (editId && catCurrentImageUrl) await db.deleteProductImage(catCurrentImageUrl);
      imageUrl = null;
    }

    if (editId) {
      const idx = categories.findIndex(c => c.id === parseInt(editId));
      if (idx > -1) {
        const oldName = categories[idx].name;
        await db.updateCategory(categories[idx].id, { name, emoji, image_url: imageUrl });
        categories[idx] = { ...categories[idx], name, emoji, image_url: imageUrl };
        // ย้ายสินค้าในหมวดเดิมไปใช้ชื่อใหม่
        if (oldName !== name) {
          await db.renameProductsCategory(oldName, name);
          products.forEach(p => { if (p.category === oldName) p.category = name; });
        }
        showToast(`แก้ไข "${name}" แล้ว`, 'success');
      }
    } else {
      if (categories.find(c => c.name === name)) {
        showToast('หมวดหมู่นี้มีอยู่แล้ว', 'error'); return;
      }
      const created = await db.addCategory({ name, emoji, image_url: imageUrl });
      categories.push(created);
      showToast(`เพิ่มหมวดหมู่ "${name}" แล้ว`, 'success');
    }
  } catch (err) {
    console.error(err);
    showToast('บันทึกหมวดหมู่ไม่สำเร็จ', 'error');
    return;
  }

  closeCategoryModal();
  renderCategoryGrid();
  updateStats();
  // Refresh POS category tabs
  renderCategoryTabs();
  renderProducts();
}

async function deleteCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;

  const count = products.filter(p => p.category === cat.name).length;
  if (count > 0) {
    if (!confirm(`หมวดหมู่ "${cat.name}" มีสินค้าอยู่ ${count} รายการ\nต้องการลบและย้ายสินค้าเหล่านั้นไปที่ "ไม่มีหมวดหมู่" ใช่ไหม?`)) return;
  } else {
    if (!confirm(`ต้องการลบหมวดหมู่ "${cat.name}" ใช่ไหม?`)) return;
  }

  try {
    if (count > 0) {
      await db.renameProductsCategory(cat.name, 'ไม่มีหมวดหมู่');
      products.forEach(p => { if (p.category === cat.name) p.category = 'ไม่มีหมวดหมู่'; });
    }
    await db.deleteCategory(id);
    if (cat.image_url) await db.deleteProductImage(cat.image_url);
    categories = categories.filter(c => c.id !== id);
  } catch (err) {
    console.error(err);
    showToast('ลบหมวดหมู่ไม่สำเร็จ', 'error');
    return;
  }

  renderCategoryGrid();
  renderAdminTable();
  updateStats();
  renderCategoryTabs();
  renderProducts();
  showToast(`ลบหมวดหมู่ "${cat.name}" แล้ว`);
}

function setCatEmoji(emoji) {
  document.getElementById('categoryEmoji').value = emoji;
  syncCatEmojiPreview();
}

// ─── Collapsible Admin Cards ─────────────────────────
function toggleCard(cardId) {
  const card = document.getElementById(cardId);
  if (card) card.classList.toggle('collapsed');
}

// ─── Product Image State (ใช้ภายใน modal) ────────────
let pendingImageFile = null;   // ไฟล์ที่ผู้ใช้เพิ่งเลือก (ยังไม่อัปโหลด)
let currentImageUrl  = null;   // URL รูปปัจจุบันของสินค้าที่กำลังแก้ไข
let imageWasRemoved  = false;  // ผู้ใช้กดลบรูปเดิมหรือไม่

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB

// แสดง preview เป็นรูป
function setImagePreview(src) {
  const img   = document.getElementById('imagePreviewImg');
  const emoji = document.getElementById('imagePreviewEmoji');
  const rm    = document.getElementById('imageRemoveBtn');
  img.src = src;
  img.style.display   = 'block';
  emoji.style.display = 'none';
  rm.style.display    = 'flex';
}

// กลับไปแสดง emoji (เมื่อไม่มีรูป)
function clearImagePreview() {
  const img   = document.getElementById('imagePreviewImg');
  const emoji = document.getElementById('imagePreviewEmoji');
  const rm    = document.getElementById('imageRemoveBtn');
  img.src = '';
  img.style.display   = 'none';
  emoji.style.display = 'block';
  rm.style.display    = 'none';
  syncEmojiPreview();
}

// ให้ emoji ใน preview ตรงกับช่อง emoji (เฉพาะตอนไม่มีรูป)
function syncEmojiPreview() {
  const img = document.getElementById('imagePreviewImg');
  if (img.style.display === 'block') return; // มีรูปอยู่ ไม่ต้องยุ่ง
  const val = document.getElementById('productEmoji').value.trim() || '💧';
  document.getElementById('imagePreviewEmoji').textContent = val;
}

// ผู้ใช้เลือกไฟล์รูป
function handleImageSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('กรุณาเลือกไฟล์รูปภาพ', 'error');
    e.target.value = '';
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    showToast('รูปใหญ่เกิน 2MB กรุณาเลือกรูปที่เล็กกว่า', 'error');
    e.target.value = '';
    return;
  }
  pendingImageFile = file;
  imageWasRemoved  = false;
  setImagePreview(URL.createObjectURL(file));
}

// ผู้ใช้กดลบรูป
function removeProductImage() {
  pendingImageFile = null;
  imageWasRemoved  = true;
  document.getElementById('productImageInput').value = '';
  clearImagePreview();
}

// ─── Product Modal ───────────────────────────────────
function openProductModal(id = null) {
  const modal = document.getElementById('productModal');
  document.getElementById('productName').value     = '';
  document.getElementById('productPrice').value    = '';
  document.getElementById('productEmoji').value    = '💧';
  document.getElementById('productActive').checked = true;
  document.getElementById('editProductId').value   = '';
  document.getElementById('productImageInput').value = '';

  // reset image state
  pendingImageFile = null;
  currentImageUrl  = null;
  imageWasRemoved  = false;

  if (id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    syncCategoryDropdown(p.category);
    document.getElementById('modalTitle').innerHTML  = '<i class="fas fa-edit"></i> แก้ไขสินค้า';
    document.getElementById('editProductId').value   = p.id;
    document.getElementById('productName').value     = p.name;
    document.getElementById('productPrice').value    = p.price;
    document.getElementById('productEmoji').value    = p.emoji;
    document.getElementById('productActive').checked = p.active;
    currentImageUrl = p.image_url || null;
    if (currentImageUrl) setImagePreview(currentImageUrl);
    else clearImagePreview();
  } else {
    syncCategoryDropdown();
    document.getElementById('modalTitle').innerHTML  = '<i class="fas fa-plus-circle"></i> เพิ่มสินค้า';
    clearImagePreview();
  }
  modal.classList.add('open');
}

function closeProductModal(e) {
  if (!e || e.target.id === 'productModal') {
    document.getElementById('productModal').classList.remove('open');
  }
}

async function saveProduct() {
  const name     = document.getElementById('productName').value.trim();
  const price    = parseFloat(document.getElementById('productPrice').value);
  const category = document.getElementById('productCategory').value;
  const emoji    = document.getElementById('productEmoji').value.trim() || '💧';
  const active   = document.getElementById('productActive').checked;
  const editId   = document.getElementById('editProductId').value;

  if (!name)     { showToast('กรุณาระบุชื่อสินค้า', 'error'); return; }
  if (!price || price <= 0) { showToast('กรุณาระบุราคาที่ถูกต้อง', 'error'); return; }
  if (!category) { showToast('กรุณาเลือกหมวดหมู่', 'error'); return; }

  const saveBtn = document.querySelector('#productModal .btn-primary');
  const prevBtnHtml = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังบันทึก...'; }

  try {
    // ── จัดการรูป: อัปโหลดใหม่ / คงเดิม / ลบ ──
    let imageUrl = currentImageUrl;      // ค่าเริ่มต้น = รูปเดิม
    if (pendingImageFile) {
      const uploaded = await db.uploadProductImage(pendingImageFile);
      imageUrl = uploaded.url;
      // ถ้าแก้ไขและมีรูปเดิม ให้ลบรูปเดิมทิ้ง
      if (editId && currentImageUrl) await db.deleteProductImage(currentImageUrl);
    } else if (imageWasRemoved) {
      if (editId && currentImageUrl) await db.deleteProductImage(currentImageUrl);
      imageUrl = null;
    }

    if (editId) {
      const idx = products.findIndex(p => p.id === parseInt(editId));
      if (idx > -1) {
        await db.updateProduct(products[idx].id, { name, price, category, emoji, active, image_url: imageUrl });
        products[idx] = { ...products[idx], name, price, category, emoji, active, image_url: imageUrl };
        showToast(`แก้ไข "${name}" แล้ว`, 'success');
      }
    } else {
      const created = await db.addProduct({ name, price, category, emoji, active, image_url: imageUrl });
      products.push(created);
      showToast(`เพิ่ม "${name}" แล้ว`, 'success');
    }
  } catch (err) {
    console.error(err);
    showToast('บันทึกสินค้าไม่สำเร็จ', 'error');
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = prevBtnHtml; }
    return;
  }

  if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = prevBtnHtml; }
  closeProductModal();
  renderAdminTable();
  updateStats();

  // Refresh POS if category tabs changed
  renderCategoryTabs();
  renderProducts();
}

async function deleteProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`ต้องการลบ "${p.name}" ใช่ไหม?`)) return;
  try {
    await db.deleteProduct(id);
    if (p.image_url) await db.deleteProductImage(p.image_url);
    products = products.filter(x => x.id !== id);
  } catch (err) {
    console.error(err);
    showToast('ลบสินค้าไม่สำเร็จ', 'error');
    return;
  }
  renderAdminTable();
  updateStats();
  renderCategoryTabs();
  renderProducts();
  showToast(`ลบ "${p.name}" แล้ว`);
}

function setEmoji(emoji) {
  document.getElementById('productEmoji').value = emoji;
}

// ─── Utility ─────────────────────────────────────────
function formatNum(num) {
  return Number(num).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

let toastTimer;
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `${icons[type] || '🔔'} ${msg}`;
  toast.className = `toast${type ? ' ' + type : ''} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 2800);
}

// =====================================================
//  REPORT & CHARTS MODULE
// =====================================================

// ─── Report State ─────────────────────────────────────
let currentReport = 'day';
let chartMain = null, chartCategory = null, chartTopProduct = null, chartOrders = null;

// ─── Switch Report Period ─────────────────────────────
function switchReport(period) {
  currentReport = period;
  document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab${period.charAt(0).toUpperCase() + period.slice(1)}`).classList.add('active');
  renderReports();
}

// ─── Parse Sale Date ──────────────────────────────────
function parseSaleDate(sale) {
  if (sale.dateObj) return new Date(sale.dateObj);
  const parts = sale.date.match(/(\d+)\/(\d+)\/(\d+)\s+(\d+):(\d+)/);
  if (!parts) return new Date();
  const [, d, m, y, hr, min] = parts.map(Number);
  return new Date(y - 543, m - 1, d, hr, min);
}

// ─── Get Sales in Period ──────────────────────────────
function getSalesInPeriod(period) {
  const now = new Date();
  return sales.filter(s => {
    const sd = parseSaleDate(s);
    if (period === 'day') {
      return sd.getFullYear() === now.getFullYear() &&
             sd.getMonth()    === now.getMonth()    &&
             sd.getDate()     === now.getDate();
    }
    if (period === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 6);
      weekAgo.setHours(0, 0, 0, 0);
      return sd >= weekAgo && sd <= now;
    }
    if (period === 'year') {
      return sd.getFullYear() === now.getFullYear();
    }
    return false;
  });
}

// ─── Render All Reports ───────────────────────────────
function renderReports() {
  const periodSales = getSalesInPeriod(currentReport);
  const revenue     = periodSales.reduce((s, x) => s + x.grand, 0);
  const orders      = periodSales.length;
  const avg         = orders > 0 ? revenue / orders : 0;

  document.getElementById('kpiRevenue').textContent = `฿${formatNum(revenue)}`;
  document.getElementById('kpiOrders').textContent  = orders.toLocaleString('th-TH');
  document.getElementById('kpiAvg').textContent     = `฿${formatNum(avg)}`;
  document.getElementById('kpiBest').textContent    = getBestPeriodLabel(periodSales, currentReport);

  const titles = {
    day:  'ยอดขายรายชั่วโมง (วันนี้)',
    week: 'ยอดขายรายวัน (7 วันล่าสุด)',
    year: 'ยอดขายรายเดือน (ปีนี้)',
  };
  document.getElementById('mainChartTitle').textContent = titles[currentReport];

  renderMainChart(periodSales);
  renderCategoryChart(periodSales);
  renderTopProductChart(periodSales);
  renderOrdersChart(periodSales);
}

// ─── Best Period Label ────────────────────────────────
function getBestPeriodLabel(periodSales, period) {
  if (periodSales.length === 0) return '—';
  const buckets = {};
  const thDays   = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  periodSales.forEach(s => {
    const sd = parseSaleDate(s);
    let key;
    if (period === 'day')  key = `${sd.getHours()}:00 น.`;
    if (period === 'week') key = `${thDays[sd.getDay()]} ${sd.getDate()}/${sd.getMonth() + 1}`;
    if (period === 'year') key = thMonths[sd.getMonth()];
    buckets[key] = (buckets[key] || 0) + s.grand;
  });

  const best = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
  return best ? `${best[0]} (฿${formatNum(best[1])})` : '—';
}

// ─── Chart Colors ─────────────────────────────────────
const CHART_COLORS = {
  red: 'rgba(192,57,43,1)',
  palette: [
    '#c0392b','#e67e22','#27ae60','#2980b9','#8e44ad',
    '#f39c12','#16a085','#d35400','#2c3e50','#7f8c8d',
  ],
};

function getGradient(ctx, color1, color2) {
  const grad = ctx.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, color1);
  grad.addColorStop(1, color2);
  return grad;
}

// ─── Main Revenue Chart ───────────────────────────────
function renderMainChart(periodSales) {
  const ctx = document.getElementById('mainChart').getContext('2d');
  if (chartMain) { chartMain.destroy(); chartMain = null; }

  const { labels, revenue } = getChartBuckets(periodSales);
  const grad = getGradient(ctx, 'rgba(192,57,43,0.3)', 'rgba(192,57,43,0.01)');
  const isBar = currentReport === 'year';

  chartMain = new Chart(ctx, {
    type: isBar ? 'bar' : 'line',
    data: {
      labels,
      datasets: [{
        label: 'ยอดขาย (฿)',
        data: revenue,
        borderColor: CHART_COLORS.red,
        backgroundColor: isBar ? 'rgba(192,57,43,0.75)' : grad,
        borderWidth: 2.5,
        fill: !isBar,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#fff',
        pointBorderColor: CHART_COLORS.red,
        pointBorderWidth: 2,
        borderRadius: isBar ? 6 : 0,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(31,41,55,0.92)',
          padding: 10,
          titleFont: { family: 'Sarabun', size: 13, weight: '600' },
          bodyFont:  { family: 'Sarabun', size: 12 },
          callbacks: { label: c => ` ฿${formatNum(c.raw)}` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { font: { family: 'Sarabun', size: 11 }, color: '#6b7280', maxRotation: 45 },
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: {
            font: { family: 'Sarabun', size: 11 }, color: '#6b7280',
            callback: v => `฿${Number(v).toLocaleString('th-TH')}`,
          },
        },
      },
    },
  });
}

// ─── Category Pie Chart ───────────────────────────────
function renderCategoryChart(periodSales) {
  const ctx = document.getElementById('categoryChart').getContext('2d');
  if (chartCategory) { chartCategory.destroy(); chartCategory = null; }

  const catMap = {};
  periodSales.forEach(s => {
    s.items.forEach(item => {
      const prod = products.find(p => p.id === item.id);
      if (!prod) return;
      catMap[prod.category] = (catMap[prod.category] || 0) + item.price * item.qty;
    });
  });

  const labels = Object.keys(catMap);
  const data   = Object.values(catMap);
  const total  = data.reduce((a, b) => a + b, 0);

  if (data.length === 0) {
    chartCategory = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: ['ไม่มีข้อมูล'], datasets: [{ data: [1], backgroundColor: ['#e5e7eb'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } },
    });
    return;
  }

  chartCategory = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: CHART_COLORS.palette.slice(0, labels.length),
        borderWidth: 2,
        borderColor: '#fff',
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { font: { family: 'Sarabun', size: 10 }, padding: 8, usePointStyle: true },
        },
        tooltip: {
          backgroundColor: 'rgba(31,41,55,0.92)',
          padding: 10,
          titleFont: { family: 'Sarabun', size: 12 },
          bodyFont:  { family: 'Sarabun', size: 11 },
          callbacks: { label: c => ` ฿${formatNum(c.raw)} (${((c.raw / total) * 100).toFixed(1)}%)` },
        },
      },
    },
  });
}

// ─── Top 5 Products Bar Chart ─────────────────────────
function renderTopProductChart(periodSales) {
  const ctx = document.getElementById('topProductChart').getContext('2d');
  if (chartTopProduct) { chartTopProduct.destroy(); chartTopProduct = null; }

  const prodMap = {};
  periodSales.forEach(s => {
    s.items.forEach(item => {
      prodMap[item.name] = (prodMap[item.name] || 0) + item.qty;
    });
  });

  const sorted = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const labels = sorted.map(([name]) => name.length > 14 ? name.slice(0, 13) + '…' : name);
  const data   = sorted.map(([, qty]) => qty);

  chartTopProduct = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'จำนวนชิ้น',
        data,
        backgroundColor: CHART_COLORS.palette.slice(0, 5),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(31,41,55,0.92)',
          padding: 10,
          titleFont: { family: 'Sarabun', size: 12 },
          bodyFont:  { family: 'Sarabun', size: 11 },
          callbacks: { label: c => ` ${c.raw} ชิ้น` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { font: { family: 'Sarabun', size: 11 }, color: '#6b7280' },
        },
        y: {
          grid: { display: false },
          ticks: { font: { family: 'Sarabun', size: 11 }, color: '#374151' },
        },
      },
    },
  });
}

// ─── Orders Count Chart ───────────────────────────────
function renderOrdersChart(periodSales) {
  const ctx = document.getElementById('ordersChart').getContext('2d');
  if (chartOrders) { chartOrders.destroy(); chartOrders = null; }

  const { labels, ordersData } = getChartBuckets(periodSales);
  const grad = getGradient(ctx, 'rgba(142,68,173,0.35)', 'rgba(142,68,173,0.02)');

  chartOrders = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'ออร์เดอร์',
        data: ordersData,
        borderColor: 'rgba(142,68,173,1)',
        backgroundColor: grad,
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#fff',
        pointBorderColor: 'rgba(142,68,173,1)',
        pointBorderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(31,41,55,0.92)',
          padding: 10,
          titleFont: { family: 'Sarabun', size: 13 },
          bodyFont:  { family: 'Sarabun', size: 12 },
          callbacks: { label: c => ` ${c.raw} ออร์เดอร์` },
        },
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { font: { family: 'Sarabun', size: 11 }, color: '#6b7280', maxRotation: 45 },
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { font: { family: 'Sarabun', size: 11 }, color: '#6b7280', precision: 0 },
        },
      },
    },
  });
}

// ─── Shared Bucket Builder ────────────────────────────
function getChartBuckets(periodSales) {
  const now = new Date();
  const thDays   = ['อา','จ','อ','พ','พฤ','ศ','ส'];
  const thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

  if (currentReport === 'day') {
    const labels     = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
    const revenue    = Array(24).fill(0);
    const ordersData = Array(24).fill(0);
    periodSales.forEach(s => {
      const h = parseSaleDate(s).getHours();
      revenue[h]    += s.grand;
      ordersData[h] += 1;
    });
    return { labels, revenue, ordersData };
  }

  if (currentReport === 'week') {
    const labels     = [];
    const revenue    = [];
    const ordersData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      labels.push(`${thDays[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`);
      const daySales = periodSales.filter(s => {
        const sd = parseSaleDate(s);
        return sd.toDateString() === d.toDateString();
      });
      revenue.push(daySales.reduce((s, x) => s + x.grand, 0));
      ordersData.push(daySales.length);
    }
    return { labels, revenue, ordersData };
  }

  if (currentReport === 'year') {
    const revenue    = Array(12).fill(0);
    const ordersData = Array(12).fill(0);
    periodSales.forEach(s => {
      const m = parseSaleDate(s).getMonth();
      revenue[m]    += s.grand;
      ordersData[m] += 1;
    });
    return { labels: thMonths, revenue, ordersData };
  }

  return { labels: [], revenue: [], ordersData: [] };
}

// =====================================================
//  AUTH GATE (ฝั่ง Admin)
// =====================================================

function showLoginGate(message = '') {
  document.getElementById('loginGate').style.display    = 'flex';
  document.getElementById('adminLayout').style.display  = 'none';
  const errEl = document.getElementById('loginError');
  if (errEl) errEl.textContent = message;
}

function showAdminContent() {
  document.getElementById('loginGate').style.display    = 'none';
  document.getElementById('adminLayout').style.display  = 'block';
}

// อัปเดต UI navbar + สิทธิ์ ตามสถานะ login และ role
// session = user object { id, username, role } หรือ null
function updateAuthUI(session) {
  const logoutBtn = document.getElementById('btnLogout');
  const userWrap  = document.getElementById('navbarUser');
  const userEmail = document.getElementById('navbarUserEmail');

  currentProfile = session || null;

  // เข้า Admin ได้เฉพาะ role = 'admin'
  isAdminAuthed = !!session && session.role === 'admin';

  if (session) {
    logoutBtn.style.display = '';
    userWrap.style.display  = '';
    const roleLabel = session.role === 'admin' ? ' (ผู้ดูแล)' : ' (พนักงาน)';
    userEmail.textContent   = (session.username || '') + roleLabel;
  } else {
    logoutBtn.style.display = 'none';
    userWrap.style.display  = 'none';
    userEmail.textContent   = '';
  }

  // ถ้ากำลังอยู่หน้า Admin ให้ปรับการแสดงผลทันที
  if (document.getElementById('adminPage').classList.contains('active')) {
    if (isAdminAuthed) {
      showAdminContent();
      loadAdminData();
    } else if (session) {
      // login แล้วแต่ไม่ใช่ admin
      showLoginGate('บัญชีนี้ไม่มีสิทธิ์เข้าถึง Admin panel (ต้องเป็นผู้ดูแลระบบ)');
    } else {
      showLoginGate();
    }
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl    = document.getElementById('loginError');
  const btn      = document.getElementById('btnLogin');

  errEl.textContent = '';
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> กำลังเข้าสู่ระบบ...';

  try {
    await auth.signIn(username, password);
    document.getElementById('loginPassword').value = '';
    showToast('เข้าสู่ระบบสำเร็จ', 'success');
    // updateAuthUI จะถูกเรียกผ่าน onChange อัตโนมัติ
  } catch (err) {
    console.error(err);
    errEl.textContent = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-right-to-bracket"></i> เข้าสู่ระบบ';
  }
}

async function handleLogout() {
  try {
    await auth.signOut();
    showToast('ออกจากระบบแล้ว');
    showPage('pos'); // กลับไปหน้าขาย
  } catch (err) {
    console.error(err);
    showToast('ออกจากระบบไม่สำเร็จ', 'error');
  }
}

// ─── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  updateClock();
  setInterval(updateClock, 1000);

  // โหลดสินค้า/หมวดหมู่ สำหรับหน้าขาย
  await loadCoreData();
  renderCategoryTabs();
  renderProducts();
  updateCart();

  // ตั้งค่า auth: เช็ค session ปัจจุบัน + ฟังการเปลี่ยนแปลง
  const session = auth.getSession();
  updateAuthUI(session);
  auth.onChange((s) => updateAuthUI(s));
});
