// ---------- data.js (Step 1: products know their collections) ----------

// UUID (unchanged)
function generateUUID() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random()*16)|0, v = c === 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

const LTKEY = {
  products:    'lt_products',
  reviews:     'lt_reviews',
  messages:    'lt_messages',
  cart:        'lt_cart',
  settings:    'lt_settings',
  admin:       'lt_admin',
  collections: 'lt_collections',
  users:       'lt_users',
  user:        'lt_user',
  currentUser:'lt_current_user'
};

const LTStore = {
  get(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d }catch{ return d } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
  seed(){

    // 1) Seed Collections (featured groups)
    if (!LTStore.get(LTKEY.collections)) {
      LTStore.set(LTKEY.collections, [
        { id: generateUUID(), name:'Classic Collection', slug:'classic', coverImg:'', tagline:'Timeless open-face & solids.', order:1, active:true },
        { id: generateUUID(), name:'Fancy Collection',   slug:'fancy',   coverImg:'', tagline:'Diamond cuts & patterns.',   order:2, active:true },
        { id: generateUUID(), name:'Festive Specials',   slug:'festive', coverImg:'', tagline:'Limited-time drops.',        order:3, active:true },
        { id: generateUUID(), name:'Ladies Collection',  slug:'ladies',  coverImg:'', tagline:'Elegant, light, glam.',      order:4, active:true },
        { id: generateUUID(), name:'Mr. & Mrs.',         slug:'mr-mrs',  coverImg:'', tagline:'Matching his & hers.',       order:5, active:true }
      ]);
    }

    // 2) Seed Products (NOW with collections: ["slug", ...])
    if (!LTStore.get(LTKEY.products)) {
      LTStore.set(LTKEY.products, [
        {
          id: generateUUID(),
          name: 'Open Face (Top Single)',
          category: 'Open Face',
          price: 149,
          img: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476a?q=80&w=800&auto=format&fit=crop',
          desc: 'Classic open-face single tooth.',
          active: true,
          collections: ['classic', 'ladies']   // 👈 belongs to these collections
        },
        {
          id: generateUUID(),
          name: 'Solid Gold (Bottom 6)',
          category: 'Solid',
          price: 199,
          img: 'https://images.unsplash.com/photo-1516223725307-6f76b31638d1?q=80&w=800&auto=format&fit=crop',
          desc: 'Solid set, base price per tooth.',
          active: true,
          collections: ['classic', 'mr-mrs']
        },
        {
          id: generateUUID(),
          name: 'Diamond Cut (Top 4)',
          category: 'Diamond Cut',
          price: 259,
          img: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?q=80&w=800&auto=format&fit=crop',
          desc: 'Shimmering diamond-cut style.',
          active: true,
          collections: ['fancy', 'festive']
        }
      ]);
    }

    // 3) MIGRATION: if products already exist, make sure they have collections:[]
    const existing = LTStore.get(LTKEY.products, []);
    let changed = false;
    existing.forEach(p => {
      if (!Array.isArray(p.collections)) { p.collections = []; changed = true; }
    });
    if (changed) LTStore.set(LTKEY.products, existing);

    // Other seeds (unchanged)
    if (!LTStore.get(LTKEY.reviews)) {
      LTStore.set(LTKEY.reviews, [
        { id: generateUUID(), name:'Aaliyah', rating:5, text:'Perfect fit and shine!', status:'approved' },
        { id: generateUUID(), name:'Jordan',  rating:4, text:'Great quality. Fast communication.', status:'approved' }
      ]);
    }
    if (!LTStore.get(LTKEY.messages)) LTStore.set(LTKEY.messages, []);
    if (!LTStore.get(LTKEY.cart))     LTStore.set(LTKEY.cart, []);
    if (!LTStore.get(LTKEY.settings)) LTStore.set(LTKEY.settings, { subtitle:'Choose your metal, style, and tooth count.' });
    if (!LTStore.get(LTKEY.admin))    LTStore.set(LTKEY.admin, { password:'admin123', authed:false });
  }
};

LTStore.seed();