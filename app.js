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
const SPEED = { '步行': 80, '騎車': 583, '開車': 917 };

// 用餐時段對應的合理營業時間範圍（小時）
const MEAL_HOURS = {
  '早餐': { start: 6,  end: 11 },
  '午餐': { start: 11, end: 14 },
  '晚餐': { start: 17, end: 21 },
  '消夜': { start: 21, end: 26 }, // 26 = 隔天凌晨2點
};

let allRestaurants  = [];
let aiRestaurants   = []; // AI 頁面專用
let placesService   = null;
let aiPlacesService = null;
let mapInstance     = null;
let mapsLoaded      = false;
let loggedIn        = false;
let detailFrom      = 'search'; // 記錄從哪個頁面進入詳情

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
  const [page, prop] = stateKey === 'aiTransport'    ? ['ai','transport']    :
                       stateKey === 'aiMeal'          ? ['ai','meal']         :
                       stateKey === 'searchTransport' ? ['search','transport']:
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

/* ── 判斷餐廳在指定時段是否（可能）營業
   weekday_text 格式：「星期一: 11:00 – 21:00」或「24小時營業」
   若無 weekday_text 資料，回傳 null（未知）                    ── */
function mealTimeMatch(weekdayText, meal) {
  if (!weekdayText || !weekdayText.length) return null; // 無資料，不篩掉

  const now     = new Date();
  const dayIdx  = now.getDay(); // 0=日,1=一,...
  const twIdx   = dayIdx === 0 ? 6 : dayIdx - 1; // 轉成 weekday_text 順序（0=一）
  const todayTxt = weekdayText[twIdx] || '';

  // 24小時營業
  if (todayTxt.includes('24') || todayTxt.toLowerCase().includes('open 24')) return true;
  // 公休
  if (todayTxt.includes('公休') || todayTxt.toLowerCase().includes('closed')) return false;

  // 解析時段，例如 "11:00 – 21:00" 或 "11:00 – 14:00, 17:00 – 21:00"
  const range = MEAL_HOURS[meal];
  if (!range) return null;

  const timeRegex = /(\d{1,2}):(\d{2})\s*[–\-~～]\s*(\d{1,2}):(\d{2})/g;
  let match;
  while ((match = timeRegex.exec(todayTxt)) !== null) {
    let openH  = +match[1];
    let closeH = +match[3];
    if (closeH <= openH) closeH += 24; // 跨午夜處理

    // 用餐時段的起點或終點落在營業時間內即視為符合
    const mealStart = range.start;
    const mealEnd   = range.end;
    if (mealStart < closeH && mealEnd > openH) return true;
  }
  return false;
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

/* ── 建立隱藏 PlacesService ── */
function createHiddenPlacesService(lat, lng) {
  const mapDiv = Object.assign(document.createElement('div'), {
    style: 'width:1px;height:1px;position:absolute;top:-9999px'
  });
  document.body.appendChild(mapDiv);
  const map = new google.maps.Map(mapDiv, { center: { lat, lng }, zoom: 15 });
  return new google.maps.places.PlacesService(map);
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
    weekdayText: null, // 由 getDetails 填入
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

  // Step 1: 用 Places API 搜附近餐廳
  let nearbyList = [];
  try {
    await loadGMaps();
    aiPlacesService = createHiddenPlacesService(pg.lat, pg.lng);
    nearbyList = await new Promise(res => {
      const searchTypes = ['restaurant', 'meal_takeaway'];
      let combined = [], done = 0;
      const seenIds = new Set();
      searchTypes.forEach(type => {
        aiPlacesService.nearbySearch({
          location: new google.maps.LatLng(pg.lat, pg.lng),
          radius: getRadius(pg.transport), type
        }, (results, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK) {
            results.forEach(p => {
              if (!seenIds.has(p.place_id)) { seenIds.add(p.place_id); combined.push(p); }
            });
          }
          if (++done === searchTypes.length) res(combined);
        });
      });
    });
    });
  } catch(e) { /* 繼續，使用空清單 */ }

  const formatted = nearbyList.map(p => formatPlace(p, pg.lat, pg.lng, pg.transport));
  aiRestaurants = formatted; // 供 showDetailFromAI 使用

  // 預算篩選
  const budgetFiltered = formatted.filter(r => budgetMatch(r.priceLevel, pg.budget));

  // Step 2: 傳給 AI
  const listCtx = budgetFiltered.length > 0
    ? budgetFiltered.slice(0,20).map((r,i) =>
        `${i+1}. ${r.name}｜${r.mins}分鐘｜評分${r.rating}｜${priceLevelStr(r.priceLevel)}｜${r.types.join('/')}`
      ).join('\n')
    : '（無資料，請根據台中市一般情況推薦）';

  const prompt =
    `你是台灣美食推薦助理。使用者目前在台中市附近（${pg.lat.toFixed(3)},${pg.lng.toFixed(3)}），` +
    `交通方式：${pg.transport}，用餐時段：${pg.meal}，預算每人 ${pg.budget >= 1500 ? '不限' : pg.budget + '元以內'}。\n\n` +
    `使用者需求：「${inp}」\n\n` +
    `以下是附近真實餐廳清單：\n${listCtx}\n\n` +
    `請從清單中選出最符合需求的 3-5 間，用繁體中文回覆，只輸出 JSON 陣列（不要有其他文字）：\n` +
    `[{"name":"店名","mins":分鐘數,"rating":評分,"priceLevel":價格等級0-4,"desc":"一句話介紹20字內"}]`;

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
      header.textContent = 'AI 推薦如下';
      body.innerHTML = `<div style="padding:4px 0;font-size:14px;color:var(--mt);line-height:1.8;">${txt.replace(/\n/g,'<br>')}</div>`;
      return;
    }

    // 把 AI 回傳的店家對回 aiRestaurants 陣列
    const matched = shops.map(s => {
      const found = aiRestaurants.find(r => r.name === s.name);
      if (found) return { ...found, desc: s.desc };
      // AI 推薦但不在清單（edge case），建構假資料
      return {
        placeId: null, name: s.name, lat: pg.lat, lng: pg.lng,
        dist: Math.round((s.mins||5) * SPEED[pg.transport]),
        mins: s.mins || 5,
        rating: s.rating || 0, reviews: 0,
        priceLevel: s.priceLevel ?? null, isOpen: null, weekdayText: null,
        types: [], photos: [], address: '台中市', desc: s.desc,
      };
    });

    // 距離分類
    const near = matched.filter(r => r.mins <= 10);
    const mid  = matched.filter(r => r.mins > 10 && r.mins <= 20);
    const far  = matched.filter(r => r.mins > 20);

    header.textContent = `根據您的需求，找到 ${matched.length} 間推薦店家`;
    body.innerHTML = '';

    renderAIGroup(body, near, '🟢 近（10 分鐘內）');
    renderAIGroup(body, mid,  '🔵 一般（10–20 分鐘）');
    renderAIGroup(body, far,  '🟣 遠（20 分鐘以上）');

  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:8px 0;font-size:13px;">錯誤：${e.message}</div>`;
    header.textContent = '無法取得建議';
  }
}

/* AI 結果分組渲染 */
function renderAIGroup(container, list, label) {
  if (!list.length) return;
  const sec = document.createElement('div');
  const cards = list.map((s, i) => {
    const ri = aiRestaurants.findIndex(r => r.name === s.name);
    const clickable = ri >= 0;
    const stars = starsStr(s.rating || 0);
    const pTag = s.priceLevel != null ? `<span class="r-tag">${priceLevelStr(s.priceLevel)}</span>` : '';
    return `<div class="ai-shop-card ${clickable ? 'clickable' : ''}"
      ${clickable ? `onclick="showDetailFromAI(${ri})"` : ''}>
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div class="ai-shop-name">${s.name}</div>
          <div class="ai-shop-desc">${s.desc || ''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            <span class="dbadge b-${i < list.length ? (label.includes('近') ? 'near' : label.includes('一般') ? 'mid' : 'far') : 'mid'}">${s.mins} 分鐘</span>
            ${pTag}
          </div>
          <div class="ai-shop-rating">${stars} ${s.rating ? s.rating : '—'}　</div>
        </div>
        ${clickable ? '<div style="font-size:18px;color:var(--mb);align-self:center;">›</div>' : ''}
      </div>
    </div>`;
  }).join('');
  sec.innerHTML = `<div class="ai-group-label">${label}</div><div>${cards}</div>`;
  container.appendChild(sec);
}

/* ── 從 AI 頁面進入詳情 ── */
function showDetailFromAI(ri) {
  detailFrom = 'ai';
  // 同步到 allRestaurants 讓 showDetail 可以使用
  allRestaurants = aiRestaurants;
  placesService  = aiPlacesService;
  // 修改 back 按鈕回 aiPage
  document.querySelector('#detailPage .back-btn').setAttribute('onclick', "showPage('aiPage')");
  showDetail(ri);
}

/* ══════════════════════════════════════
   GENERAL SEARCH — 抓取 + 篩選（含時段）
══════════════════════════════════════ */
async function searchNearby() {
  const pg = state.search;
  if (!pg.lat) { pg.lat = 24.1477; pg.lng = 120.6736; }

  showLoading('正在搜尋附近餐廳…');
  try {
    await loadGMaps();
    placesService = createHiddenPlacesService(pg.lat, pg.lng);
    // 同時搜 restaurant + meal_takeaway，合併去重
    const searchTypes = ['restaurant', 'meal_takeaway'];
    let combined = [];
    let done = 0;
    const seenIds = new Set();

    searchTypes.forEach(type => {
      placesService.nearbySearch({
        location: new google.maps.LatLng(pg.lat, pg.lng),
        radius: getRadius(pg.transport),
        type
      }, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results?.length) {
          results.forEach(p => {
            if (!seenIds.has(p.place_id)) {
              seenIds.add(p.place_id);
              combined.push(p);
            }
          });
        }
        done++;
        if (done === searchTypes.length) {
          hideLoading();
          if (combined.length) {
            allRestaurants = combined.map(p => formatPlace(p, pg.lat, pg.lng, pg.transport));
            fetchWeekdayTextBatch(allRestaurants.slice(0, 20), () => renderResults(allRestaurants));
          } else {
            showErr('searchErrBanner', 'Google Places 回應異常，改用示範資料');
            allRestaurants = getMockData(pg);
            renderResults(allRestaurants);
          }
        }
      });
    });
  } catch(e) {
    hideLoading();
    showErr('searchErrBanner', 'Google Maps 載入失敗');
    allRestaurants = getMockData(pg);
    renderResults(allRestaurants);
  }
}

/* 批次抓 weekday_text，全部完成後 callback */
function fetchWeekdayTextBatch(list, callback) {
  let pending = list.length;
  if (!pending) { callback(); return; }

  list.forEach((r, i) => {
    setTimeout(() => {
      if (!placesService || !r.placeId) { if (--pending === 0) callback(); return; }
      placesService.getDetails(
        { placeId: r.placeId, fields: ['opening_hours'] },
        (res, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && res?.opening_hours) {
            r.weekdayText = res.opening_hours.weekday_text || null;
            // 直接用 Google 的 isOpen() 作為權威來源，不自己解析
            r.isOpen = res.opening_hours.isOpen();
          }
          if (--pending === 0) callback();
        }
      );
    }, i * 120);
  });
}

function renderResults(list) {
  const pg = state.search;

  // 雙重篩選：預算 + 用餐時段
  const filtered = list.filter(r => {
    if (!budgetMatch(r.priceLevel, pg.budget)) return false;
    // 時段判斷：只用 isOpen（Google 權威）+ weekdayText 輔助顯示
    // mealTimeMatch 僅用於「確定不在時段內」才篩掉，有疑慮一律保留
    const mealOk = mealTimeMatch(r.weekdayText, pg.meal);
    return mealOk !== false;
  });

  // 動態三等分距離
  const dists = filtered.map(r => r.dist).sort((a,b) => a-b);
  const t1 = dists[Math.floor(dists.length/3)]   || 400;
  const t2 = dists[Math.floor(dists.length*2/3)] || 900;
  const m1 = getMins(t1, pg.transport), m2 = getMins(t2, pg.transport);

  const near = filtered.filter(r => r.dist <= t1);
  const mid  = filtered.filter(r => r.dist > t1 && r.dist <= t2);
  const far  = filtered.filter(r => r.dist > t2);

  const el = document.getElementById('searchResults');
  el.innerHTML = '';

  // 顯示篩選摘要
  const budgetLabel  = pg.budget >= 1500 ? '不限預算' : `$${pg.budget} 以內`;
  const summaryEl    = document.createElement('div');
  summaryEl.className = 'results-summary';
  summaryEl.textContent = `${filtered.length} 間 · ${pg.transport} · ${pg.meal} · ${budgetLabel}`;
  el.appendChild(summaryEl);

  // 若有餐廳因時段被篩掉，顯示提示
  const excluded = list.filter(r => mealTimeMatch(r.weekdayText, pg.meal) === false).length;
  if (excluded > 0) {
    const note = document.createElement('div');
    note.className = 'meal-filter-note';
    note.textContent = `已略過 ${excluded} 間在${pg.meal}時段不營業的餐廳`;
    el.appendChild(note);
  }

  document.querySelector('#detailPage .back-btn').setAttribute('onclick', "showPage('searchPage')");
  renderGroup(el, near, `🟢 近（${m1} 分鐘內）`,        'near');
  renderGroup(el, mid,  `🔵 一般（${m1}–${m2} 分鐘）`,  'mid');
  renderGroup(el, far,  `🟣 遠（${m2} 分鐘以上）`,       'far');
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

    // 營業狀態：優先用 weekdayText 判斷，fallback 用 isOpen
    let openTag;
    if (r.weekdayText) {
      openTag = r.isOpen
        ? '<span class="r-tag open">營業中</span>'
        : '<span class="r-tag closed">未營業</span>';
    } else if (r.isOpen !== null) {
      openTag = r.isOpen
        ? '<span class="r-tag open">營業中</span>'
        : '<span class="r-tag closed">未營業</span>';
    } else {
      openTag = '<span class="r-tag unknown">狀態未知</span>';
    }
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

  const hero = document.getElementById('dHero');
  hero.innerHTML = r.photos[0]
    ? `<img class="detail-hero-img" src="${r.photos[0]}" alt="" onerror="this.outerHTML='<div class=\\'detail-hero-placeholder\\'>${emoji}</div>'">`
    : `<div class="detail-hero-placeholder">${emoji}</div>`;

  document.getElementById('dName').textContent = r.name;
  document.getElementById('dDist').textContent = `${r.dist}m · ${r.mins} 分鐘`;

  const openBadge = document.getElementById('dOpenBadge');
  openBadge.textContent = r.isOpen === null ? '' : r.isOpen ? '✓ 現在營業中' : '✗ 目前未營業';
  openBadge.style.color = r.isOpen ? '#3B6D11' : r.isOpen === false ? '#A32D2D' : '';

  document.getElementById('dRating').innerHTML   = `<span class="stars-lg">${starsStr(r.rating)}</span> ${r.rating||'—'}`;
  document.getElementById('dReviews').textContent = r.reviews ? `${r.reviews.toLocaleString()} 則` : '—';
  document.getElementById('dPrice').textContent   = priceLevelStr(r.priceLevel);
  document.getElementById('dAddr').textContent    = r.address || '—';
  document.getElementById('dPhone').textContent   = '查詢中…';
  document.getElementById('dMapsLink').href        = `https://www.google.com/maps/place/?q=place_id:${r.placeId}`;

  // 如果 weekdayText 已有（從 batch 拿到），直接渲染；否則等 getDetails
  const hoursEl = document.getElementById('dHours');
  if (r.weekdayText?.length) {
    renderHours(hoursEl, r.weekdayText);
  } else {
    hoursEl.innerHTML = '<span style="color:var(--mg)">查詢中…</span>';
  }

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

  document.getElementById('dReviewSummary').innerHTML =
    '<div class="loading-dots"><div class="ld"></div><div class="ld"></div><div class="ld"></div></div>';

  showPage('detailPage');

  // getDetails：電話、完整營業時間、更多照片
  if (placesService && r.placeId) {
    placesService.getDetails({
      placeId: r.placeId,
      fields: ['formatted_phone_number','opening_hours','photos','business_status']
    }, (res, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK) {
        document.getElementById('dPhone').textContent = '未提供';
        if (!r.weekdayText) hoursEl.textContent = '未提供';
        fetchReviewSummary(r);
        return;
      }
      document.getElementById('dPhone').textContent = res?.formatted_phone_number || '未提供';

      if (res?.opening_hours) {
        const isOpenNow = res.opening_hours.isOpen();
        openBadge.textContent = isOpenNow ? '✓ 現在營業中' : '✗ 目前未營業';
        openBadge.style.color = isOpenNow ? '#3B6D11' : '#A32D2D';
        r.isOpen = isOpenNow;
        r.weekdayText = res.opening_hours.weekday_text || null;
        renderHours(hoursEl, r.weekdayText);
      } else if (!r.weekdayText) {
        hoursEl.textContent = '未提供';
      }

      if (res?.photos?.length > r.photos.length) {
        const newPhotos = [];
        for (let i = 0; i < Math.min(res.photos.length, 6); i++)
          newPhotos.push(res.photos[i].getUrl({ maxWidth: 500 }));
        r.photos = newPhotos;
        ph.innerHTML = newPhotos.map(u =>
          `<img src="${u}" alt="" onclick="openLightbox('${u}')"
            onerror="this.outerHTML='<div class=\\'photo-ph\\'>${emoji}</div>'">`
        ).join('');
        hero.innerHTML = `<img class="detail-hero-img" src="${newPhotos[0]}" alt=""
          onerror="this.outerHTML='<div class=\\'detail-hero-placeholder\\'>${emoji}</div>'">`;
      }

      fetchReviewSummary(r);
    });
  } else {
    document.getElementById('dPhone').textContent = '—';
    if (!r.weekdayText) hoursEl.textContent = '—';
    fetchReviewSummary(r);
  }
}

/* 渲染營業時間，今天粗體 */
function renderHours(el, weekdayText) {
  if (!weekdayText?.length) { el.textContent = '未提供'; return; }
  const today  = new Date().getDay();
  const dayIdx = today === 0 ? 6 : today - 1;
  el.innerHTML = weekdayText.map((d, i) =>
    `<div class="${i === dayIdx ? 'hours-today' : ''}">${d}</div>`
  ).join('');
}

/* ── AI Review Summary ── */
async function fetchReviewSummary(r) {
  const el = document.getElementById('dReviewSummary');
  const prompt =
    `你是一個餐廳評論分析師。以下是「${r.name}」的資訊：` +
    `評分：${r.rating}/5，評論數：${r.reviews}，類型：${r.types.join('/')}，地點：台中市。\n\n` +
    `請根據這間餐廳的類型和評分，統整出常見正面與負面評價（各2-3點），` +
    `只輸出 JSON（不要有其他文字）：\n` +
    `{"pos":["正面1","正面2"],"neg":["負面1","負面2"]}`;
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
  const now = new Date().getHours();
  const items = [
    {n:'春水堂',     c:['taiwanese'], p:2, d:200,  wt:['星期一: 10:00 – 22:00','星期二: 10:00 – 22:00','星期三: 10:00 – 22:00','星期四: 10:00 – 22:00','星期五: 10:00 – 22:00','星期六: 10:00 – 22:00','星期日: 10:00 – 22:00']},
    {n:'鼎王麻辣鍋', c:['chinese'],   p:3, d:550,  wt:['星期一: 11:30 – 23:00','星期二: 11:30 – 23:00','星期三: 11:30 – 23:00','星期四: 11:30 – 23:00','星期五: 11:30 – 23:00','星期六: 11:30 – 23:00','星期日: 11:30 – 23:00']},
    {n:'好初早餐',   c:['cafe'],      p:1, d:100,  wt:['星期一: 07:00 – 11:00','星期二: 07:00 – 11:00','星期三: 07:00 – 11:00','星期四: 07:00 – 11:00','星期五: 07:00 – 11:00','星期六: 07:00 – 11:00','星期日: 公休']},
    {n:'老乾杯燒肉', c:['japanese'],  p:3, d:900,  wt:['星期一: 17:30 – 00:00','星期二: 17:30 – 00:00','星期三: 17:30 – 00:00','星期四: 17:30 – 00:00','星期五: 17:30 – 01:00','星期六: 17:30 – 01:00','星期日: 17:30 – 00:00']},
    {n:'韓國村',     c:['korean'],    p:2, d:1200, wt:['星期一: 11:00 – 21:00','星期二: 11:00 – 21:00','星期三: 11:00 – 21:00','星期四: 11:00 – 21:00','星期五: 11:00 – 21:30','星期六: 11:00 – 21:30','星期日: 11:00 – 21:00']},
    {n:'老張牛肉麵', c:['chinese'],   p:1, d:450,  wt:['星期一: 10:30 – 20:00','星期二: 10:30 – 20:00','星期三: 公休','星期四: 10:30 – 20:00','星期五: 10:30 – 20:00','星期六: 10:30 – 20:00','星期日: 10:30 – 20:00']},
    {n:'三媽臭臭鍋', c:['chinese'],   p:1, d:750,  wt:['星期一: 11:00 – 22:00','星期二: 11:00 – 22:00','星期三: 11:00 – 22:00','星期四: 11:00 – 22:00','星期五: 11:00 – 22:30','星期六: 11:00 – 22:30','星期日: 11:00 – 22:00']},
    {n:'呷二嘴',     c:['taiwanese'], p:1, d:1500, wt:['星期一: 13:00 – 22:30','星期二: 公休','星期三: 13:00 – 22:30','星期四: 13:00 – 22:30','星期五: 13:00 – 22:30','星期六: 13:00 – 22:30','星期日: 13:00 – 22:30']},
    {n:'清新咖啡',   c:['cafe'],      p:2, d:2000, wt:['星期一: 08:00 – 20:00','星期二: 08:00 – 20:00','星期三: 08:00 – 20:00','星期四: 08:00 – 20:00','星期五: 08:00 – 21:00','星期六: 08:00 – 21:00','星期日: 09:00 – 19:00']},
    {n:'夜間拉麵',   c:['japanese'],  p:2, d:800,  wt:['星期一: 20:00 – 03:00','星期二: 20:00 – 03:00','星期三: 20:00 – 03:00','星期四: 20:00 – 03:00','星期五: 20:00 – 04:00','星期六: 20:00 – 04:00','星期日: 20:00 – 03:00']},
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
      priceLevel: it.p,
      isOpen: mealTimeMatch(it.wt, pg.meal) ?? (Math.random()>0.3),
      weekdayText: it.wt,
      types: it.c, photos: [], address: '台中市',
    };
  });
}

/* ── Init ── */
locateMe('ai');
locateMe('search');
