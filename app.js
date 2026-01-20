// ====================== app.js (API-enabled + Collections LIVE) ======================

// Tiny DOM helpers
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

// Safe UUID (works even if crypto.randomUUID is missing)
function safeUUID(){
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}
// === Auth helpers (shared across pages/devices) ===
const LT_AUTH_KEY = 'lt_user';

// ===== Shared user helpers (same on every page) =====
function LT_getCurrentUser(){
  // 1) Prefer auth.js, if it is managing the session
  if (window.LTAuth && typeof LTAuth.getUser === 'function') {
    const u = LTAuth.getUser();
    if (u) return u;
  }

  // 2) Try new key
  const u1 = LTStore.get(LTKEY.currentUser, null);
  if (u1) return u1;

  // 3) Try old key (for safety / older pages)
  const u2 = LTStore.get(LTKEY.user, null);
  return u2 || null;
}

function LT_setCurrentUser(u){
  // Let auth.js mirror it if it wants
  // if (window.LTAuth && typeof LTAuth.setUser === 'function') {
  //   LTAuth.setUser(u);
  // }

  // Save to both keys so *all* pages see the same user
  LTStore.set(LTKEY.currentUser, u);
  // LTStore.set(LTKEY.user, u);
}

// ===== LIVE API base =====
window.LT_API_BASE = window.LT_API_BASE || 'https://on3e0z9ssf.execute-api.us-east-2.amazonaws.com';
// default to API unless explicitly turned off elsewhere
window.LT_USE_API = (typeof window.LT_USE_API === 'boolean') ? window.LT_USE_API : true;
const USE_API = window.LT_USE_API;

// In-memory products source of truth for the UI
let PRODUCTS = [];

// ---------------------------------------
// Collections (LIVE from AWS settings)
// ---------------------------------------
window.LT_COLLECTIONS = [];

function slugify(s){
  return (s||'').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'');
}
function getCollections(){
  let cols = window.LT_COLLECTIONS;

  // If saved as a JSON string in Dynamo, parse it
  if (typeof cols === 'string') {
    try {
      cols = JSON.parse(cols);                   // e.g. "[{...},{...}]"
    } catch {
      // Coerce odd formats like "{...},{...}" or "(...)" into a valid array
      try { cols = JSON.parse('[' + cols.replace(/^\s*\(|\)\s*$/g, '') + ']'); }
      catch { cols = []; }
    }
  }

  // If a single object, wrap it
  if (cols && !Array.isArray(cols) && typeof cols === 'object') cols = [cols];

  // Final guard
  if (!Array.isArray(cols)) cols = [];

  // Keep the global normalized for future calls
  window.LT_COLLECTIONS = cols;

  // Return a sorted copy
  return cols.slice().sort((a,b)=>(a.order||0)-(b.order||0));
}

async function loadCollections(){
  try {
    const r = await fetch(`${window.LT_API_BASE}/settings?t=${Date.now()}`, { cache: 'no-store', mode: 'cors' });
    if (!r.ok) throw new Error(`GET /settings ${r.status}`);
    const data = await r.json();

    // Accept a few shapes and normalize to an array
    let cols = data.collections || (data.data && data.data.collections) || data.data || [];

    // If Dynamo returns a stringified JSON, parse it
    if (typeof cols === 'string') {
      try {
        // First try as a proper JSON string (e.g. "[{...},{...}]")
        cols = JSON.parse(cols);
      } catch {
        // Fallback: sometimes people save "{...},{...}" or "(...)" – coerce it
        try {
          const inner = cols.replace(/^\s*\(|\)\s*$/g, ''); // drop accidental parentheses
          cols = JSON.parse('[' + inner + ']');
        } catch {
          cols = [];
        }
      }
    }

    // If a single object was returned, wrap it into an array
    if (!Array.isArray(cols) && cols && typeof cols === 'object') cols = [cols];

    window.LT_COLLECTIONS = cols;
  } catch (e) {
    console.warn('Failed to load collections from API:', e);
    window.LT_COLLECTIONS = [];
  }
}

async function saveCollectionsToAPI(list){
  const r = await fetch(`${window.LT_API_BASE}/settings/collections`, {
    method:'PUT', mode:'cors', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ collections: list })
  });
  if(!r.ok) throw new Error(`PUT /settings/collections ${r.status}`);
  return r.json();
}
function matchKey(c, key){ return (c.id && c.id === key) || c.slug === key; }
function withoutKey(list, key){ return list.filter(c => !matchKey(c, key)); }
// -------- API helpers (products) --------
async function loadProducts() {
  if (!USE_API) { // Local-only (not used normally)
    PRODUCTS = LTStore.get(LTKEY.products, []) || [];
    return;
  }
  try {
    const r = await fetch(`${window.LT_API_BASE}/products`, { cache: 'no-store', mode: 'cors' });
    if (!r.ok) throw new Error(`GET /products ${r.status}`);
    const { items } = await r.json();
    PRODUCTS = Array.isArray(items) ? items : [];
    // optional: cache locally for page reload speed only
    LTStore.set(LTKEY.products, PRODUCTS);
  } catch (e) {
    console.warn('API failed, falling back to local products:', e);
    PRODUCTS = LTStore.get(LTKEY.products, []) || [];
  }
}
// -------- Cart API helpers --------
async function fetchCartForUser(userId){
  const url = `${window.LT_API_BASE}/cart?userId=${encodeURIComponent(userId)}`;
  const r = await fetch(url, { mode: 'cors', cache: 'no-store' });
  if (!r.ok) throw new Error(`GET /cart ${r.status}`);
  const data = await r.json();
  const items = Array.isArray(data.items) ? data.items : [];
  LTStore.set(LTKEY.cart, items);   // keep local copy in sync
  return items;
}

async function saveCartItemToAPI(item){
  const r = await fetch(`${window.LT_API_BASE}/cart`, {
    method: 'PUT',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item)
  });
  if (!r.ok) throw new Error(`PUT /cart ${r.status}`);
  const data = await r.json();
  return data.item || item;
}

async function deleteCartItemFromAPI(userId, id){
  const url = `${window.LT_API_BASE}/cart?userId=${encodeURIComponent(userId)}&id=${encodeURIComponent(id)}`;
  const r = await fetch(url, { method:'DELETE', mode:'cors' });
  if (!r.ok) throw new Error(`DELETE /cart ${r.status}`);
}
async function saveProductToAPI(prod) {
  if (!USE_API) {
    // Local-only write (fallback only)
    const ps = LTStore.get(LTKEY.products, []) || [];
    const i = ps.findIndex(p => p.id === prod.id);
    if (i > -1) ps[i] = prod; else ps.push(prod);
    LTStore.set(LTKEY.products, ps);
    PRODUCTS = ps;
    return { ok: true, source: 'local' };
  }
  const r = await fetch(`${window.LT_API_BASE}/products`, {
    method: 'PUT',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prod)
  });
  if (!r.ok) throw new Error(`PUT /products ${r.status}`);
  return r.json();
}
// ========= CART API HELPERS =========

async function fetchCartFromAPI(userId) {
  if (!userId) return { items: [] };

  const r = await fetch(`${window.LT_API_BASE}/cart?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!r.ok) throw new Error(`GET /cart ${r.status}`);
  const data = await r.json();
  // Expecting { items: [...] }
  return {
    items: Array.isArray(data.items) ? data.items : []
  };
}

async function saveCartItemToAPI(item) {
  const r = await fetch(`${window.LT_API_BASE}/cart`, {
    method: 'POST',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item)
  });

  const data = await r.json();
  if (!r.ok || data.ok === false) {
    throw new Error(data.error || `POST /cart ${r.status}`);
  }
  return data;
}

async function deleteCartItemFromAPI(id, userId) {
  if (!id) return;

  // If your API needs userId, add it as a query param
  const url = `${window.LT_API_BASE}/cart/${encodeURIComponent(id)}${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`;

  const r = await fetch(url, {
    method: 'DELETE',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!r.ok && r.status !== 404) {
    // 404 = already deleted, we can ignore
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `DELETE /cart ${r.status}`);
  }
  return true;
}
// ------- CART API HELPERS (LIVE) -------
async function apiCartGetForUser(userId) {
  if (!userId) return [];
  try {
    const r = await fetch(
      `${window.LT_API_BASE}/cart?userId=${encodeURIComponent(userId)}`,
      { mode: 'cors' }
    );
    const data = await r.json();
    // Expecting { ok:true, items:[...] }
    return Array.isArray(data.items) ? data.items : [];
  } catch (e) {
    console.warn('Cart GET failed:', e);
    return [];
  }
}

async function apiCartPutItem(item) {
  const r = await fetch(`${window.LT_API_BASE}/cart`, {
    method: 'PUT',
    mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item)
  });
  const data = await r.json();
  if (!r.ok || data.ok === false) {
    throw new Error(data.error || 'Cart PUT failed');
  }
  return data;
}

async function apiCartDeleteItem(userId, id) {
  if (!userId || !id) return;
  try {
    await fetch(
      `${window.LT_API_BASE}/cart?userId=${encodeURIComponent(userId)}&id=${encodeURIComponent(id)}`,
      { method: 'DELETE', mode: 'cors' }
    );
  } catch (e) {
    console.warn('Cart DELETE failed:', e);
  }
}
// -------- App --------
const LT = {
  fmt(n){ return `$${(n||0).toFixed(2)}`; },
  notify(msg){ alert(msg); },
// ========= AUTH HELPERS =========
  // currentUser: null,

  // getCurrentUser(){
  //   if (!this.currentUser) {
  //     this.currentUser = LTStore.get(LTKEY.user, null);
  //   }
  //   return this.currentUser;
  // },

  // requireLogin(){
  //   const u = this.getCurrentUser();
  //   if (!u) {
  //     alert('Please log in to use this feature.');
  //     // optional: send them to login page
  //     // window.location.href = 'login.html';
  //     return null;
  //   }
  //   return u;
  // },
  // Home
  renderFeatured(){
    const wrap = document.getElementById('featured'); if(!wrap) return;
    const prods = PRODUCTS.filter(p=>p.active!==false).slice(0,3); // only active
    wrap.innerHTML = prods.map(p => `
      <div class="card" style="grid-column:span 4">
        <img src="${p.img}" alt="${p.name}" style="width:100%;height:220px;object-fit:cover"/>
        <div class="body">
          <span class="badge">${p.category||''}</span>
          <h3>${p.name}</h3>
          <div class="row" style="justify-content:space-between;align-items:center">
            <div class="price">from ${LT.fmt(p.price)}</div>
            <button class="btn" onclick="LT.openConfig('${p.id}')">Configure</button>
          </div>
        </div>
      </div>
    `).join('');
    const sub = LTStore.get(LTKEY.settings, {}).subtitle;
    const subEl = document.querySelector('.hero .sub'); if(sub && subEl) subEl.textContent = sub; // fixed typo
  },

  // All Grillz
  loadFilters(){
    const select = document.getElementById('filterCategory'); if(!select) return;
    const cats = [...new Set(PRODUCTS.filter(p=>p.active!==false).map(p=>p.category||''))].sort();
    select.innerHTML = '<option value="">All Categories</option>' + cats.map(c=>`<option>${c}</option>`).join('');
  },
  renderProducts(){
  const grid = document.getElementById('products'); 
  if(!grid) return;

  const q   = (document.getElementById('search')?.value || '').toLowerCase();
  const cat = (document.getElementById('filterCategory')?.value || '');

  // 🔹 NEW: read ?collection=slug from the URL
  const params        = new URLSearchParams(window.location.search);
  const collectionSlug = params.get('collection') || '';

  let prods = PRODUCTS.filter(p => p.active !== false);

  if (q) {
    prods = prods.filter(p => 
      (p.name || '').toLowerCase().includes(q) || 
      (p.category || '').toLowerCase().includes(q)
    );
  }

  if (cat) {
    prods = prods.filter(p => (p.category || '') === cat);
  }

  // 🔹 NEW: filter by collections checklist
  if (collectionSlug) {
    prods = prods.filter(p => 
      Array.isArray(p.collections) && p.collections.includes(collectionSlug)
    );
  }

  if (!prods.length) { 
    grid.innerHTML = '<p class="muted">No products found.</p>'; 
    return; 
  }

  grid.innerHTML = prods.map(p => `
    <div class="card" style="grid-column:span 4">
      <img src="${p.img}" alt="${p.name}" style="width:100%;height:220px;object-fit:cover"/>
      <div class="body">
        <span class="badge">${p.category || ''}</span>
        <h3>${p.name}</h3>
        <p class="muted">${p.desc || ''}</p>
        <div class="row" style="justify-content:space-between;align-items:center">
          <div class="price">from ${LT.fmt(p.price)}</div>
          <button class="btn" onclick="LT.openConfig('${p.id}')">Configure</button>
        </div>
      </div>
    </div>
  `).join('');
},
getUnitPrice(p, metal){
  if (!p) return 0;

  // 1) Try exact per-metal prices from the product (if admin set them)
  const specificMap = {
    // GOLD FAMILY
    '8K Gold':           p.gold_8k,
    '10K Gold':          p.gold_10k,
    '14K Gold':          p.gold_14k,
    '24K Gold Polish':   p.gold_24k,
    'Gold Plated':       p.gold_plated,

    // SILVER FAMILY
    'Silver':            p.silver_price,

    // ROSE GOLD FAMILY
    'Rose Gold':         p.rose_price,
    'Rose Gold Plated':  p.rose_plated
  };

  let v = specificMap[metal];
  if (typeof v === 'number' && !Number.isNaN(v) && v > 0) {
    return v;      // ✅ use admin-set price
  }

  // 2) Fallback: old factor-based system using base price
  const base = p.price || 0;

  const factorMap = {
    // GOLD FAMILY
    '8K Gold':           0.8,
    '10K Gold':          1.0,
    '14K Gold':          1.2,
    '24K Gold Polish':   1.4,
    'Gold Plated':       0.6,

    // SILVER FAMILY
    'Silver':            0.8,

    // ROSE GOLD FAMILY
    'Rose Gold':         1.15,
    'Rose Gold Plated':  0.9
  };

  const factor = factorMap[metal] || 1;
  return base * factor;
},
 openConfig(id){
  
  const p = PRODUCTS.find(x => x.id === id);
  const modal = document.getElementById('configModal'); 
  if (!modal || !p) return;

  const body = document.getElementById('configBody');

  // 👉 Read metal family from product (saved from admin)
  const fam = p.family || 'gold';

  // 👉 Build metal options based on family
  let metalOptions = '';

  if (fam === 'gold') {
    metalOptions = `
      <option>8K Gold</option>
      <option>10K Gold</option>
      <option>14K Gold</option>
      <option>24K Gold Polish</option>
      <option>Gold Plated</option>
    `;
  } else if (fam === 'silver') {
    metalOptions = `
      <option>Silver</option>
    `;
  } else if (fam === 'rosegold') {
    metalOptions = `
      <option>Rose Gold</option>
      <option>Rose Gold Plated</option>
    `;
  } else {
    // fallback
    metalOptions = `
      <option>10K Gold</option>
      <option>14K Gold</option>
      <option>Gold Plated</option>
    `;
  }

  body.innerHTML = `
    <p><strong>${p.name}</strong></p>
    <div class="grid" style="grid-template-columns:repeat(2,1fr)">
      <div>
        <label>Metal</label>
        <select id="cfg_metal">
          ${metalOptions}
        </select>
      </div>
      <div>
        <label>Tooth Count</label>
        <select id="cfg_teeth">
          <option value="1">1</option>
          <option value="2">2</option>
          <option value="4">4</option>
          <option value="6">6</option>
          <option value="8">8</option>
          <option value="12">12</option>
        </select>
      </div>
    </div>
    <label>Notes (optional)</label>
    <textarea id="cfg_notes" class="input" rows="3" placeholder="Any special request..."></textarea>
    <div class="row" style="margin-top:10px;justify-content:space-between">
      <div id="cfg_priceDisplay" class="muted"></div>
      <button class="btn" onclick="LT.addToCart('${p.id}')">Add to Cart</button>
    </div>
  `;

  // ⭐ Live price update inside the popup
  const metalSel  = document.getElementById('cfg_metal');
  const teethSel  = document.getElementById('cfg_teeth');
  const priceBox  = document.getElementById('cfg_priceDisplay');

  function refreshPrice(){
    const metal = metalSel.value;
    const teeth = parseInt(teethSel.value || '1', 10);
    const unit  = LT.getUnitPrice(p, metal);
    const total = unit * teeth;
    priceBox.textContent = `Price: ${LT.fmt(total)}`;
  }

  metalSel.addEventListener('change', refreshPrice);
  teethSel.addEventListener('change', refreshPrice);
  refreshPrice(); // initial

  modal.classList.remove('hidden');
},
closeConfig(){ document.getElementById('configModal')?.classList.add('hidden'); },
// Add to Cart (LIVE)
  addToCart: async function(id){
  const user = LT.requireUser();   // uses LT_getCurrentUser under the hood
  if (!user) return;               // will redirect / show login

  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;

  const metal = $('#cfg_metal')?.value || '10K Gold';
  const teeth = parseInt($('#cfg_teeth')?.value || '1', 10);
  const notes = $('#cfg_notes')?.value || '';

  const unit  = LT.getUnitPrice(p, metal);
  const total = unit * teeth;

  const item = {
    // ✅ must match Dynamo key schema (PK = userId, SK = id)
    userId:   user.id,
    id:       safeUUID(),
    productId: p.id,
    name:     p.name,
    img:      p.img,
    category: p.category,
    metal,
    teeth,
    notes,
    unitPrice: unit,
    total
  };

  try {
    await apiCartPutItem(item);
    LT.notify('Added to cart.');
    LT.closeConfig();
    // refresh cart view on this device
    LT.renderCart();
  } catch (e) {
    console.error(e);
    alert('Could not save cart. Please try again.');
  }
},

// Cart (LIVE)
renderCart: async function(){
  const box = document.getElementById('cartItems');
  if (!box) return;

  const user = LT_getCurrentUser();
  if (!user) {
    box.innerHTML = '<p class="muted">Please log in to view your cart.</p>';
    const totalEl = document.getElementById('cartTotal');
    if (totalEl) totalEl.textContent = LT.fmt(0);
    return;
  }

  let cart = await apiCartGetForUser(user.id);

  if (!cart.length) {
    box.innerHTML = '<p class="muted">Your cart is empty.</p>';
    const totalEl = document.getElementById('cartTotal');
    if (totalEl) totalEl.textContent = LT.fmt(0);
    return;
  }

  let total = 0;
  box.innerHTML = cart.map(it => {
    total += it.total || 0;
    return `
      <div class="card">
        <div class="body">
          <div class="row" style="justify-content:space-between">
            <div class="row" style="gap:14px">
              <img src="${it.img}" style="width:72px;height:72px;object-fit:cover;border-radius:10px"/>
              <div>
                <strong>${it.name}</strong><br/>
                <small class="muted">${it.category || ''} • ${it.metal} • ${it.teeth} teeth</small>
              </div>
            </div>
            <div class="row">
              <div class="price">${LT.fmt(it.total || 0)}</div>
              <button class="btn ghost" onclick="LT.removeCart('${it.id}')">Remove</button>
            </div>
          </div>
          ${it.notes ? `<small class="muted">Notes: ${it.notes}</small>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const totalEl = document.getElementById('cartTotal');
  if (totalEl) totalEl.textContent = LT.fmt(total);
},
  removeCart: async function(id){
  const user = LT_getCurrentUser();
  if (!user) {
    alert('Please log in again.');
    window.location.href = 'login.html';
    return;
  }

  await apiCartDeleteItem(user.id, id);
  // Refresh cart after delete
  LT.renderCart();
},
  clearCart: async function(){
  const user = LT_getCurrentUser();
  if (!user) return;

  const items = await apiCartGetForUser(user.id);
  for (const it of items) {
    await apiCartDeleteItem(user.id, it.id);
  }
  LT.renderCart();
},
checkout: async function(){
  const user = LT_getCurrentUser();
  if (!user) {
    alert('Please log in first.');
    window.location.href = 'login.html';
    return;
  }

  const email = prompt('Enter your email to send the cart to us:');
  if (!email) return;

  const cart = await apiCartGetForUser(user.id);

  const messages = LTStore.get(LTKEY.messages, []);
  messages.push({
    id: safeUUID(),
    email,
    name: email.split('@')[0],
    text: `Cart Inquiry: ${cart.map(c => `${c.name} [${c.metal}, ${c.teeth}]`).join('; ')}`,
    from: 'user',
    ts: Date.now()
  });
  LTStore.set(LTKEY.messages, messages);
  LT.notify('Sent! We will reply in Messenger.');
},

  // Reviews
  renderReviews(){
    const box = document.getElementById('reviews'); if(!box) return;
    const revs = LTStore.get(LTKEY.reviews, []).filter(r=>r.status==='approved');
    if(!revs.length){ box.innerHTML = '<p class="muted">No reviews yet.</p>'; return; }
    box.innerHTML = revs.map(r=>`
      <div class="card" style="grid-column:span 6">
        <div class="body">
          <div class="row" style="justify-content:space-between">
            <strong>${r.name}</strong>
            <span class="badge">⭐ ${r.rating}</span>
          </div>
          <p>${r.text}</p>
        </div>
      </div>
    `).join('');
  },
  submitReview(e){
    e.preventDefault();
    const name = $('#r_name').value, rating = parseInt($('#r_rating').value,10), text = $('#r_text').value;
    const revs = LTStore.get(LTKEY.reviews, []);
    revs.push({id: safeUUID(), name, rating, text, status:'pending'});
    LTStore.set(LTKEY.reviews, revs);
    e.target.reset();
    LT.notify('Review submitted. Pending approval.');
    return false;
  },

  // Messenger
  loadThread(){
    const email = $('#m_email').value.trim(); if(!email) return;
    const msgs = LTStore.get(LTKEY.messages, []).filter(m=>m.email===email).sort((a,b)=>a.ts-b.ts);
    const body = $('#threadBody');
    if(!msgs.length){ body.innerHTML = '<small class="muted">No messages yet.</small>'; return; }
    body.innerHTML = msgs.map(m=>`
      <div class="row" style="justify-content:${m.from==='user'?'flex-end':'flex-start'}">
        <div class="badge" style="max-width:70%">${m.text}</div>
      </div>
    `).join('');
  },
  sendMessage(e){
    e.preventDefault();
    const email = $('#m_email').value.trim(); if(!email) return false;
    const text = $('#m_text').value.trim(); if(!text) return false;
    const messages = LTStore.get(LTKEY.messages, []);
    messages.push({id: safeUUID(), email, name: email.split('@')[0], text, from:'user', ts: Date.now()});
    LTStore.set(LTKEY.messages, messages);
    $('#m_text').value='';
    LT.loadThread();
    return false;
  },
// ================= AUTH (front-end only) =================
  openLoginModal(){
    document.getElementById('loginModal')?.classList.remove('hidden');
    LT.updateLoginStatus();
  },
  closeLoginModal(){
    document.getElementById('loginModal')?.classList.add('hidden');
  },
  updateLoginStatus(){
    const box = document.getElementById('loginStatus');
    if (!box) return;
    const u = LT_getCurrentUser();
    box.textContent = u ? `Logged in as ${u.name} (${u.email})` : 'Not logged in yet.';
  },

  getCurrentUser(){
    return LT_getCurrentUser();        // ✅ delegate to helper
  },
logoutUser(){
    LT_setCurrentUser(null);   // ✅ clear shared user
    alert('Logged out.');
    LT.updateLoginStatus();
  },
// Helper to require login
  // Helper to require login
  requireUser(){
    const u = LT_getCurrentUser();
    if (!u){
      alert('Please log in to use this feature.');
      window.location.href = "login.html";
      return null;
    }
    return u;
  },
  signupUser(){
    const name  = document.getElementById('su_name').value.trim();
    const email = document.getElementById('su_email').value.trim().toLowerCase();
    const pass  = document.getElementById('su_pass').value;

    if (!name || !email || !pass){
      alert('Please fill name, email, and password.');
      return;
    }

    const users = LTStore.get(LTKEY.users, []) || [];
    if (users.some(u => u.email === email)){
      alert('An account with this email already exists. Please login.');
      return;
    }

    const user = {
      id: safeUUID(),
      name,
      email,
      password: pass
    };

    users.push(user);
    LTStore.set(LTKEY.users, users);

    // ✅ save current user using shared helper
    LT_setCurrentUser({ id: user.id, name: user.name, email: user.email });

    alert('Account created and logged in.');
    LT.updateLoginStatus();
  },

  loginUser(){
    const email = document.getElementById('li_email').value.trim().toLowerCase();
    const pass  = document.getElementById('li_pass').value;

    if (!email || !pass){
      alert('Please enter email and password.');
      return;
    }

    const users = LTStore.get(LTKEY.users, []) || [];
    const u = users.find(x => x.email === email && x.password === pass);
    if (!u){
      alert('Wrong email or password.');
      return;
    }

    // ✅ save current user using shared helper
    LT_setCurrentUser({ id: u.id, name: u.name, email: u.email });

    alert('Logged in.');
    LT.updateLoginStatus();
  },
  
  // Admin auth
  adminLogin(){
    const pass = $('#adminPass').value;
    const a = LTStore.get(LTKEY.admin, {password:'admin123'});
    if(pass===a.password){
      a.authed = true; LTStore.set(LTKEY.admin, a);
      $('#adminLogin').classList.add('hidden');
      $('#adminApp').classList.remove('hidden');
      LT.showTab('products'); LT.refreshTables(); LT.refreshCollectionsTable();
    } else alert('Wrong password');
  },
  adminLogout(){
    const a = LTStore.get(LTKEY.admin, {}); a.authed=false; LTStore.set(LTKEY.admin, a);
    location.reload();
  },
  setPassword(){
    const np = $('#set_pass').value.trim(); if(!np) return;
    const a = LTStore.get(LTKEY.admin, {}); a.password=np; LTStore.set(LTKEY.admin, a);
    alert('Password updated.');
  },
  setSubtitle(){
    const s = $('#set_sub').value;
    const st = LTStore.get(LTKEY.settings, {}); st.subtitle = s; LTStore.set(LTKEY.settings, st);
    alert('Saved. Check Home page.');
  },

  showTab(name){
    ['products','reviews','messages','banners','categories','settings'].forEach(n=>{
      const el = document.getElementById('tab_'+n);
      if(el) el.classList.toggle('hidden', n!==name);
    });
    if (name === 'categories') LT.refreshCollectionsTable();
  },

  // ===================== COLLECTIONS ADMIN (LIVE) =====================

  // Build checkbox UI in the Product Form (right column)
  collectionsChecklistIntoForm(){
  const form = document.getElementById('productForm');
  if (!form) return;

  // Find the right column (second <div> inside the grid)
  const rightCol = form.querySelector('.grid > div:last-child') || form.querySelector('.grid');

  // Remove any old checklist
  const old = document.getElementById('pf_collections_wrap');
  if (old) old.remove();

  // Always use a properly normalized array
  const list = getCollections();
  const cols = Array.isArray(list) ? list.filter(c => c.active !== false) : [];

  // Create wrapper
  const wrap = document.createElement('div');
  wrap.id = 'pf_collections_wrap';
  wrap.innerHTML = `
    <label>Collections</label>
    <div id="pf_collections" class="grid" style="grid-template-columns:repeat(2,1fr);gap:8px"></div>
    <small class="muted">Check all groups this product should appear in.</small>
  `;
  rightCol.appendChild(wrap);

  // Build the checkbox list
  const box = document.getElementById('pf_collections');
  if (!cols.length) {
    box.innerHTML = '<span class="muted">No collections yet.</span>';
    return;
  }

  box.innerHTML = cols.map(c => `
    <label class="row" style="gap:6px;align-items:center">
      <input type="checkbox" value="${c.slug}">
      <span>${c.name}</span>
    </label>
  `).join('');
},
renderMetalPriceFields(p = {}){
  const form = document.getElementById('productForm');
  if (!form) return;

  const rightCol = form.querySelector('.grid > div:last-child') || form.querySelector('.grid');

  // Remove any old block
  const old = document.getElementById('pf_metalPrices');
  if (old) old.remove();

  const famEl = document.getElementById('pf_family');
  const fam = (famEl && famEl.value) || p.family || 'gold';

  const block = document.createElement('div');
  block.id = 'pf_metalPrices';

  if (fam === 'gold') {
    block.innerHTML = `
      <h4 style="margin-top:16px">Gold Prices (per tooth)</h4>
      <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
        <div>
          <label>8K Gold Price</label>
          <input id="pf_price_gold_8k" type="number" class="input" min="0" step="0.01" value="${p.gold_8k ?? ''}">
        </div>
        <div>
          <label>10K Gold Price</label>
          <input id="pf_price_gold_10k" type="number" class="input" min="0" step="0.01" value="${p.gold_10k ?? ''}">
        </div>
        <div>
          <label>14K Gold Price</label>
          <input id="pf_price_gold_14k" type="number" class="input" min="0" step="0.01" value="${p.gold_14k ?? ''}">
        </div>
        <div>
          <label>24K Gold Polish Price</label>
          <input id="pf_price_gold_24k" type="number" class="input" min="0" step="0.01" value="${p.gold_24k ?? ''}">
        </div>
        <div>
          <label>Gold Plated Price</label>
          <input id="pf_price_gold_plated" type="number" class="input" min="0" step="0.01" value="${p.gold_plated ?? ''}">
        </div>
      </div>
      <small class="muted">Leave blank to fallback to base price × factor.</small>
    `;
  } else if (fam === 'silver') {
    block.innerHTML = `
      <h4 style="margin-top:16px">Silver Price (per tooth)</h4>
      <div>
        <label>Silver Price</label>
        <input id="pf_price_silver" type="number" class="input" min="0" step="0.01" value="${p.silver_price ?? ''}">
      </div>
      <small class="muted">Leave blank to fallback to base price × factor.</small>
    `;
  } else if (fam === 'rosegold') {
    block.innerHTML = `
      <h4 style="margin-top:16px">Rose Gold Prices (per tooth)</h4>
      <div class="grid" style="grid-template-columns:repeat(2,1fr);gap:8px">
        <div>
          <label>Rose Gold Price</label>
          <input id="pf_price_rose" type="number" class="input" min="0" step="0.01" value="${p.rose_price ?? ''}">
        </div>
        <div>
          <label>Rose Gold Plated Price</label>
          <input id="pf_price_rose_plated" type="number" class="input" min="0" step="0.01" value="${p.rose_plated ?? ''}">
        </div>
      </div>
      <small class="muted">Leave blank to fallback to base price × factor.</small>
    `;
  } else {
    block.innerHTML = `
      <h4 style="margin-top:16px">Metal Prices</h4>
      <small class="muted">Select a metal family to configure specific prices.</small>
    `;
  }

  rightCol.appendChild(block);
},
  // Collections table
  refreshCollectionsTable(){
    const tbl = document.getElementById('colTable'); if (!tbl) return;
    const rows = getCollections().map(c=>`
      <tr>
        <td>${c.name||''}</td>
        <td><small>${c.slug||''}</small></td>
        <td>${c.tagline||''}</td>
        <td>${c.order||0}</td>
        <td>${c.active===false ? 'No':'Yes'}</td>
        <td>
          <button class="btn ghost" onclick="LT.openCollectionForm('${c.id || c.slug}')">Edit</button>
          <button class="btn danger" onclick="LT.deleteCollection('${c.id || c.slug}')">Delete</button>
        </td>
      </tr>
    `).join('');
    tbl.innerHTML = `
      <tr><th>Name</th><th>Slug</th><th>Tagline</th><th>Order</th><th>Active</th><th></th></tr>
      ${rows || ''}
    `;
  },

  openCollectionForm(key){
  const form = document.getElementById('collectionForm'); if (!form) return;
  form.classList.remove('hidden');

  const list = getCollections();
  const data = key ? list.find(c => matchKey(c, key)) : null;

  $('#co_title').textContent = data ? 'Edit Collection' : 'New Collection';
  $('#co_name').value    = data?.name     || '';
  $('#co_slug').value    = data?.slug     || '';
  $('#co_tagline').value = data?.tagline  || '';
  $('#co_cover').value   = data?.coverImg || '';
  $('#co_order').value   = data?.order ?? 1;
  $('#co_active').value  = String(data?.active ?? true);

  // remember the key we used (prefer id if present, else slug)
  form.dataset.editKey = data?.id || data?.slug || '';
},

  closeCollectionForm(){ $('#collectionForm').classList.add('hidden'); },

  async saveCollection(){
  const form = document.getElementById('collectionForm');
  const editKey = form.dataset.editKey || '';

  const name    = $('#co_name').value.trim();
  let   slug    = $('#co_slug').value.trim();
  const tagline = $('#co_tagline').value.trim();
  const cover   = $('#co_cover').value.trim();
  const order   = parseInt($('#co_order').value||'0',10);
  const active  = $('#co_active').value === 'true';

  if (!name){ alert('Name is required'); return; }
  if (!slug) slug = slugify(name);

  const list = getCollections();

  // prevent slug collision on create
  if (!editKey && list.some(c=>c.slug===slug)){ alert('Slug already exists'); return; }

  if (!editKey) {
    list.push({ id: safeUUID(), name, slug, tagline, coverImg:cover, order, active });
  } else {
    const i = list.findIndex(c => matchKey(c, editKey));
    if (i > -1) list[i] = { ...list[i], name, slug, tagline, coverImg:cover, order, active };
  }

  try {
    await saveCollectionsToAPI(list);
    window.LT_COLLECTIONS = list;
    LT.refreshCollectionsTable();
    if (!document.getElementById('productForm')?.classList.contains('hidden')) {
      LT.collectionsChecklistIntoForm();
    }
    LT.closeCollectionForm();
  } catch(e){
    console.error('Save collections failed:', e);
    alert('Could not save collections.');
  }
},

  async deleteCollection(key){
  try{
    const list = withoutKey(getCollections(), key);
    await saveCollectionsToAPI(list);
    window.LT_COLLECTIONS = list;
    LT.refreshCollectionsTable();
    if (!document.getElementById('productForm')?.classList.contains('hidden')) {
      LT.collectionsChecklistIntoForm();
    }
  }catch(e){
    console.error('Delete collection failed:', e);
    alert('Could not delete collection.');
  }
},

  // ===================== PRODUCTS (Admin) =====================

  refreshTables(){
    const prodEl = document.getElementById('prodTable');
    const revEl  = document.getElementById('revTable');
    const msgEl  = document.getElementById('msgTable');
    if (!prodEl && !revEl && !msgEl) return;

    if (prodEl) {
      const p = PRODUCTS;
      prodEl.innerHTML =
        '<tr><th>Name</th><th>Category</th><th>Price</th><th>Active</th><th></th></tr>' +
        p.map(x => `
          <tr>
            <td>${x.name}</td>
            <td>${x.category||''}</td>
            <td>${LT.fmt(x.price)}</td>
            <td>${x.active ? 'Yes' : 'No'}</td>
            <td>
              <button class="btn ghost" onclick="LT.editProduct('${x.id}')">Edit</button>
              <button class="btn danger" onclick="LT.deleteProduct('${x.id}')">Delete</button>
            </td>
          </tr>
        `).join('');
    }

    if (revEl) {
      const r = LTStore.get(LTKEY.reviews, []);
      revEl.innerHTML =
        '<tr><th>Name</th><th>Rating</th><th>Text</th><th>Status</th><th></th></tr>' +
        r.map(x => `
          <tr>
            <td>${x.name}</td>
            <td>${x.rating}</td>
            <td>${x.text}</td>
            <td>${x.status}</td>
            <td>
              ${x.status !== 'approved' ? `<button class="btn ok" onclick="LT.approveReview('${x.id}')">Approve</button>` : ''}
              <button class="btn danger" onclick="LT.deleteReview('${x.id}')">Delete</button>
            </td>
          </tr>
        `).join('');
    }

    if (msgEl) {
      const m = LTStore.get(LTKEY.messages, []);
      const byEmail = {};
      m.forEach(x => { (byEmail[x.email] ||= []).push(x); });

      const rows = Object.entries(byEmail).map(([email, arr]) => {
        const last = arr.slice().sort((a,b) => b.ts - a.ts)[0];
        return `
          <tr>
            <td>${email}</td>
            <td>${new Date(last.ts).toLocaleString()}</td>
            <td>${last.text}</td>
            <td><button class="btn" onclick="LT.reply('${email}')">Reply</button></td>
          </tr>
        `;
      }).join('');

      msgEl.innerHTML = '<tr><th>Email</th><th>Last</th><th>Snippet</th><th></th></tr>' + rows;
    }
  },

  approveReview(id){
    const r = LTStore.get(LTKEY.reviews, []);
    const i = r.findIndex(x=>x.id===id); if(i>-1){ r[i].status='approved'; LTStore.set(LTKEY.reviews, r); LT.refreshTables(); alert('Approved'); }
  },
  deleteReview(id){
    let r = LTStore.get(LTKEY.reviews, []); r = r.filter(x=>x.id!==id); LTStore.set(LTKEY.reviews, r); LT.refreshTables();
  },

  reply(email){
    const text = prompt('Reply to '+email+':'); if(!text) return;
    const m = LTStore.get(LTKEY.messages, []);
    m.push({id: safeUUID(), email, name:'Admin', text:'Admin: '+text, from:'admin', ts: Date.now()});
    LTStore.set(LTKEY.messages, m);
    alert('Sent');
    LT.refreshTables();
  },

openProductForm(editId){
  $('#productForm').classList.remove('hidden');
  const isEdit = !!editId;
  $('#pf_title').textContent = isEdit ? 'Edit Product' : 'New Product';

  // always rebuild the collections checklist
  LT.collectionsChecklistIntoForm();

  if (isEdit){
    const p = PRODUCTS.find(x => x.id === editId);
    if (!p) return;

    // base fields
    $('#pf_name').value    = p.name || '';
    $('#pf_cat').value     = p.category || '';
    $('#pf_price').value   = p.price ?? '';
    $('#pf_img').value     = p.img || '';
    $('#pf_desc').value    = p.desc || '';
    $('#pf_active').value  = String(p.active !== false);

    // 🔹 NEW: metal family + prices
    $('#pf_family').value      = p.family || 'gold';
    $('#pf_gold8').value       = p.gold_8k      ?? '';
    $('#pf_gold10').value      = p.gold_10k     ?? '';
    $('#pf_gold14').value      = p.gold_14k     ?? '';
    $('#pf_gold24').value      = p.gold_24k     ?? '';
    $('#pf_goldPlated').value  = p.gold_plated  ?? '';
    $('#pf_silverPrice').value = p.silver_price ?? '';
    $('#pf_rosePrice').value   = p.rose_price   ?? '';
    $('#pf_rosePlated').value  = p.rose_plated  ?? '';

    // remember which product we are editing
    $('#productForm').dataset.editId = editId;

    // pre-check collections
    if (Array.isArray(p.collections)) {
      p.collections.forEach(slug => {
        const cb = document.querySelector(`#pf_collections input[value="${slug}"]`);
        if (cb) cb.checked = true;
      });
    }

  } else {
    // NEW product – clear everything

    $('#productForm').dataset.editId = '';

    $('#pf_name').value    = '';
    $('#pf_cat').value     = '';
    $('#pf_price').value   = '';
    $('#pf_img').value     = '';
    $('#pf_desc').value    = '';
    $('#pf_active').value  = 'true';

    $('#pf_family').value      = 'gold';
    $('#pf_gold8').value       = '';
    $('#pf_gold10').value      = '';
    $('#pf_gold14').value      = '';
    $('#pf_gold24').value      = '';
    $('#pf_goldPlated').value  = '';
    $('#pf_silverPrice').value = '';
    $('#pf_rosePrice').value   = '';
    $('#pf_rosePlated').value  = '';
  }
},
  closeProductForm(){ $('#productForm').classList.add('hidden'); },
  editProduct(id){ LT.openProductForm(id); },

  // Save to API (fallback to local if API fails) — now includes collections
// Save to API (fallback to local if API fails) — now includes metalFamily + metalPrices
async saveProduct(){
  const name      = $('#pf_name').value.trim();
  const category  = $('#pf_cat').value.trim();
  const price     = parseFloat($('#pf_price').value || '0');
  const img       = $('#pf_img').value.trim();
  const desc      = $('#pf_desc').value.trim();
  const active    = $('#pf_active').value === 'true';
  const family    = $('#pf_family') ? $('#pf_family').value : 'gold';  // what Lambda calls "family"

  // helper to read number inputs safely
  const num = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const v = parseFloat(el.value);
    return Number.isFinite(v) ? v : null;
  };

  // 🔹 These keys MUST match what your Lambda expects:
  //   gold_8k, gold_10k, gold_14k, gold_24k, gold_plated,
  //   silver_price, rose_price, rose_plated
  const priceFields = {
    gold_8k:      num('pf_gold8'),
    gold_10k:     num('pf_gold10'),
    gold_14k:     num('pf_gold14'),
    gold_24k:     num('pf_gold24'),
    gold_plated:  num('pf_goldPlated'),
    silver_price: num('pf_silverPrice'),
    rose_price:   num('pf_rosePrice'),
    rose_plated:  num('pf_rosePlated')
  };

  const collections = Array
    .from(document.querySelectorAll('#pf_collections input[type="checkbox"]:checked'))
    .map(x => x.value);

  // required fields
  if (!name || !category || !price || !img){
    alert('Please fill all required fields.');
    return;
  }

  const editId = $('#productForm').dataset.editId;
  let prod = editId
    ? {
        ...PRODUCTS.find(x => x.id === editId),
        name, category, price, img, desc, active, collections,
        family              // ✅ top-level "family" for Lambda
      }
    : {
        id: safeUUID(),
        name, category, price, img, desc, active, collections,
        family              // ✅ for new products too
      };

  // only attach prices that the user actually filled in
  Object.entries(priceFields).forEach(([key, val]) => {
    if (val !== null) {
      prod[key] = val;
    }
  });

  try {
    await saveProductToAPI(prod);
  } catch (e) {
    console.warn('API save failed — writing to local cache as fallback:', e);
    const ps = PRODUCTS.slice();
    if (editId) {
      const i = ps.findIndex(x => x.id === editId);
      if (i > -1) ps[i] = prod;
    } else {
      ps.push(prod);
    }
    LTStore.set(LTKEY.products, ps);
  }

  await loadProducts();
  LT.closeProductForm();
  LT.refreshTables();
  LT.loadFilters();
  LT.renderProducts();
  LT.renderFeatured();
},
  // (Optional) local delete; API delete can be added later if you like
  // Replace your current deleteProduct with this LIVE version
deleteProduct: async function(id){
  if (!id) return;
  if (!confirm('Delete this product? This cannot be undone.')) return;

  try {
    if (USE_API){
      await deleteProductFromAPI(id);
    }

    // Remove from local list no matter what (so UI updates)
    PRODUCTS = PRODUCTS.filter(p => p.id !== id);
    LTStore.set(LTKEY.products, PRODUCTS);

    LT.refreshTables();
    LT.loadFilters();
    LT.renderProducts();
    LT.renderFeatured();

    alert('Product deleted.');
  } catch (e){
    console.error('Live delete failed:', e);
    alert('Could not confirm delete with the server, but it may already be deleted. Refresh the page if in doubt.');
  }
},
};
// Try both common DELETE shapes: /products/{id} and /products?id=...
async function deleteProductFromAPI(id){
  const targets = [
    `${window.LT_API_BASE}/products/${encodeURIComponent(id)}`,
    `${window.LT_API_BASE}/products?id=${encodeURIComponent(id)}`
  ];

  for (const url of targets){
    try {
      const r = await fetch(url, { method:'DELETE', mode:'cors' });

      // Treat normal success, 204, and 404 (already gone) as OK
      if (r.ok || r.status === 204 || r.status === 404) {
        return { ok:true, url, status: r.status };
      }
    } catch (err) {
      // Network / CORS error – just try the next URL
      console.warn('Delete fetch failed for', url, err);
    }
  }

  throw new Error('DELETE /products failed on all routes');
}
// -------- Init --------
window.addEventListener('DOMContentLoaded', async () => {
  await loadCollections();          // get live collections first (for checklist + table)
  await loadProducts();             // then live products
  await LT.renderCart();
  LT.renderFeatured();
  LT.loadFilters(); 
  LT.renderProducts();
  LT.renderReviews();

  const a = LTStore.get(LTKEY.admin, {});
  if(a.authed){
    document.getElementById('adminLogin')?.classList.add('hidden');
    document.getElementById('adminApp')?.classList.remove('hidden');
    LT.showTab('products'); 
    LT.refreshTables();
    LT.refreshCollectionsTable();
  }
});