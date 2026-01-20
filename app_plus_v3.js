// === Laila's Treasures app_plus_v3.js (Live + Safeguards + AWS Connected) ===

//------------------------------------------------------
// Common Utilities
//------------------------------------------------------
window.$  = window.$  || (s => document.querySelector(s));
window.$$ = window.$$ || (s => Array.from(document.querySelectorAll(s)));

window.LT = window.LT || {};
if (typeof LT.refreshBanners !== "function") LT.refreshBanners = () => {};

// Safe UUID
function uuid() {
  if (window.generateUUID) return window.generateUUID();
  if (self.crypto && typeof self.crypto.randomUUID === "function") return self.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0, v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// LocalStorage size guard (for local banners)
const MAX_UPLOAD_BYTES = 400 * 1024;
function tooBigDataURL(str){ return str && str.startsWith("data:") && str.length > 600000; }

//------------------------------------------------------
// Default Settings (fallback local initialization)
//------------------------------------------------------
(function seedSettings(){
  if (typeof LTStore === "undefined" || typeof LTKEY === "undefined") return;
  const st = LTStore.get(LTKEY.settings, {}) || {};
  if (!st.socials) st.socials = { instagram:"", tiktok:"", facebook:"", youtube:"" };
  if (!Array.isArray(st.banners)) st.banners = [];
  LTStore.set(LTKEY.settings, st);
})();

//------------------------------------------------------
// AWS Integration
//------------------------------------------------------
window.LT_API_BASE = window.LT_API_BASE || "https://on3e0z9ssf.execute-api.us-east-2.amazonaws.com";
window.LT_checkAPI = () => console.log("LT_API_BASE =", window.LT_API_BASE);

async function fetchSettings(){
  const url = `${window.LT_API_BASE}/settings?t=${Date.now()}`; // cache-bust
  const res = await fetch(url, { cache: "no-store", mode: "cors" });
  if (!res.ok) throw new Error(`Failed to fetch settings (${res.status})`);
  return res.json();
}

//------------------------------------------------------
// Footer Socials (GET from AWS)
//------------------------------------------------------
function isHttp(u){ return typeof u === "string" && /^https?:\/\//i.test(u.trim()); }

async function renderFooterSocials(){
  const box = document.getElementById("footerSocials");
  if (!box) return;

  try{
    const { socials = {} } = await fetchSettings();
    const items = [
      ["instagram","IG"],
      ["tiktok","TT"],
      ["facebook","FB"],
      ["youtube","YT"]
    ].filter(([k]) => isHttp(socials[k]));

    box.innerHTML = items.length
      ? items.map(([k,abbr]) => `<a href="${socials[k]}" target="_blank" rel="noopener">${abbr}</a>`).join("")
      : `<p class="muted">Social links unavailable</p>`;
  }catch(err){
    console.error("Could not load socials:", err);
    box.innerHTML = `<p class="muted">Social links unavailable</p>`;
  }
}

//------------------------------------------------------
// Admin: Save Socials to AWS (PUT /settings/socials)
//------------------------------------------------------
LT.saveSocialsToAWS = async function(){
  const payload = {
    socials: {
      instagram: (document.getElementById("soc_instagram")?.value || "").trim(),
      tiktok:    (document.getElementById("soc_tiktok")?.value    || "").trim(),
      facebook:  (document.getElementById("soc_facebook")?.value  || "").trim(),
      youtube:   (document.getElementById("soc_youtube")?.value   || "").trim(),
    }
  };

  try{
    const r = await fetch(`${window.LT_API_BASE}/settings/socials`, {
      method: "PUT",
      mode: "cors",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    await r.json();
    alert("Saved to AWS");
    renderFooterSocials(); // refresh footer
  }catch(e){
    console.error("Save failed:", e);
    alert("Save failed. Check console for details.");
  }
};

//------------------------------------------------------
// Admin: Auto-fill Socials form from AWS
//------------------------------------------------------
async function hydrateAdminSocials(){
  if (!document.getElementById("soc_instagram")) return; // not on admin page
  try{
    const { socials = {} } = await fetchSettings();
    document.getElementById("soc_instagram").value = socials.instagram || "";
    document.getElementById("soc_tiktok").value    = socials.tiktok    || "";
    document.getElementById("soc_facebook").value  = socials.facebook  || "";
    document.getElementById("soc_youtube").value   = socials.youtube   || "";
  }catch(e){
    console.warn("Could not load socials for admin form:", e);
  }
}

//------------------------------------------------------
// Banners (local-only helpers; harmless if you don't use them)
//------------------------------------------------------
function inDateWindow(b, now){
  const okStart = !b.start || new Date(b.start).getTime() <= now;
  const okEnd   = !b.end   || new Date(b.end).getTime()   >= now;
  return okStart && okEnd;
}
function ytEmbed(url){
  try{
    const u = new URL(url);
    const id = u.searchParams.get("v") || u.pathname.split("/").pop();
    return `https://www.youtube-nocookie.com/embed/${id}`;
  }catch{ return ""; }
}
function fileToDataURL(file){
  return new Promise((res,rej)=>{
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

LT.saveBanner = async function(){
  if (typeof LTStore === "undefined" || typeof LTKEY === "undefined") return;

  const st = LTStore.get(LTKEY.settings, {}); st.banners = st.banners || [];
  const editId = document.getElementById("bannerForm")?.dataset.editId || "";

  const type   = document.getElementById("bf_type").value;
  const zone   = document.getElementById("bf_zone").value;
  const link   = (document.getElementById("bf_link").value  || "").trim();
  const start  = (document.getElementById("bf_start").value || "").trim();
  const end    = (document.getElementById("bf_end").value   || "").trim();
  const active = document.getElementById("bf_active").value === "true";
  const weight = Math.max(1, Math.min(5, parseInt(document.getElementById("bf_weight").value || "1", 10)));

  let src = (document.getElementById("bf_src").value || "").trim();
  const file = document.getElementById("bf_file")?.files?.[0];

  if (!src && file){
    if (file.size > MAX_UPLOAD_BYTES){
      alert("File too large. Please host on S3/YouTube and paste the URL.");
      return;
    }
    try { src = await fileToDataURL(file); }
    catch { alert("Failed to read file."); return; }
  }
  if (!src){ alert("Provide a Source URL or small file."); return; }
  if (tooBigDataURL(src)){ alert("Too large for local storage. Use a hosted URL."); return; }

  const data = { id: editId || uuid(), type, src, link, zone, active, start, end, weight };

  if (editId){
    const i = st.banners.findIndex(x => x.id === editId);
    if (i > -1) st.banners[i] = data;
  } else {
    st.banners.push(data);
  }

  try { LTStore.set(LTKEY.settings, st); }
  catch { alert("Save failed: storage full."); return; }

  LT.refreshBanners(); // safe even if no-op
  alert("Banner saved.");
};

//------------------------------------------------------
// Init
//------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  renderFooterSocials();
  hydrateAdminSocials();
  // If you keep an "Admin" link as a button elsewhere, you can attach navigation here if needed.
  // (No-op here by default)
});