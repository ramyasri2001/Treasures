// ================== collections.js (UI helpers for Collections) ==================


// ---------- helpers ----------
async function fetchCollectionsLive() {
  try {
    const r = await fetch(`${window.LT_API_BASE}/settings?t=${Date.now()}`, {
      cache: 'no-store',
      mode: 'cors'
    });
    if (!r.ok) throw new Error('GET /settings failed');
    const { collections = [] } = await r.json();
    const arr = Array.isArray(collections) ? collections : [];
    return arr
      .filter(c => c && (c.active !== false))
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  } catch (e) {
    console.warn('Collections API failed, fallback to local:', e);
    const arr = (window.LTStore?.get?.(window.LTKEY?.collections, []) || [])
      .filter(c => c && (c.active !== false));
    return arr.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  }
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'collection';
}

// ---------- Home: Featured Collections grid ----------
LT.renderFeaturedCollections = async function () {
  const grid = document.getElementById('featuredCollections');
  if (!grid) return;
  const cols = await fetchCollectionsLive();
  if (!cols.length) {
    grid.innerHTML = '<p class="muted">No collections yet.</p>';
    return;
  }

  grid.innerHTML = cols
    .map(
      c => `
    <a class="card" style="grid-column:span 6; text-decoration:none"
       href="collection.html?c=${encodeURIComponent(c.slug)}">
      <img src="${c.coverImg || ''}" alt="${c.name || ''}"
           style="width:100%;height:220px;object-fit:cover"/>
      <div class="body">
        <h3 style="margin:0">${c.name || ''}</h3>
        ${
          c.tagline
            ? `<p class="muted" style="margin:6px 0 0">${c.tagline}</p>`
            : ''
        }
      </div>
    </a>
  `
    )
    .join('');
};

// ---------- Collection page ----------
LT.renderCollectionPage = async function () {
  const holder = document.getElementById('collectionPage');
  if (!holder) return;

  const params = new URLSearchParams(location.search);
  const slug = params.get('c') || '';

  // 1) load collections + find the one for this slug
  const colls = await fetchCollectionsLive();
  const col = colls.find(x => x.slug === slug);
  if (!col) {
    holder.innerHTML = '<p class="muted">Collection not found.</p>';
    return;
  }

  // 2) render header
  const header = document.getElementById('collectionHeader');
  if (header) {
    header.innerHTML = `
      <div class="card">
        <img src="${col.coverImg || ''}" alt="${col.name || ''}"
             style="width:100%;height:260px;object-fit:cover"/>
        <div class="body">
          <h2 style="margin:0">${col.name || ''}</h2>
          ${col.tagline ? `<p class="muted">${col.tagline}</p>` : ''}
        </div>
      </div>
    `;
  }

  // 3) DIRECTLY load products from API and filter by collections
  let prods = [];
  try {
    const r = await fetch(`${window.LT_API_BASE}/products?t=${Date.now()}`, {
      cache: 'no-store',
      mode: 'cors'
    });
    if (!r.ok) throw new Error('GET /products failed');
    const data = await r.json();
    const items = Array.isArray(data.items) ? data.items : [];

    prods = items.filter(
      p =>
        Array.isArray(p.collections) &&
        p.collections.includes(slug) &&
        p.active !== false
    );
  } catch (e) {
    console.warn('Could not load products for collection page:', e);
    prods = [];
  }

  // 4) render grid
  const grid = document.getElementById('collectionProducts');
  if (!prods.length) {
    grid.innerHTML = '<p class="muted">No products yet.</p>';
    return;
  }

  grid.innerHTML = prods
    .map(
      p => `
    <div class="card" style="grid-column:span 4">
      <img src="${p.img || ''}" alt="${p.name || ''}"
           style="width:100%;height:220px;object-fit:cover"/>
      <div class="body">
        <span class="badge">${p.category || 'Collection item'}</span>
        <h3>${p.name || ''}</h3>
        <p class="muted">${p.desc || ''}</p>
        <div class="row" style="justify-content:space-between;align-items:center">
          <div class="price">from $${((p.price || 0) * 1).toFixed(2)}</div>
          <button class="btn" onclick="LT.openConfig('${p.id}')">Configure</button>
        </div>
      </div>
    </div>
  `
    )
    .join('');
};

// ---------- Admin: Collections table (with Edit/Delete) ----------
LT.refreshCollectionsTable = async function () {
  const t = document.getElementById('colTable');
  if (!t) return;
  const cols = await fetchCollectionsLive();

  t.innerHTML =
    '<tr><th>Cover</th><th>Name</th><th>Slug</th><th>Tagline</th><th>Order</th><th>Active</th><th></th></tr>' +
    cols
      .map(
        c => `
      <tr>
        <td><img src="${c.coverImg || ''}"
                 style="width:96px;height:48px;object-fit:cover;border-radius:6px"/></td>
        <td>${c.name || ''}</td>
        <td><code>${c.slug || ''}</code></td>
        <td>${c.tagline || ''}</td>
        <td>${c.order ?? ''}</td>
        <td>${c.active === false ? 'No' : 'Yes'}</td>
        <td>
          <button class="btn ghost" onclick="LT.openCollectionForm('${c.id ?? c.slug}')">Edit</button>
          <button class="btn danger" onclick="LT.deleteCollection('${c.id ?? c.slug}')">Delete</button>
        </td>
      </tr>
    `
      )
      .join('');
};

// ---------- boot ----------
document.addEventListener('DOMContentLoaded', () => {
  LT.renderFeaturedCollections();
  LT.renderCollectionPage();
  LT.refreshCollectionsTable();
});