/* ══════════════════════════════════════
   吃什麼？— app.js
   ══════════════════════════════════════ */

const GKEY       = 'AIzaSyAf96oPZjdLci_LV74k4DzvjgaHSsGTFW8';
const WORKER_URL = 'https://what2eat.evan34021.workers.dev';

// ── Shared State ──
const state = {
  ai:     { lat: null, lng: null, transport: '步行', meal: '早餐', budget: 300 },
  search: { lat: null, lng: null, transport: '步行', meal: '早餐', budget: 300 }
};
const SPEED = { '步行': 67, '騎車': 167, '開車': 400 };

let allRestaurants = [];
let placesService  = null;
let mapInstance    = null;
let mapsLoaded     = false;
let loggedIn       = false;

/* ── Tab / Page ── */
function switchTab(tab) {
  const pageMap = { ai: 'aiPage', search: 'searchPage', map: 'mapPage' };
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  showPage(pageMap[tab]);
  if (tab === 'map') initMap();
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ── Nav scroll ── */
window.addEventListener('scroll', () => {
  document.getElementById('mainNav').classList.toggle('scrolled', window.scrollY > 8);
});

/* ── UI helpers ── */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
function showErr(bannerId, msg) {
  const b = document.getElementById(bannerId);
  b.textContent = msg; b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), 6000);
}
function showLoading(txt) {
  document.getElementById('loadText').textContent = txt || '搜尋中…';
  document.getElementById('loadingOverlay').classList.add('show');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}

/* ── Filters ── */
function setChip(el, groupId, stateKey) {
  document.getElementById(groupId).querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const [page, prop] = stateKey === 'aiTransport'   ? ['ai','transport']   :
                       stateKey === 'aiMeal'         ? ['ai','meal']        :
                       stateKey === 'searchTransport'? ['search','transport']:
                                                       ['search','meal'];
  state[page][prop] = el.textContent.trim();
}

function updateBudget(page, val) {
  state[page].budget = +val;
  document.getElementById(`${page}BudgetVal`).textContent = +val >= 1500 ? '1500+' : val;
}

function budgetMatch(priceLevel, budget) {
  if (budget >= 1500) return true;
  const map = { 0:50, 1:150, 2:400, 3:800, 4:1500 };
  return (map[priceLevel ?? 1] ?? 150) <= budget;
}

/* ── Login ── */
function handleLogin() {
  loggedIn = !loggedIn;
  document.getElementById('loginText').textContent = loggedIn ? '已登入' : 'Google 登入';
  showToast(loggedIn ? '✓ 登入成功（模擬）' : '已登出');
}

/* ── Geolocation ── */
function locateMe(page) {
  const statusEl = document.getElementById(`${page}LocateStatus`);
  statusEl.textContent = '定位中…'; statusEl.className = 'locate-status';
  if (!navigator.geolocation) { statusEl.textContent = '不支援定位'; return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      state[page].lat = pos.coords.latitude;
      state[page].lng = pos.coords.longitude;
      statusEl.textContent = `已定位 (${state[page].lat.toFixed(3)}, ${state[page].lng.toFixed(3)})`;
      statusEl.className = 'locate-status ok';
    },
    () => {
      state[page].lat = 24.1477; state[page].lng = 120.6736;
      statusEl.textContent = '使用預設位置（台中市）';
      statusEl.className = 'locate-status ok';
    }
  );
}

/* ── Google Maps Loader ── */
function loadGMaps() {
  return new Promise((res, rej) => {
    if (mapsLoaded && window.google?.maps) { res(); return; }
    if (document.getElementById('gmaps-script')) {
      const wait = setInterval(() => {
        if (window.google?.maps) { clearInterval(wait); mapsLoaded = true; res(); }
      }, 100);
      setTimeout(() => { clearInterval(wait); rej(new Error('timeout')); }, 12000);
      return;
    }
    window._gmapsReady = () => { mapsLoaded = true; res(); };
    const s = document.createElement('script');
    s.id = 'gmaps-script';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GKEY}&libraries=places&callback=_gmapsReady`;
    s.async = true; s.defer = true;
    s.onerror = () => rej(new Error('載入失敗'));
    document.head.appendChild(s);
  });
}

/* ── Map Page ── */
async function initMap() {
  if (mapInstance) return;
  try {
    await loadGMaps();
    const lat = state.search.lat || 24.1477;
    const lng = state.search.lng || 120.6736;
    mapInstance = new google.maps.Map(document.getElementById('googleMap'), {
      center: { lat, lng }, zoom: 15,
      mapTypeControl: false, fullscreenControl: false,
    });
  } catch (e) { console.error('Map init failed', e); }
}

function searchOnMap() {
  const q = document.getElementById('mapSearchInput').value.trim();
  if (!q || !mapInstance) return;
  const svc = new google.maps.places.PlacesService(mapInstance);
  svc.textSearch({ query: q, location: mapInstance.getCenter(), radius: 5000 }, (results, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
      mapInstance.setCenter(results[0].geometry.location);
      mapInstance.setZoom(16);
      new google.maps.Marker({ map: mapInstance, position: results[0].geometry.location, title: results[0].name });
    }
  });
}

/* ── Math helpers ── */
function haversine(la1, lo1, la2, lo2) {
  const R = 6371000, dLa = (la2-la1)*Math.PI/180, dLo = (lo2-lo1)*Math.PI/180;
  const a = Math.sin(dLa/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function getMins(distM, transport) {
  return Math.max(1, Math.round(distM / SPEED[transport]));
}
function getRadius(transport) {
  return transport === '開車' ? 5000 : transport === '騎車' ? 3000 : 1500;
}
function priceLevelStr(lvl) {
  return {0:'免費',1:'$ 便宜',2:'$$ 中等',3:'$$$ 較貴',4:'$$$$ 高級'}[lvl] ?? '未提供';
}
function starsStr(r) {
  const f = Math.round(r||0); return '★'.repeat(f)+'☆'.repeat(5-f);
}
function typeEmoji(types) {
  const t = (types||[]).join(',');
  if (t.includes('japanese')) return '🍱';
  if (t.includes('korean'))   return '🥩';
  if (t.includes('chinese'))  return '🥢';
  if (t.includes('cafe'))     return '☕';
  if (t.includes('fast_food'))return '🍔';
  if (t.includes('bar'))      return '🍺';
  if (t.includes('dessert'))  return '🍡';
  if (t.includes('bakery'))   return '🥐';
  return '🍽️';
}

/* ── Place formatter ── */
function formatPlace(p, lat0, lng0, transport) {
  const lat  = p.geometry.location.lat();
  const lng  = p.geometry.location.lng();
  const dist = haversine(lat0, lng0, lat, lng);
  const mins = getMins(dist, transport);
  const photos = [];
  if (p.photos?.length) {
    for (let i = 0; i < Math.min(p.photos.length, 5); i++)
      photos.push(p.photos[i].getUrl({ maxWidth: 400 }));
  }
  return {
    placeId: p.place_id, name: p.name, lat, lng,
    dist: Math.round(dist), mins,
    rating: p.rating ?? 0, reviews: p.user_ratings_total ?? 0,
    priceLevel: p.price_level,
    isOpen: p.opening_hours?.isOpen() ?? null,
    types: (p.types||[]).filter(t=>!['food','point_of_interest','establishment'].includes(t)).slice(0,2),
    photos, address: p.vicinity || '',
  };
}

/* ══════════════════════════════════════
   AI SEARCH
══════════════════════════════════════ */
async function askAI() {
  const inp = document.getElementById('aiInput').value.trim();
  if (!inp) return;

  const pg = state.ai;
  if (!pg.lat) { pg.lat = 24.1477; pg.lng = 120.6736; }

  const box    = document.getElementById('aiResultBox');
  const body   = document.getElementById('aiResultBody');
  const header = document.getElementById('aiResultHeader');
  box.classList.add('show');
  header.textContent = '搜尋中，請稍候…';
  body.innerHTML = '<div class="loading-dots"><div class="ld"></div><div class="ld"></div><div class="ld"></div></div>';

  // Step 1: 先用 Places API 搜附近餐廳
  let nearbyList = [];
  try {
    await loadGMaps();
    const mapDiv = Object.assign(document.createElement('div'), { style: 'width:1px;height:1px;position:absolute;top:-9999px' });
    document.body.appendChild(mapDiv);
    const map = new google.maps.Map(mapDiv, { center: { lat: pg.lat, lng: pg.lng }, zoom: 15 });
    const svc = new google.maps.places.PlacesService(map);
    nearbyList = await new Promise(res => {
      svc.nearbySearch({
        location: new google.maps.LatLng(pg.lat, pg.lng),
        radius: getRadius(pg.transport), type: 'restaurant'
      }, (results, status) => {
        res(status === google.maps.places.PlacesServiceStatus.OK ? results : []);
      });
    });
  } catch(e) { /* skip, proceed with empty list */ }

  const formatted = nearbyList.map(p => formatPlace(p, pg.lat, pg.lng, pg.transport));

  // Step 2: 傳給 Gemini
  const listCtx = formatted.length > 0
    ? formatted.slice(0,20).map((r,i) =>
        `${i+1}. ${r.name}｜${r.mins}分鐘｜評分${r.rating}｜${priceLevelStr(r.priceLevel)}｜${r.types.join('/')}`
      ).join('\n')
    : '（無資料，請根據台中市一般情況推薦）';

  const prompt =
    `你是台灣美食推薦助理。使用者目前在台中市附近（${pg.lat.toFixed(3)},${pg.lng.toFixed(3)}），交通方式：${pg.transport}，用餐時段：${pg.meal}，預算每人 ${pg.budget >= 1500 ? '不限' : pg.budget + '元以內'}。\n\n` +
    `使用者需求：「${inp}」\n\n` +
    `以下是附近真實餐廳清單：\n${listCtx}\n\n` +
    `請從上面清單中選出最符合需求的 2-3 間，用繁體中文回覆，每間用以下 JSON 格式輸出（不要有其他文字）：\n` +
    `[{"name":"店名","mins":分鐘數,"rating":評分,"desc":"一句話介紹，提及料理特色與評價，20字內"}]`;

  try {
    const r    = await fetch(WORKER_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await r.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    let txt = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    txt = txt.replace(/```json|```/g, '').trim();

    let shops = [];
    try { shops = JSON.parse(txt); } catch(e) {
      // fallback: 顯示純文字
      header.textContent = '根據您的需求，AI 推薦如下';
      body.innerHTML = `<div style="padding:4px 0;font-size:14px;color:var(--mt);line-height:1.8;">${txt.replace(/\n/g,'<br>')}</div>`;
      return;
    }

    header.textContent = `根據您的需求，在附近找到了 ${shops.length} 個店家`;
    body.innerHTML = shops.map((s, i) => {
      const label = String.fromCharCode(97 + i); // a, b, c
      const stars = starsStr(s.rating || 0);
      return `<div class="ai-shop-card">
        <div class="ai-shop-label">${label}.</div>
        <div class="ai-shop-name">${s.name}</div>
        <div class="ai-shop-desc">${s.desc || ''}</div>
        <div class="ai-shop-rating">${stars} ${s.rating ? s.rating + ' 顆星' : ''}　⏱ ${s.mins || '?'} 分鐘</div>
      </div>`;
    }).join('');

  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:8px 0;font-size:13px;">錯誤：${e.message}</div>`;
    header.textContent = '無法取得建議';
  }
}

/* ══════════════════════════════════════
   GENERAL SEARCH
══════════════════════════════════════ */
async function searchNearby() {
  const pg = state.search;
  if (!pg.lat) { pg.lat = 24.1477; pg.lng = 120.6736; }

  showLoading('正在搜尋附近餐廳…');
  try {
    await loadGMaps();
    const mapDiv = Object.assign(document.createElement('div'), { style: 'width:1px;height:1px;position:absolute;top:-9999px' });
    document.body.appendChild(mapDiv);
    const map = new google.maps.Map(mapDiv, { center: { lat: pg.lat, lng: pg.lng }, zoom: 15 });
    placesService = new google.maps.places.PlacesService(map);
    placesService.nearbySearch({
      location: new google.maps.LatLng(pg.lat, pg.lng),
      radius: getRadius(pg.transport), type: 'restaurant'
    }, (results, status) => {
      hideLoading();
      if (status === google.maps.places.PlacesServiceStatus.OK && results?.length) {
        allRestaurants = results.map(p => formatPlace(p, pg.lat, pg.lng, pg.transport));
        renderResults(allRestaurants);
      } else {
        showErr('searchErrBanner', 'Google Places 回應異常，改用示範資料');
        allRestaurants = getMockData(pg);
        renderResults(allRestaurants);
      }
    });
  } catch(e) {
    hideLoading();
    showErr('searchErrBanner', 'Google Maps 載入失敗');
    allRestaurants = getMockData(pg);
    renderResults(allRestaurants);
  }
}

function renderResults(list) {
  const pg       = state.search;
  const filtered = list.filter(r => budgetMatch(r.priceLevel, pg.budget));
  const dists    = filtered.map(r => r.dist).sort((a,b) => a-b);
  const t1 = dists[Math.floor(dists.length/3)]     || 400;
  const t2 = dists[Math.floor(dists.length*2/3)]   || 900;
  const m1 = getMins(t1, pg.transport), m2 = getMins(t2, pg.transport);

  const near = filtered.filter(r => r.dist <= t1);
  const mid  = filtered.filter(r => r.dist > t1 && r.dist <= t2);
  const far  = filtered.filter(r => r.dist > t2);

  const el = document.getElementById('searchResults');
  el.innerHTML = '';
  renderGroup(el, near, `🟢 近（${m1} 分鐘內）`,           'near');
  renderGroup(el, mid,  `🔵 一般（${m1}–${m2} 分鐘）`,     'mid');
  renderGroup(el, far,  `🟣 遠（${m2} 分鐘以上）`,          'far');
}

function renderGroup(container, list, label, bc) {
  const sec = document.createElement('div');
  if (!list.length) {
    sec.innerHTML = `<div class="sec-label">${label} <span class="sec-count">0</span></div>
      <div class="empty-group">此區間目前沒有符合條件的餐廳</div>`;
    container.appendChild(sec); return;
  }
  const cards = list.slice(0,10).map((r, i) => {
    const ri      = allRestaurants.indexOf(r);
    const emoji   = typeEmoji(r.types);
    const thumb   = r.photos[0]
      ? `<img class="r-thumb" src="${r.photos[0]}" alt="" onerror="this.outerHTML='<div class=\\'r-thumb-placeholder\\'>${emoji}</div>'">`
      : `<div class="r-thumb-placeholder">${emoji}</div>`;
    const openTag = r.isOpen === null
      ? '<span class="r-tag unknown">營業狀態未知</span>'
      : r.isOpen
        ? '<span class="r-tag open">營業中</span>'
        : '<span class="r-tag closed">未營業</span>';
    const typeTag = r.types.length ? `<span class="r-tag">${r.types[0].replace(/_/g,' ')}</span>` : '';
    return `<div class="r-card" style="animation-delay:${i*0.05}s" onclick="showDetail(${ri})">
      ${thumb}
      <div class="r-body">
        <div class="r-name">${r.name}</div>
        <div class="r-tags"><span class="dbadge b-${bc}">${r.mins} 分鐘</span>${typeTag}${openTag}</div>
        <div class="r-footer">
          <span class="r-stars">${starsStr(r.rating)} ${r.rating||'—'}</span>
          <span class="r-meta">${priceLevelStr(r.priceLevel)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  sec.innerHTML = `<div class="sec-label">${label} <span class="sec-count">${list.length}</span></div>
    <div class="r-list">${cards}</div>`;
  container.appendChild(sec);
}

/* ── Detail ── */
function showDetail(idx) {
  const r = allRestaurants[idx];
  const emoji = typeEmoji(r.types);

  // Hero image
  const hero = document.getElementById('dHero');
  hero.innerHTML = r.photos[0]
    ? `<img class="detail-hero-img" src="${r.photos[0]}" alt="" onerror="this.outerHTML='<div class=\\'detail-hero-placeholder\\'>${emoji}</div>'">`
    : `<div class="detail-hero-placeholder">${emoji}</div>`;

  document.getElementById('dName').textContent = r.name;
  document.getElementById('dDist').textContent = `${r.dist}m · ${r.mins} 分鐘`;

  // Open badge — 從 Places Details 取得精確狀態
  const openBadge = document.getElementById('dOpenBadge');
  openBadge.textContent = r.isOpen === null ? '' : r.isOpen ? '✓ 現在營業中' : '✗ 目前未營業';
  openBadge.style.color = r.isOpen ? '#3B6D11' : r.isOpen === false ? '#A32D2D' : '';

  document.getElementById('dRating').innerHTML  = `<span class="stars-lg">${starsStr(r.rating)}</span> ${r.rating||'—'}`;
  document.getElementById('dReviews').textContent = r.reviews ? `${r.reviews.toLocaleString()} 則` : '—';
  document.getElementById('dPrice').textContent  = priceLevelStr(r.priceLevel);
  document.getElementById('dAddr').textContent   = r.address || '—';
  document.getElementById('dPhone').textContent  = '查詢中…';
  document.getElementById('dHours').innerHTML    = '<span style="color:var(--mg)">查詢中…</span>';
  document.getElementById('dMapsLink').href       = `https://www.google.com/maps/place/?q=place_id:${r.placeId}`;

  // Photo strip
  const ph = document.getElementById('dPhotos');
  if (r.photos.length) {
    ph.innerHTML = r.photos.map(u =>
      `<img src="${u}" alt="" onclick="openLightbox('${u}')"
        onerror="this.outerHTML='<div class=\\'photo-ph\\'>${emoji}<span>暫無圖片</span></div>'">`
    ).join('');
    if (r.photos.length < 3)
      ph.innerHTML += Array(3-r.photos.length).fill(`<div class="photo-ph">${emoji}<span>更多照片</span></div>`).join('');
  } else {
    ph.innerHTML = Array(3).fill(`<div class="photo-ph">${emoji}<span>暫無圖片</span></div>`).join('');
  }

  // Review summary placeholder
  document.getElementById('dReviewSummary').innerHTML =
    '<div class="loading-dots"><div class="ld"></div><div class="ld"></div><div class="ld"></div></div>';

  showPage('detailPage');

  // Fetch details (phone, hours, more photos, open status)
  if (placesService && r.placeId) {
    placesService.getDetails({
      placeId: r.placeId,
      fields: ['formatted_phone_number','opening_hours','photos','business_status']
    }, (res, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK) {
        document.getElementById('dPhone').textContent  = '未提供';
        document.getElementById('dHours').textContent  = '未提供';
        return;
      }
      document.getElementById('dPhone').textContent = res?.formatted_phone_number || '未提供';

      // Accurate open status
      if (res?.opening_hours) {
        const isOpenNow = res.opening_hours.isOpen();
        openBadge.textContent = isOpenNow ? '✓ 現在營業中' : '✗ 目前未營業';
        openBadge.style.color = isOpenNow ? '#3B6D11' : '#A32D2D';
        r.isOpen = isOpenNow;
      }

      // Hours
      const hoursEl = document.getElementById('dHours');
      if (res?.opening_hours?.weekday_text?.length) {
        const today = new Date().getDay();
        const dayIdx = today === 0 ? 6 : today - 1;
        hoursEl.innerHTML = res.opening_hours.weekday_text.map((d, i) =>
          `<div class="${i === dayIdx ? 'hours-today' : ''}">${d}</div>`
        ).join('');
      } else {
        hoursEl.textContent = '未提供';
      }

      // More photos
      if (res?.photos?.length > r.photos.length) {
        const newPhotos = [];
        for (let i = 0; i < Math.min(res.photos.length, 6); i++)
          newPhotos.push(res.photos[i].getUrl({ maxWidth: 500 }));
        r.photos = newPhotos;
        ph.innerHTML = newPhotos.map(u =>
          `<img src="${u}" alt="" onclick="openLightbox('${u}')"
            onerror="this.outerHTML='<div class=\\'photo-ph\\'>${emoji}</div>'">`
        ).join('');
        // Update hero
        hero.innerHTML = `<img class="detail-hero-img" src="${newPhotos[0]}" alt=""
          onerror="this.outerHTML='<div class=\\'detail-hero-placeholder\\'>${emoji}</div>'">`;
      }

      // AI Review Summary
      fetchReviewSummary(r);
    });
  } else {
    document.getElementById('dPhone').textContent = '—';
    document.getElementById('dHours').textContent = '—';
    fetchReviewSummary(r);
  }
}

/* ── AI Review Summary ── */
async function fetchReviewSummary(r) {
  const el = document.getElementById('dReviewSummary');
  const prompt =
    `你是一個餐廳評論分析師。以下是關於「${r.name}」的基本資訊：\n` +
    `評分：${r.rating} / 5，評論數：${r.reviews}，類型：${r.types.join('/')}，地點：台中市。\n\n` +
    `請根據這間餐廳的類型和評分，用繁體中文統整出這類餐廳常見的正面與負面評價（各2-3點），` +
    `輸出 JSON 格式（不要有其他文字）：\n` +
    `{"pos":["正面1","正面2","正面3"],"neg":["負面1","負面2"]}`;
  try {
    const res  = await fetch(WORKER_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    let txt = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    txt = txt.replace(/```json|```/g,'').trim();
    const obj = JSON.parse(txt);
    el.innerHTML =
      `<div style="margin-bottom:6px;font-size:12px;color:var(--mg);letter-spacing:1px;">正面評價</div>` +
      obj.pos.map(p => `<span class="review-tag pos">👍 ${p}</span>`).join('') +
      `<div style="margin:10px 0 6px;font-size:12px;color:var(--mg);letter-spacing:1px;">負面評價</div>` +
      obj.neg.map(n => `<span class="review-tag neg">👎 ${n}</span>`).join('');
  } catch(e) {
    el.innerHTML = '<span style="font-size:13px;color:var(--mg);">評論摘要暫時無法取得</span>';
  }
}

/* ── Lightbox ── */
function openLightbox(url) {
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightbox').classList.add('show');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('show');
}

/* ── Mock Data ── */
function getMockData(pg) {
  const items = [
    {n:'春水堂',     c:['taiwanese'], p:2, d:200},
    {n:'鼎王麻辣鍋', c:['chinese'],   p:3, d:550},
    {n:'一中豆花',   c:['dessert'],   p:1, d:350},
    {n:'老乾杯燒肉', c:['japanese'],  p:3, d:900},
    {n:'韓國村',     c:['korean'],    p:2, d:1200},
    {n:'老張牛肉麵', c:['chinese'],   p:1, d:450},
    {n:'三媽臭臭鍋', c:['chinese'],   p:1, d:750},
    {n:'呷二嘴',     c:['taiwanese'], p:1, d:1500},
    {n:'清新咖啡',   c:['cafe'],      p:2, d:2000},
    {n:'好初早餐',   c:['cafe'],      p:1, d:100},
  ];
  return items.map((it,i) => {
    const dist = it.d + Math.round((Math.random()-0.5)*80);
    return {
      placeId: String(i), name: it.n,
      lat: (pg.lat||24.1477) + (Math.random()-0.5)*0.01,
      lng: (pg.lng||120.6736)+ (Math.random()-0.5)*0.01,
      dist, mins: getMins(dist, pg.transport),
      rating: +(3.5+Math.random()*1.5).toFixed(1),
      reviews: Math.round(50+Math.random()*500),
      priceLevel: it.p, isOpen: Math.random()>0.3,
      types: it.c, photos: [], address: '台中市',
    };
  });
}

/* ── Init ── */
locateMe('ai');
locateMe('search');
