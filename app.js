(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const THEME_KEY = 'pv_theme';
  const LOCAL_PRODUCTS_KEY = 'pv_local_products';
  const LOCAL_FILTER_KEY = 'pv_local_filter';
  const getStoredTheme = () => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch {
      return null;
    }
  };

  const syncVendorProductCountsFromProducts = () => {
    const vendors = Array.isArray(data.firestoreVendors) ? data.firestoreVendors : [];
    if (!vendors.length) return;

    const products = Array.isArray(data.firestoreProducts) ? data.firestoreProducts : [];
    const byOwner = new Map();

    products.forEach((p) => {
      if (!p || typeof p !== 'object') return;
      const ownerUid = String(p.ownerUid || '').trim();
      if (!ownerUid) return;
      byOwner.set(ownerUid, (byOwner.get(ownerUid) || 0) + 1);
    });

    vendors.forEach((v) => {
      if (!v || typeof v !== 'object') return;
      const ownerUid = String(v.ownerUid || '').trim();
      if (!ownerUid) return;
      v.products = Number(byOwner.get(ownerUid) || 0);
    });
  };

  const getStoredLocalFilter = () => {
    try {
      const raw = localStorage.getItem(LOCAL_FILTER_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const setStoredLocalFilter = (value) => {
    try {
      localStorage.setItem(LOCAL_FILTER_KEY, JSON.stringify(value || null));
    } catch {}
  };

  const getLocalProducts = () => {
    try {
      const raw = localStorage.getItem(LOCAL_PRODUCTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const setLocalProducts = (list) => {
    try {
      localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch {}
  };

  const cleanStr = (v) => String(v || '').trim();

  const buildLocationText = ({ country = '', region = '', city = '', fallback = '' } = {}) => {
    const parts = [cleanStr(city), cleanStr(region), cleanStr(country)].filter(Boolean);
    const t = parts.join('، ');
    return t || cleanStr(fallback);
  };

  const getProductLocationParts = (p) => {
    if (!p || typeof p !== 'object') return { country: '', region: '', city: '' };
    return {
      country: cleanStr(p.locationCountry || ''),
      region: cleanStr(p.locationRegion || ''),
      city: cleanStr(p.locationCity || ''),
    };
  };

  const profileDetailsState = {
    view: null,
    title: '',
    loading: false,
    items: [],
    editingId: null,
  };

  const loadMyProductsForProfile = async () => {
    const s = getStoredPiSession();
    if (!s || !s.uid) return [];

    const uid = String(s.uid);
    const local = getLocalProducts()
      .filter((p) => p && typeof p === 'object')
      .filter((p) => String(p.ownerUid || '') === uid)
      .map((p) => ({ id: String(p.id || ''), ...p }))
      .filter((p) => p && p.id && p.title);

    const db = getDb();
    if (!db) return local;

    try {
      const snap = await db.collection('products').where('ownerUid', '==', uid).limit(200).get();
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p && typeof p === 'object' && p.title)
        .map((p) => ({
          id: String(p.id),
          vendor: String(p.vendor || 'مستخدم'),
          title: String(p.title || ''),
          price: Number(p.price) || 0,
          currency: String(p.currency || 'π'),
          desc: String(p.desc || p.description || ''),
          imageUrl: String(p.imageUrl || ''),
          location: String(p.location || p.city || p.address || ''),
          locationCountry: cleanStr(p.locationCountry),
          locationRegion: cleanStr(p.locationRegion),
          locationCity: cleanStr(p.locationCity),
          rating: Number.isFinite(Number(p.rating)) ? Number(p.rating) : 0,
          likes: Number(p.likes) || 0,
          liked: Boolean(p.liked),
          category: String(p.category || 'الكل'),
          ownerUid: p.ownerUid ? String(p.ownerUid) : '',
          status: String(p.status || 'قيد المراجعة'),
          createdAt: p.createdAt || null,
        }));

      const getTs = (v) => {
        try {
          if (!v) return 0;
          if (typeof v.toMillis === 'function') return Number(v.toMillis()) || 0;
          if (typeof v.seconds === 'number') return Number(v.seconds) * 1000;
          return 0;
        } catch {
          return 0;
        }
      };

      list.sort((a, b) => getTs(b.createdAt) - getTs(a.createdAt));
      return [...local, ...list];
    } catch (err) {
      console.error('Firestore load my products error:', err);
      return local;
    }
  };

  const uploadProductImageToStorage = async (productId, imageFile) => {
    const pid = String(productId || '').trim();
    if (!pid || !imageFile) return '';
    if (!window.firebase || typeof window.firebase.storage !== 'function') return '';

    const okType = String(imageFile.type || '').toLowerCase().startsWith('image/');
    if (!okType) return '';
    const maxBytes = 3 * 1024 * 1024;
    if (Number(imageFile.size) > maxBytes) return '';

    const storage = window.firebase.storage();
    const rawName = String(imageFile.name || 'image');
    const safeName = rawName.replaceAll(' ', '_').replaceAll('/', '_').replaceAll('\\', '_');
    const path = `products/${pid}/${Date.now()}_${safeName}`;
    const ref = storage.ref().child(path);
    const meta = imageFile.type ? { contentType: String(imageFile.type) } : undefined;
    await ref.put(imageFile, meta);
    const url = await ref.getDownloadURL();
    return String(url || '');
  };

  const formatBytes = (bytes) => {
    const n = Number(bytes) || 0;
    if (n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i += 1;
    }
    const out = i === 0 ? String(Math.round(v)) : v < 10 ? v.toFixed(1) : String(Math.round(v));
    return `${out} ${units[i]}`;
  };

  const loadImageFromUrl = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image_load_failed'));
      img.src = String(url || '');
    });

  const canvasToBlob = (canvas, type, quality) =>
    new Promise((resolve) => {
      try {
        if (!canvas || typeof canvas.toBlob !== 'function') {
          resolve(null);
          return;
        }
        canvas.toBlob((b) => resolve(b || null), type, quality);
      } catch {
        resolve(null);
      }
    });

  const validateImageFile = (file) => {
    if (!file) return null;
    const okType = String(file.type || '').toLowerCase().startsWith('image/');
    if (!okType) return 'الملف المختار ليس صورة';
    const maxBytes = 10 * 1024 * 1024;
    if (Number(file.size) > maxBytes) return 'حجم الصورة كبير جداً (الحد 10MB)';
    return null;
  };

  const optimizeImageFile = async (file, { cropSquare = true, quality = 0.82, maxDim = 1024 } = {}) => {
    if (!file) return null;
    const errMsg = validateImageFile(file);
    if (errMsg) throw new Error(errMsg);

    const objectUrl = URL.createObjectURL(file);
    try {
      const img = await loadImageFromUrl(objectUrl);
      const sw = Number(img.naturalWidth || img.width) || 0;
      const sh = Number(img.naturalHeight || img.height) || 0;
      if (!sw || !sh) throw new Error('تعذر قراءة أبعاد الصورة');

      let sx = 0;
      let sy = 0;
      let sWidth = sw;
      let sHeight = sh;

      if (cropSquare) {
        const side = Math.min(sw, sh);
        sx = Math.floor((sw - side) / 2);
        sy = Math.floor((sh - side) / 2);
        sWidth = side;
        sHeight = side;
      }

      const md = Math.max(128, Math.min(2048, Number(maxDim) || 1024));
      const scale = Math.min(1, md / Math.max(sWidth, sHeight));
      const tw = Math.max(1, Math.round(sWidth * scale));
      const th = Math.max(1, Math.round(sHeight * scale));

      const canvas = document.createElement('canvas');
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('تعذر معالجة الصورة (canvas)');

      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, tw, th);

      const q = Math.max(0.5, Math.min(0.95, Number(quality) || 0.82));
      let blob = await canvasToBlob(canvas, 'image/webp', q);
      let outType = 'image/webp';
      let ext = 'webp';

      if (!blob) {
        blob = await canvasToBlob(canvas, 'image/jpeg', q);
        outType = 'image/jpeg';
        ext = 'jpg';
      }

      if (!blob) throw new Error('تعذر ضغط الصورة');

      const safeBase = String(file.name || 'image')
        .replaceAll(' ', '_')
        .replaceAll('/', '_')
        .replaceAll('\\', '_')
        .replace(/\.[^/.]+$/, '');
      const outName = `${safeBase || 'image'}_${Date.now()}.${ext}`;
      return new File([blob], outName, { type: outType });
    } finally {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {}
    }
  };

  const imageUiCfg = {
    prod: {
      inputId: 'prodImage',
      wrapId: 'prodImagePreviewWrap',
      imgId: 'prodImagePreview',
      metaId: 'prodImagePreviewMeta',
      clearBtnId: 'prodImageClearBtn',
      cropId: 'prodImageCrop',
      qualityId: 'prodImageQuality',
      hintId: 'prodImageQualityHint',
    },
    edit: {
      inputId: 'editProdImage',
      wrapId: 'editProdImagePreviewWrap',
      imgId: 'editProdImagePreview',
      metaId: 'editProdImagePreviewMeta',
      clearBtnId: 'editProdImageClearBtn',
      cropId: 'editProdImageCrop',
      qualityId: 'editProdImageQuality',
      hintId: 'editProdImageQualityHint',
    },
  };

  const imageUiState = {
    prod: { objectUrl: null },
    edit: { objectUrl: null },
  };

  const getImageUiOptions = (key) => {
    const cfg = imageUiCfg[key];
    if (!cfg) return { cropSquare: true, quality: 0.82, maxDim: 1024 };

    const cropEl = $('#' + cfg.cropId);
    const qualityEl = $('#' + cfg.qualityId);

    const cropSquare = cropEl ? Boolean(cropEl.checked) : true;
    const quality = qualityEl ? Number(qualityEl.value) : 0.82;
    return { cropSquare, quality, maxDim: 1024 };
  };

  const syncImageUiHint = (key) => {
    const cfg = imageUiCfg[key];
    if (!cfg) return;
    const hint = $('#' + cfg.hintId);
    if (!hint) return;

    const { cropSquare, quality, maxDim } = getImageUiOptions(key);
    const q = Math.round(Math.max(0, Math.min(1, Number(quality) || 0.82)) * 100);
    const cropLabel = cropSquare ? 'قص مربع' : 'بدون قص';
    hint.textContent = `سيتم ضغط الصورة إلى WebP (${cropLabel}) بجودة ${q}% وأقصى حجم ${maxDim}px`;
  };

  const clearImageUi = (key) => {
    const cfg = imageUiCfg[key];
    if (!cfg) return;

    const input = $('#' + cfg.inputId);
    const wrap = $('#' + cfg.wrapId);
    const img = $('#' + cfg.imgId);
    const meta = $('#' + cfg.metaId);
    const hint = $('#' + cfg.hintId);

    if (input) input.value = '';
    if (wrap) wrap.hidden = true;
    if (meta) meta.textContent = '';
    if (hint) hint.textContent = '';

    const prevUrl = imageUiState[key] ? imageUiState[key].objectUrl : null;
    if (prevUrl) {
      try {
        URL.revokeObjectURL(prevUrl);
      } catch {}
    }

    if (imageUiState[key]) imageUiState[key].objectUrl = null;
    if (img) img.removeAttribute('src');
  };

  const setImageUiFile = async (key, file) => {
    const cfg = imageUiCfg[key];
    if (!cfg) return;

    const wrap = $('#' + cfg.wrapId);
    const img = $('#' + cfg.imgId);
    const meta = $('#' + cfg.metaId);
    if (!wrap || !img || !meta) return;

    if (!file) {
      clearImageUi(key);
      return;
    }

    const errMsg = validateImageFile(file);
    if (errMsg) {
      clearImageUi(key);
      throw new Error(errMsg);
    }

    const prevUrl = imageUiState[key] ? imageUiState[key].objectUrl : null;
    if (prevUrl) {
      try {
        URL.revokeObjectURL(prevUrl);
      } catch {}
    }

    const objectUrl = URL.createObjectURL(file);
    if (imageUiState[key]) imageUiState[key].objectUrl = objectUrl;

    img.src = objectUrl;
    wrap.hidden = false;
    meta.textContent = `${String(file.name || 'image')} · ${formatBytes(file.size)}`;

    try {
      const dimImg = await loadImageFromUrl(objectUrl);
      const w = Number(dimImg.naturalWidth || dimImg.width) || 0;
      const h = Number(dimImg.naturalHeight || dimImg.height) || 0;
      if (w && h) meta.textContent = `${String(file.name || 'image')} · ${formatBytes(file.size)} · ${w}×${h}`;
    } catch {}

    syncImageUiHint(key);
  };

  const renderProfileDetails = () => {
    const card = $('#profileDetailsCard');
    const title = $('#profileDetailsTitle');
    const body = $('#profileDetailsBody');
    if (!card || !title || !body) return;

    const open = Boolean(profileDetailsState.view);
    card.hidden = !open;
    title.textContent = String(profileDetailsState.title || '');

    if (!open) {
      body.innerHTML = '';
      return;
    }

    if (profileDetailsState.loading) {
      body.innerHTML = '<div class="muted">جارٍ التحميل...</div>';
      return;
    }

    const items = Array.isArray(profileDetailsState.items) ? profileDetailsState.items : [];
    if (items.length === 0) {
      body.innerHTML = '<div class="muted">لا توجد عناصر بعد</div>';
      return;
    }

    if (profileDetailsState.view === 'favorites') {
      body.innerHTML = items
        .map(
          (p) => `
            <div class="card" style="margin-top:10px">
              <div class="row-between">
                <div>
                  <div class="card-title">${escapeHtml(p.title || 'منتج')}</div>
                  <div class="muted">${escapeHtml(p.vendor || '')}</div>
                </div>
                <span class="badge">${escapeHtml(String(p.price || 0))} ${escapeHtml(String(p.currency || 'π'))}</span>
              </div>
            </div>
          `
        )
        .join('');
      return;
    }

    if (profileDetailsState.view === 'my_products') {
      const s = getStoredPiSession();
      const uid = s && s.uid ? String(s.uid) : '';
      const editingId = String(profileDetailsState.editingId || '').trim();
      const editing = editingId ? items.find((x) => String(x.id) === editingId) : null;

      if (editing) {
        const parts = getProductLocationParts(editing);
        body.innerHTML = `
          <form id="editMyProductForm" class="stack" autocomplete="off" data-edit-product="${escapeHtml(String(editing.id))}">
            <div class="field">
              <label class="label" for="editProdTitle">اسم المنتج</label>
              <input id="editProdTitle" class="input" type="text" maxlength="20" required value="${escapeHtml(String(editing.title || ''))}" />
            </div>
            <div class="grid-2">
              <div class="field">
                <label class="label" for="editProdCategory">الفئة</label>
                <select id="editProdCategory" class="input" required>
                  ${data.homeCategories
                    .filter((c) => String(c) !== 'الكل')
                    .map((c) => {
                      const selected = String(editing.category || '') === String(c) ? 'selected' : '';
                      return `<option value="${escapeHtml(String(c))}" ${selected}>${escapeHtml(String(c))}</option>`;
                    })
                    .join('')}
                </select>
              </div>
              <div class="field">
                <label class="label" for="editProdPrice">السعر (π)</label>
                <input id="editProdPrice" class="input" type="number" min="0" step="0.00001" required value="${escapeHtml(String(editing.price || 0))}" />
              </div>
            </div>

            <div class="field">
              <label class="label" for="editProdImage">تغيير صورة المنتج (اختياري)</label>
              <input id="editProdImage" class="input" type="file" accept="image/*" />
            </div>

            <div id="editProdImagePreviewWrap" class="img-preview-wrap" hidden>
              <div class="img-preview-head">
                <div id="editProdImagePreviewMeta" class="muted"></div>
                <button id="editProdImageClearBtn" class="btn btn-outline btn-sm" type="button">إزالة</button>
              </div>
              <div class="img-preview">
                <img id="editProdImagePreview" class="img-preview-img" alt="معاينة صورة المنتج" />
              </div>
              <label class="local-radio">
                <input id="editProdImageCrop" type="checkbox" checked />
                <span class="local-radio-main">
                  <span class="local-radio-title">قص تلقائي (مربع)</span>
                  <span class="local-radio-desc">نقوم بقص الصورة من الوسط لتناسب العرض</span>
                </span>
              </label>
              <div class="field">
                <label class="label" for="editProdImageQuality">جودة الصورة</label>
                <input id="editProdImageQuality" class="input" type="range" min="0.5" max="0.95" step="0.05" value="0.82" />
                <div id="editProdImageQualityHint" class="muted"></div>
              </div>
            </div>

            <div class="grid-2">
              <div class="field">
                <label class="label" for="editProdCountry">البلد</label>
                <input id="editProdCountry" class="input" type="text" maxlength="20" value="${escapeHtml(String(parts.country || ''))}" />
              </div>
              <div class="field">
                <label class="label" for="editProdRegion">الجهة</label>
                <input id="editProdRegion" class="input" type="text" maxlength="20" value="${escapeHtml(String(parts.region || ''))}" />
              </div>
            </div>
            <div class="field">
              <label class="label" for="editProdCity">المدينة</label>
              <input id="editProdCity" class="input" type="text" maxlength="20" value="${escapeHtml(String(parts.city || ''))}" />
            </div>
            <div class="field">
              <label class="label" for="editProdDesc">الوصف</label>
              <textarea id="editProdDesc" class="input" rows="3" maxlength="60">${escapeHtml(String(editing.desc || ''))}</textarea>
            </div>

            <div class="grid-2">
              <button class="btn btn-primary w-full" type="submit">حفظ التعديلات</button>
              <button class="btn btn-outline w-full" type="button" data-myprod-cancel-edit="1">إلغاء</button>
            </div>
          </form>
        `;
        return;
      }

      const mineItems = items.filter((p) => String(p.ownerUid || '') === uid);
      body.innerHTML = mineItems
        .map((p) => {
          const status = String(p.status || '');
          const parts = getProductLocationParts(p);
          const locationText = buildLocationText({ ...parts, fallback: String(p.location || '') });
          return `
            <article class="card" style="margin-top:10px">
              <div class="row-between">
                <div>
                  <div class="card-title">${escapeHtml(String(p.title || 'منتج'))}</div>
                  <div class="muted">${escapeHtml(locationText || 'غير محدد')}</div>
                </div>
                <span class="badge">${escapeHtml(String(p.price || 0))} ${escapeHtml(String(p.currency || 'π'))}</span>
              </div>
              <div class="meta-row">
                <div><span class="muted">الحالة:</span> ${escapeHtml(status || '—')}</div>
                <div><span class="muted">الفئة:</span> ${escapeHtml(String(p.category || ''))}</div>
              </div>
              <div class="card-actions" style="gap:10px">
                <button class="btn btn-outline btn-sm" type="button" data-myprod-edit="${escapeHtml(String(p.id))}">تعديل</button>
                <button class="btn btn-danger btn-sm" type="button" data-myprod-delete="${escapeHtml(String(p.id))}">حذف</button>
              </div>
            </article>
          `;
        })
        .join('');
      return;
    }

    body.innerHTML = '<div class="muted">غير مدعوم</div>';
  };

  const setProfileDetailsView = (view, title) => {
    profileDetailsState.view = view;
    profileDetailsState.title = String(title || '');
    profileDetailsState.loading = false;
    profileDetailsState.items = [];
    profileDetailsState.editingId = null;
    renderProfile();
  };

  const updateMyProduct = async (productId, updates, imageFile) => {
    const s = getStoredPiSession();
    if (!s || !s.uid) {
      showToast('لازم تسجل الدخول عبر Pi أولاً');
      return false;
    }

    const pid = String(productId || '').trim();
    if (!pid) return false;

    const title = String(updates?.title || '').trim();
    const category = String(updates?.category || '').trim();
    const price = Number(updates?.price);
    const desc = String(updates?.desc || '').trim();
    if (!title || !category || !Number.isFinite(price) || price <= 0) {
      showToast('تأكد من إدخال اسم المنتج والسعر والفئة بشكل صحيح');
      return false;
    }
    if (desc.length > 20) {
      showToast('الوصف يجب ألا يتجاوز 20 حرفاً');
      return false;
    }

    const locationCountry = cleanStr(updates?.locationCountry);
    const locationRegion = cleanStr(updates?.locationRegion);
    const locationCity = cleanStr(updates?.locationCity);
    const location = buildLocationText({
      country: locationCountry,
      region: locationRegion,
      city: locationCity,
      fallback: String(updates?.location || ''),
    });

    const localList = getLocalProducts();
    const localIdx = localList.findIndex((p) => p && typeof p === 'object' && String(p.id || '') === pid);
    if (localIdx >= 0) {
      const p = localList[localIdx] || {};
      if (String(p.ownerUid || '') !== String(s.uid)) {
        showToast('لا يمكنك تعديل هذا المنتج');
        return false;
      }

      localList[localIdx] = {
        ...p,
        title,
        category,
        price,
        desc,
        location,
        locationCountry,
        locationRegion,
        locationCity,
      };
      setLocalProducts(localList);
      return true;
    }

    const db = getDb();
    if (!db) {
      showToast('Firebase غير متاح');
      return false;
    }

    try {
      const docRef = db.collection('products').doc(pid);
      const doc = await docRef.get();
      if (!doc.exists) {
        showToast('المنتج غير موجود');
        return false;
      }
      const cur = doc.data() || {};
      if (String(cur.ownerUid || '') !== String(s.uid)) {
        showToast('لا يمكنك تعديل هذا المنتج');
        return false;
      }

      let imageUrl = '';
      if (imageFile) {
        try {
          imageUrl = await uploadProductImageToStorage(pid, imageFile);
        } catch (err) {
          console.error('Upload edit product image error:', err);
          showToast('فشل رفع صورة المنتج');
        }
      }

      const patch = {
        title,
        category,
        price,
        desc,
        location,
        locationCountry,
        locationRegion,
        locationCity,
      };
      if (imageUrl) patch.imageUrl = String(imageUrl);

      await docRef.update(patch);
      return true;
    } catch (err) {
      console.error('Firestore update product error:', err);
      showToast('فشل تعديل المنتج');
      return false;
    }
  };

  const deleteMyProduct = async (productId) => {
    const s = getStoredPiSession();
    if (!s || !s.uid) {
      showToast('لازم تسجل الدخول عبر Pi أولاً');
      return false;
    }

    const pid = String(productId || '').trim();
    if (!pid) return false;

    const localList = getLocalProducts();
    const localIdx = localList.findIndex((p) => p && typeof p === 'object' && String(p.id || '') === pid);
    if (localIdx >= 0) {
      const p = localList[localIdx] || {};
      if (String(p.ownerUid || '') !== String(s.uid)) {
        showToast('لا يمكنك حذف هذا المنتج');
        return false;
      }
      localList.splice(localIdx, 1);
      setLocalProducts(localList);
      return true;
    }

    const db = getDb();
    if (!db) {
      showToast('Firebase غير متاح');
      return false;
    }

    try {
      const docRef = db.collection('products').doc(pid);
      const doc = await docRef.get();
      if (!doc.exists) {
        showToast('المنتج غير موجود');
        return false;
      }
      const cur = doc.data() || {};
      if (String(cur.ownerUid || '') !== String(s.uid)) {
        showToast('لا يمكنك حذف هذا المنتج');
        return false;
      }
      await docRef.delete();
      return true;
    } catch (err) {
      console.error('Firestore delete product error:', err);
      showToast('فشل حذف المنتج');
      return false;
    }
  };

  const openProfileDetails = async (view) => {
    const v = view === 'favorites' ? 'favorites' : view === 'my_products' ? 'my_products' : null;
    if (!v) return;

    setProfileDetailsView(v, v === 'favorites' ? 'المفضلة' : 'منتجاتي');
    profileDetailsState.loading = true;
    profileDetailsState.editingId = null;
    renderProfileDetails();

    if (v === 'favorites') {
      const list = await loadMyFavoritesForProfile();
      profileDetailsState.items = list;
    }

    if (v === 'my_products') {
      const list = await loadMyProductsForProfile();
      profileDetailsState.items = list;
    }

    profileDetailsState.loading = false;
    renderProfileDetails();
  };

  const productDetailsState = {
    productId: null,
  };

  const getProductByIdLocal = (productId) => {
    const pid = String(productId || '').trim();
    if (!pid) return null;
    return (Array.isArray(data.firestoreProducts) ? data.firestoreProducts : []).find((x) => String(x.id) === pid) || null;
  };

  const renderProductDetails = () => {
    const root = $('#productDetailsRoot');
    if (!root) return;

    const pid = String(productDetailsState.productId || '').trim();
    if (!pid) {
      root.innerHTML = '<div class="muted">اختر منتجاً أولاً</div>';
      return;
    }

    const p = getProductByIdLocal(pid);
    if (!p) {
      root.innerHTML = '<div class="muted">تعذر تحميل بيانات المنتج</div>';
      return;
    }

    const heartSvg = `
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>
    `.trim();

    const imageSvg = `
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"></path>
        <path d="M8 13l2-2 3 3 2-2 3 3"></path>
        <circle cx="9" cy="9" r="1"></circle>
      </svg>
    `.trim();

    const favClass = p.liked ? ' is-active' : '';
    const desc = String(p.desc || p.description || '').trim();
    const parts = getProductLocationParts(p);
    const locationText = buildLocationText({ ...parts, fallback: String(p.location || p.city || p.address || '') });
    const imgUrl = String(p.imageUrl || '').trim();
    const ratingNum = Number(p.rating) || 0;
    const ratingRounded = Math.max(0, Math.min(5, Math.round(ratingNum)));
    const ratingDisplay = Number.isFinite(Number(p.rating)) ? String(Number(p.rating)) : '0';
    const ratingStars = Array.from({ length: 5 })
      .map((_, i) => {
        const v = i + 1;
        const cls = v <= ratingRounded ? ' is-on' : '';
        return `<button class="rate-star${cls}" type="button" data-rate-product="${escapeHtml(p.id)}" data-rate-value="${escapeHtml(String(v))}" aria-label="تقييم ${escapeHtml(String(v))} من 5" aria-pressed="${v === ratingRounded ? 'true' : 'false'}">★</button>`;
      })
      .join('');

    root.innerHTML = `
      <div class="product-details">
        <div class="product-details-media">
          ${imgUrl ? `<img class="product-details-img" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(p.title || '')}" loading="lazy" />` : `<div class="product-placeholder">${imageSvg}</div>`}
          <button class="icon-btn icon-sq product-details-fav${favClass}" type="button" data-fav="${escapeHtml(p.id)}" aria-label="مفضلة" aria-pressed="${p.liked ? 'true' : 'false'}">${heartSvg}</button>
          <div class="product-details-vendor">${escapeHtml(p.vendor || '')}</div>
        </div>

        <div class="product-details-head">
          <h2 class="product-details-title">${escapeHtml(p.title || '')}</h2>
          <div class="product-details-meta">
            <div class="product-details-price">${escapeHtml(String(p.price || 0))} ${escapeHtml(String(p.currency || 'π'))}</div>
            <div class="product-details-rating"><span class="star">★</span> ${escapeHtml(ratingDisplay)}</div>
          </div>

          <div class="product-rate">
            <div class="product-rate-label">قيّم هذا المنتج</div>
            <div class="rating-stars" role="group" aria-label="التقييم">${ratingStars}</div>
          </div>
        </div>

        <div class="product-details-actions">
          <button id="contactSellerBtn" class="btn btn-primary" type="button">تواصل مع البائع</button>
          <button id="openChatBtn" class="btn btn-outline" type="button">💬 دردشة</button>
        </div>

        <div class="product-details-extra">
          <div class="product-details-section">
            <div class="product-details-label">الوصف</div>
            <div class="product-details-value">${desc ? escapeHtml(desc) : '<span class="muted">لا يوجد</span>'}</div>
          </div>

          <div class="product-details-section">
            <div class="product-details-label">البائع</div>
            <div class="product-details-value">${escapeHtml(String(p.vendor || ''))}</div>
          </div>

          <div class="product-details-section">
            <div class="product-details-label">الموقع</div>
            <div class="product-details-value">${locationText ? escapeHtml(locationText) : '<span class="muted">غير محدد</span>'}</div>
          </div>
        </div>
      </div>
    `;
  };

  const openProductDetails = (productId) => {
    const pid = String(productId || '').trim();
    if (!pid) return;
    productDetailsState.productId = pid;
    setPage('product');
    renderProductDetails();
  };

  const getProductFromFirestoreById = async (productId) => {
    const db = getDb();
    if (!db) return null;
    const pid = String(productId || '').trim();
    if (!pid) return null;

    const local = (Array.isArray(data.firestoreProducts) ? data.firestoreProducts : []).find((x) => String(x.id) === pid);
    if (local) return local;

    try {
      const doc = await db.collection('products').doc(pid).get();
      if (!doc.exists) return null;
      const p = doc.data() || {};
      return {
        id: pid,
        vendor: String(p.vendor || ''),
        title: String(p.title || ''),
        price: Number(p.price) || 0,
        currency: String(p.currency || 'π'),
        desc: String(p.desc || p.description || ''),
        imageUrl: String(p.imageUrl || ''),
        location: String(p.location || p.city || p.address || ''),
      };
    } catch (err) {
      console.error('Firestore get product error:', err);
      return null;
    }
  };

  const loadMyFavoritesForProfile = async () => {
    const db = getDb();
    const s = getStoredPiSession();
    if (!db || !s || !s.uid) return [];

    try {
      const snap = await db
        .collection('users')
        .doc(String(s.uid))
        .collection('favorites')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();

      const ids = snap.docs.map((d) => String(d.id)).filter(Boolean);
      const prods = await Promise.all(ids.map((id) => getProductFromFirestoreById(id)));
      return prods.filter(Boolean);
    } catch (err) {
      console.error('Firestore load favorites for profile error:', err);
      return [];
    }
  };

  const loadProfileStatsFromFirestore = async () => {
    const db = getDb();
    const s = getStoredPiSession();
    if (!db || !s || !s.uid) {
      data.profileStats = { ratings: 0, favorites: 0 };
      renderProfile();
      return;
    }

    try {
      const userRef = db.collection('users').doc(String(s.uid));
      const [ratingsSnap, favSnap] = await Promise.all([
        userRef.collection('ratings').limit(1000).get(),
        userRef.collection('favorites').limit(2000).get(),
      ]);

      data.profileStats = {
        ratings: ratingsSnap.size,
        favorites: favSnap.size,
      };
    } catch (err) {
      console.error('Firestore load profile stats error:', err);
    } finally {
      renderProfile();
    }
  };

  const loadFavoriteProductIdsFromFirestore = async (session) => {
    const db = getDb();
    if (!db || !session || !session.uid) return new Set();

    try {
      const snap = await db.collection('users').doc(String(session.uid)).collection('favorites').limit(2000).get();
      const ids = snap.docs
        .map((d) => d.id)
        .filter(Boolean)
        .map((x) => String(x));
      return new Set(ids);
    } catch (err) {
      console.error('Firestore load favorites error:', err);
      return new Set();
    }
  };

  const loadFollowVendorIdsFromFirestore = async (session) => {
    const db = getDb();
    if (!db || !session || !session.uid) return new Set();

    try {
      const snap = await db.collection('users').doc(String(session.uid)).collection('follows').limit(2000).get();
      const ids = snap.docs
        .map((d) => d.id)
        .filter(Boolean)
        .map((x) => String(x));
      return new Set(ids);
    } catch (err) {
      console.error('Firestore load follows error:', err);
      return new Set();
    }
  };

  const toggleFavoriteProductInFirestore = async (productId) => {
    const db = getDb();
    const s = getStoredPiSession();
    if (!db || !s || !s.uid) {
      showToast('لازم تسجل الدخول عبر Pi أولاً');
      setPage('profile');
      return null;
    }

    const pid = String(productId || '').trim();
    if (!pid) return null;

    try {
      const favRef = db.collection('users').doc(String(s.uid)).collection('favorites').doc(pid);
      const prodRef = db.collection('products').doc(pid);

      const res = await db.runTransaction(async (tx) => {
        const favDoc = await tx.get(favRef);
        const prodDoc = await tx.get(prodRef);

        const currentLikes = prodDoc.exists ? Number(prodDoc.data()?.likes) || 0 : 0;

        if (favDoc.exists) {
          tx.delete(favRef);
          if (prodDoc.exists) tx.update(prodRef, { likes: window.firebase.firestore.FieldValue.increment(-1) });
          return { liked: false, likes: Math.max(0, currentLikes - 1) };
        }

        tx.set(
          favRef,
          {
            productId: pid,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        if (prodDoc.exists) tx.update(prodRef, { likes: window.firebase.firestore.FieldValue.increment(1) });
        return { liked: true, likes: currentLikes + 1 };
      });

      return res;
    } catch (err) {
      console.error('Firestore toggle favorite error:', err);
      showToast('تعذر تحديث المفضلة');
      return null;
    }
  };

  const toggleFollowVendorInFirestore = async (vendorId) => {
    const db = getDb();
    const s = getStoredPiSession();
    if (!db || !s || !s.uid) {
      showToast('لازم تسجل الدخول عبر Pi أولاً');
      setPage('profile');
      return null;
    }

    const vid = String(vendorId || '').trim();
    if (!vid) return null;

    try {
      const followRef = db.collection('users').doc(String(s.uid)).collection('follows').doc(vid);
      const vendorRef = db.collection('vendors').doc(vid);

      const res = await db.runTransaction(async (tx) => {
        const followDoc = await tx.get(followRef);
        const vendorDoc = await tx.get(vendorRef);

        const currentFollowers = vendorDoc.exists ? Number(vendorDoc.data()?.followers) || 0 : 0;

        if (followDoc.exists) {
          tx.delete(followRef);
          if (vendorDoc.exists) tx.update(vendorRef, { followers: window.firebase.firestore.FieldValue.increment(-1) });
          return { following: false, followers: Math.max(0, currentFollowers - 1) };
        }

        tx.set(
          followRef,
          {
            vendorId: vid,
            createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        if (vendorDoc.exists) tx.update(vendorRef, { followers: window.firebase.firestore.FieldValue.increment(1) });
        return { following: true, followers: currentFollowers + 1 };
      });

      return res;
    } catch (err) {
      console.error('Firestore toggle follow error:', err);
      showToast('تعذر تحديث المتابعة');
      return null;
    }
  };

  const rateProductInFirestore = async (productId, ratingValue) => {
    const db = getDb();
    const s = getStoredPiSession();
    if (!db || !s || !s.uid) {
      showToast('لازم تسجل الدخول عبر Pi أولاً');
      setPage('profile');
      return null;
    }

    const pid = String(productId || '').trim();
    const val = Number(ratingValue);
    if (!pid || !Number.isFinite(val) || val < 1 || val > 5) {
      showToast('التقييم يجب أن يكون بين 1 و 5');
      return null;
    }

    try {
      const prodRef = db.collection('products').doc(pid);
      const ratingRef = prodRef.collection('ratings').doc(String(s.uid));
      const userRatingRef = db.collection('users').doc(String(s.uid)).collection('ratings').doc(pid);

      const res = await db.runTransaction(async (tx) => {
        const [prodDoc, rateDoc] = await Promise.all([tx.get(prodRef), tx.get(ratingRef)]);
        if (!prodDoc.exists) return null;

        const prev = rateDoc.exists ? Number(rateDoc.data()?.value) : null;
        const currentSum = Number(prodDoc.data()?.ratingSum) || 0;
        const currentCount = Number(prodDoc.data()?.ratingCount) || 0;

        const nextSum = prev == null ? currentSum + val : currentSum + (val - prev);
        const nextCount = prev == null ? currentCount + 1 : currentCount;
        const avg = nextCount > 0 ? nextSum / nextCount : 0;

        tx.set(
          ratingRef,
          {
            uid: String(s.uid),
            username: String(s.pi_username || ''),
            value: val,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        tx.set(
          userRatingRef,
          {
            productId: pid,
            value: val,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        tx.update(prodRef, { ratingSum: nextSum, ratingCount: nextCount, rating: avg });

        return { rating: avg };
      });

      return res;
    } catch (err) {
      console.error('Firestore rate product error:', err);
      showToast('تعذر حفظ التقييم');
      return null;
    }
  };

  const setAdsRequestMode = (requesting) => {
    const list = $('#adsList');
    const card = $('#adsRequestCard');
    if (list) list.hidden = Boolean(requesting);
    if (card) card.hidden = !Boolean(requesting);
  };

  const setProductAddMode = (adding) => {
    const card = $('#homeAddProductCard');
    const cats = $('#categoryRow');
    const list = $('#productsList');
    const banner = $('#homeSponsoredBanner');
    if (card) card.hidden = !Boolean(adding);
    if (cats) cats.hidden = Boolean(adding);
    if (list) list.hidden = Boolean(adding);
    if (banner) banner.hidden = Boolean(adding) ? true : banner.hidden;
  };

  const createAdInFirestore = async (session, payload) => {
    const db = getDb();
    if (!db || !session || !session.uid) {
      showToast('Firebase غير مهيأ. أكمل إعداد FIREBASE_CONFIG أولاً.');
      return null;
    }

    try {
      const title = String(payload?.title || '').trim();
      const desc = String(payload?.desc || '').trim();
      const budget = Number(payload?.budget);
      const durationDays = Number(payload?.durationDays);

      if (!title || !desc || !Number.isFinite(budget) || budget <= 0 || !Number.isFinite(durationDays) || durationDays <= 0) {
        showToast('تأكد من إدخال بيانات الإعلان بشكل صحيح');
        return null;
      }

      const created = new Date().toISOString().slice(0, 10);

      const docRef = await db.collection('ads').add({
        title,
        desc,
        budget,
        durationDays,
        created,
        views: null,
        clicks: null,
        status: 'قيد المراجعة',
        ownerUid: String(session.uid),
        ownerUsername: String(session.pi_username || ''),
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
      });

      return docRef.id;
    } catch (err) {
      console.error('Firestore create ad error:', err);
      showToast('فشل إرسال طلب الإعلان');
      return null;
    }
  };

  const loadAdsFromFirestore = async () => {
    const db = getDb();
    if (!db) {
      adsLoading = false;
      adsLoadedOnce = true;
      data.firestoreAds = [];
      renderAds();
      return;
    }

    try {
      adsLoading = true;
      renderAds();

      const snap = await db.collection('ads').orderBy('createdAt', 'desc').limit(200).get();
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((a) => a && typeof a === 'object' && a.title)
        .map((a) => ({
          id: String(a.id),
          title: String(a.title || ''),
          desc: String(a.desc || ''),
          budget: Number(a.budget) || 0,
          durationDays: Number(a.durationDays) || 0,
          created: String(a.created || ''),
          views: a.views == null ? null : Number(a.views),
          clicks: a.clicks == null ? null : Number(a.clicks),
          status: String(a.status || 'قيد المراجعة'),
          ownerUid: a.ownerUid ? String(a.ownerUid) : '',
          ownerUsername: a.ownerUsername ? String(a.ownerUsername) : '',
          imageUrl: a.imageUrl ? String(a.imageUrl) : '',
          targetUrl: a.targetUrl ? String(a.targetUrl) : '',
          placement: a.placement ? String(a.placement) : '',
        }));

      data.firestoreAds = list;
    } catch (err) {
      console.error('Firestore load ads error:', err);
    } finally {
      adsLoading = false;
      adsLoadedOnce = true;
      renderAds();
      renderHomeSponsoredBanner();
      renderHomeProducts();
      renderVendors($('#vendorSearch')?.value || '');
      renderChat();
    }
  };

  const setStoredTheme = (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {}
  };

  const getInitialTheme = () => {
    const stored = getStoredTheme();
    if (stored === 'dark' || stored === 'light') return stored;

    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch {}

    return 'light';
  };

  const applyTheme = (theme) => {
    if (!document.body) return;
    document.body.classList.toggle('dark', theme === 'dark');
  };

  const syncThemeToggle = () => {
    const btn = $('#themeToggle');
    if (!btn || !document.body) return;
    const isDark = document.body.classList.contains('dark');
    btn.textContent = isDark ? '☀' : '☾';
    btn.setAttribute('aria-label', isDark ? 'تبديل للوضع الفاتح' : 'تبديل للوضع الداكن');
  };

  const setTheme = (theme, withToast = false) => {
    const t = theme === 'dark' ? 'dark' : 'light';
    applyTheme(t);
    setStoredTheme(t);
    syncThemeToggle();
    if (withToast) showToast(t === 'dark' ? 'تم تفعيل الوضع الداكن' : 'تم تفعيل الوضع الفاتح');
  };

  const toggleTheme = () => {
    if (!document.body) return;
    const next = document.body.classList.contains('dark') ? 'light' : 'dark';
    setTheme(next, true);
  };

  const PI_SESSION_KEY = 'pv_pi_session';

  const getStoredPiSession = () => {
    try {
      const raw = localStorage.getItem(PI_SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return null;
      if (!s.uid || !s.pi_username) return null;
      return s;
    } catch {
      return null;
    }
  };

  const setStoredPiSession = (session) => {
    try {
      localStorage.setItem(PI_SESSION_KEY, JSON.stringify(session));
    } catch {}
  };

  const clearStoredPiSession = () => {
    try {
      localStorage.removeItem(PI_SESSION_KEY);
    } catch {}
  };

  let fbReady = false;
  let fbDb = null;

  const initFirebase = () => {
    if (fbReady) return Boolean(fbDb);

    try {
      if (!window.firebase || typeof window.firebase.initializeApp !== 'function') return false;

      const cfg = window.FIREBASE_CONFIG || {};
      const hasConfig = Boolean(cfg && cfg.apiKey && cfg.projectId);
      if (!hasConfig) return false;

      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(cfg);
      }

      fbDb = window.firebase.firestore();
      fbReady = true;
      return true;
    } catch (err) {
      console.error('Firebase init error:', err);
      fbReady = true;
      fbDb = null;
      return false;
    }
  };

  const getDb = () => {
    if (fbDb) return fbDb;
    if (initFirebase()) return fbDb;
    return null;
  };

  const upsertUserInFirestore = async (session) => {
    const db = getDb();
    if (!db || !session || !session.uid) return;

    try {
      await db
        .collection('users')
        .doc(String(session.uid))
        .set(
          {
            uid: String(session.uid),
            pi_username: String(session.pi_username || ''),
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    } catch (err) {
      console.error('Firestore upsert user error:', err);
    }
  };

  const saveChatMessageToFirestore = async (session, msg) => {
    const db = getDb();
    if (!db || !session || !session.uid || !msg) return;

    try {
      await db
        .collection('users')
        .doc(String(session.uid))
        .collection('chat')
        .add({
          from: String(msg.from || ''),
          text: String(msg.text || ''),
          time: String(msg.time || ''),
          ts: window.firebase.firestore.FieldValue.serverTimestamp(),
        });
    } catch (err) {
      console.error('Firestore save chat error:', err);
    }
  };

  const loadChatFromFirestore = async () => {
    const db = getDb();
    const s = getStoredPiSession();
    if (!db || !s || !s.uid) {
      chatLoading = false;
      chatLoadedOnce = true;
      data.chat = [];
      renderChat();
      return;
    }

    try {
      chatLoading = true;
      renderChat();
      const snap = await db
        .collection('users')
        .doc(String(s.uid))
        .collection('chat')
        .orderBy('ts', 'asc')
        .limit(100)
        .get();

      const msgs = snap.docs
        .map((d) => d.data())
        .filter((m) => m && typeof m === 'object' && m.text)
        .map((m) => ({
          from: m.from === 'admin' ? 'admin' : 'user',
          text: String(m.text || ''),
          time: String(m.time || ''),
        }));

      data.chat = msgs;
    } catch (err) {
      console.error('Firestore load chat error:', err);
    } finally {
      chatLoading = false;
      chatLoadedOnce = true;
      renderChat();
    }
  };

  const createProductInFirestore = async (session, payload) => {
    const db = getDb();
    if (!db || !session || !session.uid) {
      showToast('Firebase غير مهيأ. أكمل إعداد FIREBASE_CONFIG أولاً.');
      return null;
    }

    try {
      const title = String(payload?.title || '').trim();
      const category = String(payload?.category || '').trim();
      const price = Number(payload?.price);
      const desc = String(payload?.desc || payload?.description || '').trim();
      const imageFile = payload?.imageFile || null;
      const locationCountry = cleanStr(payload?.locationCountry);
      const locationRegion = cleanStr(payload?.locationRegion);
      const locationCity = cleanStr(payload?.locationCity);
      const location = buildLocationText({
        country: locationCountry,
        region: locationRegion,
        city: locationCity,
        fallback: String(payload?.location || payload?.city || payload?.address || ''),
      });

      if (!title || !category || !Number.isFinite(price) || price <= 0) {
        showToast('تأكد من إدخال اسم المنتج والسعر والفئة بشكل صحيح');
        return null;
      }

      const docRef = await db.collection('products').add({
        title,
        category,
        price,
        currency: 'π',
        desc,
        imageUrl: '',
        location,
        locationCountry,
        locationRegion,
        locationCity,
        rating: 0,
        ratingSum: 0,
        ratingCount: 0,
        vendor: String(session.pi_username || ''),
        ownerUid: String(session.uid),
        status: 'قيد المراجعة',
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      });

      if (imageFile) {
        try {
          const maxBytes = 3 * 1024 * 1024;
          const okType = String(imageFile.type || '').toLowerCase().startsWith('image/');
          if (!okType) {
            showToast('الملف المختار ليس صورة');
            return docRef.id;
          }
          if (Number(imageFile.size) > maxBytes) {
            showToast('حجم الصورة كبير (الحد 3MB)');
            return docRef.id;
          }

          if (!window.firebase || typeof window.firebase.storage !== 'function') {
            showToast('Firebase Storage غير متاح');
          } else {
            const storage = window.firebase.storage();
            const rawName = String(imageFile.name || 'image');
            const safeName = rawName.replaceAll(' ', '_').replaceAll('/', '_').replaceAll('\\', '_');
            const path = `products/${docRef.id}/${Date.now()}_${safeName}`;
            const ref = storage.ref().child(path);
            const meta = imageFile.type ? { contentType: String(imageFile.type) } : undefined;
            await ref.put(imageFile, meta);
            const url = await ref.getDownloadURL();
            await db.collection('products').doc(String(docRef.id)).update({ imageUrl: String(url || '') });
          }
        } catch (err) {
          console.error('Firestore upload product image error:', err);
          showToast('فشل رفع صورة المنتج');
        }
      }

      return docRef.id;
    } catch (err) {
      console.error('Firestore create product error:', err);
      showToast('فشل إضافة المنتج');
      return null;
    }
  };

  const loadProductsFromFirestore = async () => {
    const db = getDb();
    const localList = getLocalProducts()
      .filter((p) => p && typeof p === 'object' && p.title)
      .map((p) => ({
        id: String(p.id || ''),
        vendor: String(p.vendor || 'مستخدم'),
        title: String(p.title || ''),
        price: Number(p.price) || 0,
        currency: String(p.currency || 'π'),
        desc: String(p.desc || p.description || ''),
        imageUrl: String(p.imageUrl || ''),
        location: String(p.location || p.city || p.address || ''),
        locationCountry: cleanStr(p.locationCountry),
        locationRegion: cleanStr(p.locationRegion),
        locationCity: cleanStr(p.locationCity),
        rating: Number.isFinite(Number(p.rating)) ? Number(p.rating) : 0,
        likes: Number(p.likes) || 0,
        liked: Boolean(p.liked),
        category: String(p.category || 'الكل'),
        ownerUid: p.ownerUid ? String(p.ownerUid) : '',
        status: String(p.status || 'مقبول'),
      }))
      .filter((p) => String(p.status || '') === 'مقبول');

    data.localProducts = localList;

    if (!db) {
      data.firestoreProducts = [...localList];
      syncVendorProductCountsFromProducts();
      renderVendors($('#vendorSearch')?.value || '');
      renderHomeProducts();
      return;
    }

    try {
      const s = getStoredPiSession();
      const favSet = s ? await loadFavoriteProductIdsFromFirestore(s) : new Set();
      const snap = await db.collection('products').orderBy('createdAt', 'desc').limit(200).get();
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p && typeof p === 'object' && p.title)
        .map((p) => ({
          id: String(p.id),
          vendor: String(p.vendor || 'مستخدم'),
          title: String(p.title || ''),
          price: Number(p.price) || 0,
          currency: String(p.currency || 'π'),
          desc: String(p.desc || p.description || ''),
          imageUrl: String(p.imageUrl || ''),
          location: String(p.location || p.city || p.address || ''),
          locationCountry: cleanStr(p.locationCountry),
          locationRegion: cleanStr(p.locationRegion),
          locationCity: cleanStr(p.locationCity),
          rating: Number.isFinite(Number(p.rating)) ? Number(p.rating) : 0,
          likes: Number(p.likes) || 0,
          liked: favSet.has(String(p.id)),
          category: String(p.category || 'الكل'),
          ownerUid: p.ownerUid ? String(p.ownerUid) : '',
          status: String(p.status || 'مقبول'),
        }))
        .filter((p) => String(p.status || '') === 'مقبول');

      data.firestoreProducts = [...localList, ...list];
      syncVendorProductCountsFromProducts();
      renderVendors($('#vendorSearch')?.value || '');
      renderHomeProducts();
    } catch (err) {
      console.error('Firestore load products error:', err);
    }
  };

  const createProductLocal = (session, payload) => {
    if (!session || !session.uid) return null;
    const title = String(payload?.title || '').trim();
    const category = String(payload?.category || '').trim();
    const price = Number(payload?.price);
    const desc = String(payload?.desc || payload?.description || '').trim();
    const locationCountry = cleanStr(payload?.locationCountry);
    const locationRegion = cleanStr(payload?.locationRegion);
    const locationCity = cleanStr(payload?.locationCity);
    const location = buildLocationText({
      country: locationCountry,
      region: locationRegion,
      city: locationCity,
      fallback: String(payload?.location || payload?.city || payload?.address || ''),
    });

    if (!title || !category || !Number.isFinite(price) || price <= 0) {
      showToast('تأكد من إدخال اسم المنتج والسعر والفئة بشكل صحيح');
      return null;
    }

    const id = `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const p = {
      id,
      vendor: String(session.pi_username || ''),
      title,
      price,
      currency: 'π',
      desc,
      location,
      locationCountry,
      locationRegion,
      locationCity,
      rating: 0,
      likes: 0,
      liked: false,
      category,
      ownerUid: String(session.uid),
      status: 'مقبول',
    };

    const next = [p, ...getLocalProducts()];
    setLocalProducts(next);
    return id;
  };

  let piSdkReady = false;

  const initPiSdk = () => {
    if (piSdkReady) return true;

    try {
      if (!window.Pi || typeof window.Pi.init !== 'function') return false;
      const ref = document.referrer || '';
      const qs = new URLSearchParams(location.search);
      const forcedSandbox = qs.get('sandbox') === '1' || qs.get('sandbox') === 'true';
      const sandbox =
        forcedSandbox ||
        ref.includes('sandbox.minepi.com') ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1' ||
        location.hostname === 'sandbox.minepi.com';
      window.Pi.init({ version: '2.0', sandbox });
      piSdkReady = true;
      return true;
    } catch {
      return false;
    }
  };

  const authenticatePi = async () => {
    if (!initPiSdk() || !window.Pi || typeof window.Pi.authenticate !== 'function') {
      showToast('Pi SDK غير متاح. افتح التطبيق داخل Pi Browser.');
      return null;
    }

    try {
      const scopes = ['username'];

      const onIncompletePaymentFound = () => {
        showToast('تم العثور على دفعة غير مكتملة (غير مدعوم حالياً).');
      };

      const auth = await window.Pi.authenticate(scopes, onIncompletePaymentFound);

      const uid = auth?.user?.uid ?? auth?.uid ?? null;
      const username = auth?.user?.username ?? auth?.username ?? null;
      const accessToken = auth?.accessToken ?? null;

      if (!uid || !username) {
        console.log('Pi.authenticate result (unexpected shape):', auth);
        showToast('تم تسجيل الدخول لكن لم نحصل على بيانات الحساب (uid/username).');
        return null;
      }

      const session = {
        uid,
        pi_username: username,
        accessToken,
      };

      setStoredPiSession(session);
      upsertUserInFirestore(session);
      renderProfile();
      showToast(`تم تسجيل الدخول: ${session.pi_username}`);

      loadProfileStatsFromFirestore();

      loadChatFromFirestore();
      loadProductsFromFirestore();
      loadVendorsFromFirestore();
      return session;
    } catch (err) {
      console.error('Pi.authenticate error:', err);
      showToast('فشل تسجيل الدخول عبر Pi');
      return null;
    }
  };

  const logoutPi = () => {
    clearStoredPiSession();
    renderProfile();
    showToast('تم تسجيل الخروج');
    setPage('home');
  };

  applyTheme(getInitialTheme());
  syncThemeToggle();

  const escapeHtml = (s) =>
    String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

  const formatTime = (d = new Date()) => {
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const hh = ((h + 11) % 12) + 1;
    const ampm = h >= 12 ? 'م' : 'ص';
    return `${hh}:${m} ${ampm}`;
  };

  const data = {
    homeCategories: ['الكل', 'إلكترونيات', 'طعام', 'أزياء', 'المنزل'],
    firestoreProducts: [],
    localProducts: [],
    firestoreVendors: [],
    chatThreads: [],
    firestoreAds: [],
    profileStats: { ratings: 0, favorites: 0 },
    profile: {
      name: 'محمد أحمد',
      email: 'john.doe@example.com',
      badges: ['عضو مميز', 'موثّق'],
      stats: [
        { label: 'التقييمات', value: 18 },
        { label: 'المفضلة', value: 45 },
      ],
    },
    chat: [
      {
        from: 'admin',
        text: 'مرحباً! أهلاً بك في Pi Vitrina. كيف أستطيع مساعدتك اليوم؟',
        time: '10:30 ص',
      },
      {
        from: 'user',
        text: 'مرحباً! لدي سؤال حول إعداد كشك المتجر.',
        time: '10:32 ص',
      },
      {
        from: 'admin',
        text: 'يسعدني مساعدتك في إعداد الكشك! ما الجانب الذي تريد الاستفسار عنه تحديداً؟',
        time: '10:33 ص',
      },
      {
        from: 'user',
        text: 'كيف يمكنني رفع صور المنتجات وتحديد الأسعار؟',
        time: '10:35 ص',
      },
      {
        from: 'admin',
        text: 'سؤال ممتاز! حالياً هذا مجرد نموذج واجهة. لاحقاً يمكننا ربطه بخادم وتنفيذ رفع الصور والتسعير.',
        time: '10:36 ص',
      },
    ],
  };

  const homeState = {
    category: 'الكل',
    query: '',
    localOnly: false,
    viewMode: 'list',
  };

  const localFilterState = {
    country: '',
    region: '',
    city: '',
  };

  const openLocalSheet = () => {
    const overlay = $('#localSheet');
    if (!overlay) return;

    const onlyToggle = $('#localOnlyToggle');
    if (onlyToggle) onlyToggle.checked = Boolean(homeState.localOnly);

    const placeName = $('#localPlaceName');
    if (placeName) {
      const label = buildLocationText({
        country: localFilterState.country,
        region: localFilterState.region,
        city: localFilterState.city,
        fallback: '',
      });
      placeName.textContent = label || 'اختر مدينة';
    }

    const c = $('#localCountryInput');
    const r = $('#localRegionInput');
    const ci = $('#localCityInput');
    if (c) c.value = cleanStr(localFilterState.country);
    if (r) r.value = cleanStr(localFilterState.region);
    if (ci) ci.value = cleanStr(localFilterState.city);

    overlay.hidden = false;
    window.requestAnimationFrame(() => overlay.classList.add('is-open'));
  };

  const closeLocalSheet = () => {
    const overlay = $('#localSheet');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    window.setTimeout(() => {
      overlay.hidden = true;
    }, 180);
  };

  const syncHomeTopControls = () => {
    const localBtn = $('#localProductsBtn');
    if (localBtn) {
      const on = Boolean(homeState.localOnly);
      localBtn.classList.toggle('is-active', on);
      localBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      localBtn.setAttribute('aria-label', on ? 'فلترة حسب الموقع (مفعل)' : 'فلترة حسب الموقع');
    }

    const viewBtn = $('#viewBtn');
    if (viewBtn) {
      const grid = homeState.viewMode === 'grid';
      viewBtn.classList.toggle('is-active', grid);
      viewBtn.setAttribute('aria-pressed', grid ? 'true' : 'false');
      viewBtn.setAttribute('aria-label', grid ? 'العرض: شبكة' : 'العرض: قائمة');
    }

    const list = $('#productsList');
    if (list) {
      list.classList.toggle('is-grid', homeState.viewMode === 'grid');
    }
  };

  let toastTimer = null;
  const showToast = (message) => {
    const toast = $('#toast');
    if (!toast) return;

    toast.textContent = String(message);
    toast.classList.add('show');

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  };

  const CHAT_SPONSORED_DAY_KEY = 'pv_chat_sponsored_day';

  const getDayKey = (ms = Date.now()) => {
    try {
      return new Date(ms).toISOString().slice(0, 10);
    } catch {
      return String(ms);
    }
  };

  const getApprovedAds = () => {
    const items = Array.isArray(data.firestoreAds) ? data.firestoreAds : [];
    return items.filter((a) => String(a?.status || '') === 'مقبول');
  };

  const pickApprovedAd = (approvedAds, placement = '') => {
    const list = Array.isArray(approvedAds) ? approvedAds : [];
    if (!list.length) return null;
    const p = String(placement || '').trim();
    if (p) {
      const hit = list.find((a) => String(a?.placement || '') === p);
      if (hit) return hit;
    }
    return list[0] || null;
  };

  const canOpenUrl = (u) => /^https?:\/\//i.test(String(u || '').trim());

  const renderHomeSponsoredBanner = () => {
    const root = $('#homeSponsoredBanner');
    if (!root) return;

    const approved = getApprovedAds();
    const ad = pickApprovedAd(approved, 'home_banner') || pickApprovedAd(approved, 'home');
    if (!ad) {
      root.hidden = true;
      root.innerHTML = '';
      return;
    }

    const hasUrl = canOpenUrl(ad.targetUrl);
    root.hidden = false;
    root.innerHTML = `
      <div class="sponsored-tag">📢 <span>إعلان مموّل</span></div>
      <div class="sponsored-title">${escapeHtml(ad.title)}</div>
      <div class="sponsored-desc">${escapeHtml(ad.desc)}</div>
      <div class="sponsored-actions">
        <button class="btn btn-primary btn-sm" type="button" ${hasUrl ? `data-ad-open="${escapeHtml(ad.id)}"` : `data-toast="لا يوجد رابط لهذا الإعلان"`}>اذهب للعرض</button>
      </div>
    `;
  };

  const sponsoredCardHtml = (ad, { title = 'إعلان مموّل' } = {}) => {
    if (!ad) return '';
    const hasUrl = canOpenUrl(ad.targetUrl);
    return `
      <article class="card sponsored-card">
        <div class="row-between">
          <div class="card-title">${escapeHtml(title)}</div>
          <span class="sponsored-badge">مموّل</span>
        </div>
        <div class="muted">${escapeHtml(ad.title)}</div>
        <div class="card-actions" style="margin-top:10px">
          <button class="btn btn-primary btn-sm" type="button" ${hasUrl ? `data-ad-open="${escapeHtml(ad.id)}"` : `data-toast="لا يوجد رابط لهذا الإعلان"`}>اذهب للعرض</button>
        </div>
      </article>
    `;
  };

  let vendorsLoading = false;
  let vendorsLoadedOnce = false;

  let adsLoading = false;
  let adsLoadedOnce = false;

  let chatLoading = false;
  let chatLoadedOnce = false;

  let chatThreadsLoading = false;
  let chatThreadsLoadedOnce = false;

  let chatMessagesLimit = 50;
  let chatHasMore = false;
  let chatSending = false;
  let chatRetryText = null;
  let chatSkipScrollOnce = false;

  let chatThreadsUnsub = null;
  let chatMessagesUnsub = null;

  const chatState = {
    view: 'threads',
    threadId: null,
    productId: null,
    productTitle: '',
    otherUid: '',
    otherUsername: '',
  };

  const setPage = (page) => {
    let next = page;
    if (next !== 'home' && next !== 'profile' && next !== 'product' && !getStoredPiSession()) {
      showToast('لازم تسجل الدخول عبر Pi أولاً');
      next = 'profile';
    }

    if (setPage.current === 'chat' && next !== 'chat') {
      try {
        if (typeof chatThreadsUnsub === 'function') chatThreadsUnsub();
      } catch {}
      try {
        if (typeof chatMessagesUnsub === 'function') chatMessagesUnsub();
      } catch {}
      chatThreadsUnsub = null;
      chatMessagesUnsub = null;
    }

    $$('.page').forEach((p) => p.classList.toggle('is-active', p.dataset.page === next));
    $$('.bottom-nav .nav-item').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === next));

    try {
      if (location.hash !== `#${next}`) history.replaceState(null, '', `#${next}`);
    } catch {
      // ignore
    }

    if (next === 'chat') {
      syncChatHeader();
      setChatView(chatState.view);
      const s = getStoredPiSession();
      if (s) {
        loadChatThreadsFromFirestore();
        if (chatState.view === 'thread' && chatState.threadId) {
          loadThreadMessagesFromFirestore(chatState.threadId);
        }
      }
    }
    if (next === 'home') {
      setProductAddMode(false);
    }
    if (next === 'vendors') {
      setVendorRentMode(false);
      if (!vendorsLoading) {
        vendorsLoading = true;
        renderVendors($('#vendorSearch')?.value || '');
        loadVendorsFromFirestore();
      }
    }

    if (next === 'ads') {
      setAdsRequestMode(false);
      if (!adsLoading) {
        adsLoading = true;
        renderAds();
        loadAdsFromFirestore();
      }
    }
    if (next === 'product') {
      renderProductDetails();
    }

    setPage.current = next;
  };

  setPage.current = (location.hash || '#home').replace('#', '').trim() || 'home';

  const setChatView = (view) => {
    chatState.view = view === 'thread' ? 'thread' : 'threads';

    const threads = $('#chatThreads');
    const body = $('#chatBody');
    const form = $('#chatForm');
    const back = $('#chatBackBtn');

    const inThread = chatState.view === 'thread' && Boolean(chatState.threadId);

    if (threads) threads.hidden = inThread;
    if (body) body.hidden = !inThread;
    if (form) form.hidden = !inThread;
    if (back) back.hidden = !inThread;

    syncChatHeader();
    if (!inThread) {
      try {
        if (typeof chatMessagesUnsub === 'function') chatMessagesUnsub();
      } catch {}
      chatMessagesUnsub = null;
      renderChatThreads();
    }
  };

  const syncChatHeader = () => {
    const title = $('#chatTitle');
    const sub = $('#chatSub');
    if (!title || !sub) return;

    if (chatState.view === 'thread' && chatState.threadId) {
      const t = chatState.productTitle ? `عن: ${chatState.productTitle}` : 'الدردشة';
      title.textContent = t;
      sub.textContent = chatState.otherUsername ? `مع ${chatState.otherUsername}` : 'محادثة';
    } else {
      title.textContent = 'المحادثات';
      sub.textContent = 'اختر محادثة لعرض الرسائل';
    }
  };

  const makeThreadId = (productId, sellerUid, buyerUid) => `${productId}__${sellerUid}__${buyerUid}`;

  const upsertThreadInFirestore = async (payload) => {
    const db = getDb();
    const s = getStoredPiSession();
    if (!db || !s) return null;

    const productId = String(payload?.productId || '').trim();
    const productTitle = String(payload?.productTitle || '').trim();
    const sellerUid = String(payload?.sellerUid || '').trim();
    const sellerUsername = String(payload?.sellerUsername || '').trim();
    const buyerUid = String(payload?.buyerUid || '').trim();
    const buyerUsername = String(payload?.buyerUsername || '').trim();
    if (!productId || !sellerUid || !buyerUid) return null;

    const threadId = makeThreadId(productId, sellerUid, buyerUid);

    try {
      await db
        .collection('chats')
        .doc(threadId)
        .set(
          {
            threadId,
            productId,
            productTitle,
            sellerUid,
            sellerUsername,
            buyerUid,
            buyerUsername,
            participants: [sellerUid, buyerUid],
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
            updatedAtMs: Date.now(),
          },
          { merge: true }
        );
      return threadId;
    } catch (err) {
      console.error('Firestore upsert thread error:', err);
      showToast('تعذر فتح المحادثة');
      return null;
    }
  };

  const sendThreadMessageToFirestore = async (threadId, text) => {
    const db = getDb();
    const s = getStoredPiSession();
    if (!db || !s || !threadId) return false;

    const msg = {
      fromUid: String(s.uid),
      fromUsername: String(s.pi_username || ''),
      text: String(text || ''),
      time: formatTime(),
      ts: window.firebase.firestore.FieldValue.serverTimestamp(),
      tsMs: Date.now(),
    };

    try {
      await db.collection('chats').doc(String(threadId)).collection('messages').add(msg);
      await db
        .collection('chats')
        .doc(String(threadId))
        .set(
          {
            lastMessage: msg.text,
            lastTime: msg.time,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
            updatedAtMs: msg.tsMs,
          },
          { merge: true }
        );
      return true;
    } catch (err) {
      console.error('Firestore send message error:', err);
      showToast('فشل إرسال الرسالة');
      return false;
    }
  };

  const loadChatThreadsFromFirestore = async () => {
    const db = getDb();
    const s = getStoredPiSession();
    if (!db || !s) {
      try {
        if (typeof chatThreadsUnsub === 'function') chatThreadsUnsub();
      } catch {}
      chatThreadsUnsub = null;
      chatThreadsLoading = false;
      chatThreadsLoadedOnce = true;
      data.chatThreads = [];
      renderChatThreads();
      return;
    }

    try {
      if (typeof chatThreadsUnsub === 'function') chatThreadsUnsub();
    } catch {}
    chatThreadsUnsub = null;

    chatThreadsLoading = true;
    renderChatThreads();

    try {
      const q = db.collection('chats').where('participants', 'array-contains', String(s.uid)).limit(100);

      chatThreadsUnsub = q.onSnapshot(
        (snap) => {
          const list = snap.docs
            .map((d) => d.data())
            .filter((t) => t && typeof t === 'object' && t.threadId)
            .map((t) => {
              const isSeller = String(t.sellerUid || '') === String(s.uid);
              const otherUid = isSeller ? String(t.buyerUid || '') : String(t.sellerUid || '');
              const otherUsername = isSeller ? String(t.buyerUsername || 'مشتري') : String(t.sellerUsername || 'بائع');
              return {
                id: String(t.threadId),
                productId: String(t.productId || ''),
                productTitle: String(t.productTitle || ''),
                otherUid,
                otherUsername,
                lastMessage: String(t.lastMessage || ''),
                lastTime: String(t.lastTime || ''),
                updatedAtMs: Number(t.updatedAtMs) || 0,
              };
            })
            .sort((a, b) => b.updatedAtMs - a.updatedAtMs);

          data.chatThreads = list;
          chatThreadsLoading = false;
          chatThreadsLoadedOnce = true;
          renderChatThreads();
        },
        (err) => {
          console.error('Firestore chat threads realtime error:', err);
          chatThreadsLoading = false;
          chatThreadsLoadedOnce = true;
          renderChatThreads();
        }
      );
    } catch (err) {
      console.error('Firestore subscribe chat threads error:', err);
      chatThreadsLoading = false;
      chatThreadsLoadedOnce = true;
      renderChatThreads();
    }
  };

  const loadThreadMessagesFromFirestore = async (threadId) => {
    const db = getDb();
    const s = getStoredPiSession();
    if (!db || !s || !threadId) {
      try {
        if (typeof chatMessagesUnsub === 'function') chatMessagesUnsub();
      } catch {}
      chatMessagesUnsub = null;
      chatLoading = false;
      chatLoadedOnce = true;
      data.chat = [];
      chatHasMore = false;
      renderChat();
      return;
    }

    try {
      if (typeof chatMessagesUnsub === 'function') chatMessagesUnsub();
    } catch {}
    chatMessagesUnsub = null;

    const activeThreadId = String(threadId);
    chatLoading = true;
    chatHasMore = false;
    renderChat();

    try {
      const q = db
        .collection('chats')
        .doc(String(threadId))
        .collection('messages')
        .orderBy('ts', 'desc')
        .limit(Number(chatMessagesLimit) + 1);

      chatMessagesUnsub = q.onSnapshot(
        (snap) => {
          if (String(chatState.threadId || '') !== activeThreadId) return;
          const rawDocs = Array.isArray(snap.docs) ? snap.docs : [];
          const limit = Math.max(1, Number(chatMessagesLimit) || 50);
          const hasMore = rawDocs.length > limit;
          const docs = hasMore ? rawDocs.slice(0, limit) : rawDocs;

          const msgs = docs
            .map((d) => d.data())
            .filter((m) => m && typeof m === 'object' && m.text)
            .map((m) => ({
              fromUid: String(m.fromUid || ''),
              fromUsername: String(m.fromUsername || ''),
              text: String(m.text || ''),
              time: String(m.time || ''),
            }))
            .reverse();

          data.chat = msgs;
          chatHasMore = hasMore;
          chatLoading = false;
          chatLoadedOnce = true;
          renderChat();
        },
        (err) => {
          console.error('Firestore chat messages realtime error:', err);
          chatLoading = false;
          chatLoadedOnce = true;
          renderChat();
        }
      );
    } catch (err) {
      console.error('Firestore subscribe thread messages error:', err);
      chatLoading = false;
      chatLoadedOnce = true;
      renderChat();
    }
  };

  const renderChatThreads = () => {
    const root = $('#chatThreads');
    if (!root) return;

    if (chatThreadsLoading) {
      root.innerHTML = '<div class="muted">جارٍ تحميل المحادثات...</div>';
      return;
    }

    if (chatThreadsLoadedOnce && (!Array.isArray(data.chatThreads) || data.chatThreads.length === 0)) {
      root.innerHTML = '<div class="muted">لا توجد محادثات بعد. افتح دردشة من زر (دردشة) داخل المنتج.</div>';
      return;
    }

    root.innerHTML = data.chatThreads
      .map((t) => {
        const sub = t.lastMessage ? `${escapeHtml(t.lastMessage)} · ${escapeHtml(t.lastTime || '')}` : 'اضغط لفتح المحادثة';
        return `
          <button class="card" type="button" data-chat-thread="${escapeHtml(t.id)}" style="text-align:right">
            <div class="row-between">
              <div>
                <div class="card-title">${escapeHtml(t.productTitle || 'منتج')}</div>
                <div class="muted">${escapeHtml('مع ' + (t.otherUsername || ''))}</div>
              </div>
              <span class="badge">دردشة</span>
            </div>
            <div class="muted" style="margin-top:8px">${sub}</div>
          </button>
        `;
      })
      .join('');
  };

  const scrollChatToEnd = () => {
    const el = $('#chatBody');
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const renderHomeCategories = () => {
    const row = $('#categoryRow');
    if (!row) return;

    row.innerHTML = data.homeCategories
      .map((c) => {
        const active = c === homeState.category ? ' is-active' : '';
        return `<button class="cat${active}" type="button" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`;
      })
      .join('');
  };

  const renderHomeProducts = () => {
    const root = $('#productsList');
    if (!root) return;

    const q = homeState.query.trim().toLowerCase();
    const cat = homeState.category;

    const s = getStoredPiSession();
    const source = Array.isArray(data.firestoreProducts) ? data.firestoreProducts : [];

    let items = source.filter((p) => {
      if (cat !== 'الكل' && p.category !== cat) return false;
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || p.vendor.toLowerCase().includes(q);
    });

    if (homeState.localOnly) {
      const countryQ = cleanStr(localFilterState.country).toLowerCase();
      const regionQ = cleanStr(localFilterState.region).toLowerCase();
      const cityQ = cleanStr(localFilterState.city).toLowerCase();

      if (countryQ || regionQ || cityQ) {
        items = items.filter((p) => {
          const parts = getProductLocationParts(p);
          const fallback = cleanStr(p.location || p.city || p.address || '').toLowerCase();

          const pc = cleanStr(parts.country).toLowerCase() || fallback;
          const pr = cleanStr(parts.region).toLowerCase() || fallback;
          const pcity = cleanStr(parts.city).toLowerCase() || fallback;

          if (countryQ && !pc.includes(countryQ)) return false;
          if (regionQ && !pr.includes(regionQ)) return false;
          if (cityQ && !pcity.includes(cityQ)) return false;
          return true;
        });
      }
    }

    if (items.length === 0) {
      syncHomeTopControls();

      if (homeState.localOnly) {
        root.innerHTML = '<div class="muted">لا توجد منتجات في هذا الموقع. جرّب تغيير المدينة من زر 📍.</div>';
        return;
      }

      if (q) {
        root.innerHTML = '<div class="muted">لا توجد نتائج مطابقة للبحث.</div>';
        return;
      }

      if (cat !== 'الكل') {
        root.innerHTML = '<div class="muted">لا توجد منتجات في هذه الفئة حالياً.</div>';
        return;
      }

      root.innerHTML = '<div class="muted">لا توجد منتجات حالياً.</div>';
      return;
    }

    syncHomeTopControls();

    const heartSvg = `
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
      </svg>
    `.trim();

    const imageSvg = `
      <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"></path>
        <path d="M8 13l2-2 3 3 2-2 3 3"></path>
        <circle cx="9" cy="9" r="1"></circle>
      </svg>
    `.trim();

    const approved = getApprovedAds();
    let inlineCursor = 0;
    const pickInline = () => {
      if (!approved.length) return null;
      const ad = approved[inlineCursor % approved.length] || null;
      inlineCursor += 1;
      return ad;
    };

    const out = [];
    const inlineEvery = 7;

    items.forEach((p, idx) => {
      const favClass = p.liked ? ' is-active' : '';
      const imgUrl = String(p.imageUrl || '').trim();

      out.push(`
        <article class="card product" data-id="${escapeHtml(p.id)}">
          <div class="product-media">
            ${imgUrl ? `<img class="product-img" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(p.title)}" loading="lazy" />` : `<div class="product-placeholder">${imageSvg}</div>`}
            <button class="product-fav${favClass}" type="button" data-fav="${escapeHtml(p.id)}" aria-label="مفضلة" aria-pressed="${p.liked ? 'true' : 'false'}">${heartSvg}</button>
            <div class="product-vendor">${escapeHtml(p.vendor)}</div>
          </div>

          <div class="product-body">
            <div class="product-title-row">
              <div class="product-title">${escapeHtml(p.title)}</div>
              <div class="product-price">${escapeHtml(String(p.price || ''))} ${escapeHtml(String(p.currency || ''))}</div>
            </div>
          </div>
        </article>
      `);

      if ((idx + 1) % inlineEvery === 0 && approved.length) {
        const ad = pickApprovedAd(approved, 'home_inline') || pickInline();
        out.push(sponsoredCardHtml(ad, { title: 'إعلان مموّل' }));
      }
    });

    root.innerHTML = out.join('');
  };

  const renderHome = () => {
    renderHomeSponsoredBanner();
    renderHomeCategories();
    renderHomeProducts();
  };

  const setVendorRentMode = (renting) => {
    const vendorSearch = $('#vendorSearch');
    const searchWrap = vendorSearch ? vendorSearch.closest('.search') : null;
    const vendorsList = $('#vendorsList');
    const rentCard = $('#vendorRentCard');

    if (searchWrap) {
      searchWrap.hidden = Boolean(renting);
      searchWrap.style.display = renting ? 'none' : '';
    }
    if (vendorsList) {
      vendorsList.hidden = Boolean(renting);
      vendorsList.style.display = renting ? 'none' : '';
    }
    if (rentCard) {
      rentCard.hidden = !Boolean(renting);
      rentCard.style.display = renting ? '' : 'none';
    }
  };

  const createVendorInFirestore = async (session, payload) => {
    const db = getDb();
    if (!db || !session || !session.uid) {
      showToast('Firebase غير مهيأ. أكمل إعداد FIREBASE_CONFIG أولاً.');
      return null;
    }

    try {
      const name = String(payload?.name || '').trim();
      const category = String(payload?.category || '').trim();
      const booth = String(payload?.booth || '').trim();

      if (!name || !category || !booth) {
        showToast('تأكد من إدخال اسم المتجر والتصنيف والكشك');
        return null;
      }

      const docRef = await db.collection('vendors').add({
        name,
        category,
        booth,
        status: 'قيد المراجعة',
        rating: null,
        products: 0,
        followers: 0,
        ownerUid: String(session.uid),
        ownerUsername: String(session.pi_username || ''),
        createdAt: window.firebase.firestore.FieldValue.serverTimestamp(),
      });

      return docRef.id;
    } catch (err) {
      console.error('Firestore create vendor error:', err);
      showToast('فشل إرسال طلب الاستئجار');
      return null;
    }
  };

  const loadVendorsFromFirestore = async () => {
    const db = getDb();
    if (!db) {
      vendorsLoading = false;
      vendorsLoadedOnce = true;
      data.firestoreVendors = [];
      renderVendors($('#vendorSearch')?.value || '');
      return;
    }

    try {
      const s = getStoredPiSession();
      const followSet = s ? await loadFollowVendorIdsFromFirestore(s) : new Set();
      vendorsLoading = true;
      renderVendors($('#vendorSearch')?.value || '');
      const snap = await db.collection('vendors').orderBy('createdAt', 'desc').limit(200).get();
      const list = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((v) => v && typeof v === 'object' && v.name)
        .map((v) => ({
          id: String(v.id),
          name: String(v.name || ''),
          booth: String(v.booth || ''),
          rating: v.rating == null ? null : Number(v.rating),
          products: Number(v.products) || 0,
          followers: Number(v.followers) || 0,
          category: String(v.category || ''),
          status: String(v.status || 'قيد المراجعة'),
          ownerUid: v.ownerUid ? String(v.ownerUid) : '',
          ownerUsername: v.ownerUsername ? String(v.ownerUsername) : '',
          following: followSet.has(String(v.id)),
        }));

      data.firestoreVendors = list;
    } catch (err) {
      console.error('Firestore load vendors error:', err);
    } finally {
      vendorsLoading = false;
      vendorsLoadedOnce = true;
      syncVendorProductCountsFromProducts();
      renderVendors($('#vendorSearch')?.value || '');
    }
  };

  const renderVendors = (filter = '') => {
    const root = $('#vendorsList');
    if (!root) return;

    if (vendorsLoading) {
      root.innerHTML = '<div class="muted">جارٍ تحميل المتاجر...</div>';
      return;
    }

    const q = filter.trim().toLowerCase();
    const vendors = (Array.isArray(data.firestoreVendors) ? data.firestoreVendors : []).filter((v) => {
      if (!q) return true;
      return v.name.toLowerCase().includes(q) || v.category.toLowerCase().includes(q) || v.booth.toLowerCase().includes(q);
    });

    const s = getStoredPiSession();

    const sponsoredAd = pickApprovedAd(getApprovedAds(), 'vendors_featured') || pickApprovedAd(getApprovedAds(), 'vendors');

    if (vendorsLoadedOnce && vendors.length === 0) {
      const sponsored = sponsoredCardHtml(sponsoredAd, { title: 'متجر مموّل' });
      root.innerHTML = `${sponsored || '<div class="muted">لا توجد متاجر بعد</div>'}`;
      const statVendors = $('#statVendors');
      if (statVendors) statVendors.textContent = '0';
      return;
    }

    const cards = vendors
      .map((v) => {
        const statusClass = v.status === 'نشط' ? 'badge badge-dark' : 'badge';
        const stats =
          v.status === 'نشط'
            ? `<div class="vendor-stats"><span>⭐ ${v.rating}</span><span>·</span><span class="muted">${v.products} منتج</span><span>·</span><span class="muted">${v.followers} متابع</span></div>`
            : '';

        const isMine = s && String(v.ownerUid || '') === String(s.uid);
        const followLabel = v.following ? 'إلغاء المتابعة' : 'متابعة';
        const actions =
          v.status === 'نشط'
            ? `
              <button class="btn btn-outline btn-sm" type="button" data-toast="زيارة المتجر (واجهة فقط)">زيارة المتجر</button>
              ${isMine ? `<span class="badge">متجرك</span>` : `<button class="btn btn-primary btn-sm" type="button" data-follow-vendor="${escapeHtml(v.id)}">${escapeHtml(followLabel)}</button>`}
            `
            : isMine
              ? `<span class="badge">طلبك قيد المراجعة</span>`
              : `<span class="badge">غير متاح</span>`;

        return `
          <article class="card vendor" data-name="${escapeHtml(v.name)}">
            <div class="vendor-row">
              <div class="avatar"></div>
              <div class="vendor-meta">
                <div class="row-between">
                  <div class="vendor-name">${escapeHtml(v.name)}</div>
                  <span class="${statusClass}">${escapeHtml(v.status)}</span>
                </div>
                <div class="vendor-sub">📍 ${escapeHtml(v.booth)}</div>
                ${stats}
              </div>
            </div>
            <div class="vendor-actions">
              <span class="badge">${escapeHtml(v.category)}</span>
              <div class="spacer"></div>
              ${actions}
            </div>
          </article>
        `;
      })
      .join('');

    const featured = sponsoredAd
      ? `
        <article class="card vendor sponsored-vendor">
          <div class="vendor-row">
            <div class="avatar"></div>
            <div class="vendor-meta">
              <div class="row-between">
                <div class="vendor-name">${escapeHtml(sponsoredAd.title)}</div>
                <span class="sponsored-badge">متجر مموّل</span>
              </div>
              <div class="vendor-sub">${escapeHtml(sponsoredAd.desc)}</div>
            </div>
          </div>
          <div class="vendor-actions">
            <span class="badge">مميّز</span>
            <div class="spacer"></div>
            <button class="btn btn-primary btn-sm" type="button" ${canOpenUrl(sponsoredAd.targetUrl) ? `data-ad-open="${escapeHtml(sponsoredAd.id)}"` : `data-toast="لا يوجد رابط لهذا الإعلان"`}>اذهب للعرض</button>
          </div>
        </article>
      `
      : '';

    root.innerHTML = `${featured}${cards}`;

    const activeCount = vendors.filter((v) => v.status === 'نشط').length;
    const statVendors = $('#statVendors');
    if (statVendors) statVendors.textContent = String(activeCount);
  };

  const renderAds = () => {
    const root = $('#adsList');
    if (!root) return;

    if (adsLoading) {
      root.innerHTML = '<div class="muted">جارٍ تحميل الإعلانات...</div>';
      return;
    }

    const statusClass = (s) => {
      if (s === 'مقبول') return 'status-approved';
      if (s === 'قيد المراجعة') return 'status-pending';
      return 'status-rejected';
    };

    const items = Array.isArray(data.firestoreAds) ? data.firestoreAds : [];
    if (adsLoadedOnce && items.length === 0) {
      root.innerHTML = '<div class="muted">لا توجد طلبات إعلانات بعد</div>';
      const statAds = $('#statAds');
      if (statAds) statAds.textContent = '0';
      return;
    }

    root.innerHTML = items
      .map((ad) => {
        const cls = statusClass(ad.status);
        const isApproved = ad.status === 'مقبول';
        const hasUrl = canOpenUrl(ad.targetUrl);
        const action = isApproved ? 'اذهب للعرض' : ad.status === 'مرفوض' ? 'إعادة الإرسال' : ad.status === 'قيد المراجعة' ? 'تعديل الطلب' : 'عرض الإحصائيات';
        const actionIsPrimary = isApproved || ad.status === 'مرفوض';

        const metrics =
          ad.views != null && ad.clicks != null
            ? `<div class="metrics"><div><span class="muted">المشاهدات:</span> ${ad.views}</div><div><span class="muted">النقرات:</span> ${ad.clicks}</div></div>`
            : '';

        const media =
          isApproved
            ? `
              <div class="ad-media">
                ${ad.imageUrl ? `<img class="ad-img" src="${escapeHtml(ad.imageUrl)}" alt="${escapeHtml(ad.title)}" />` : `<div class="ad-placeholder">📢</div>`}
              </div>
            `
            : '';

        const actionAttrs =
          isApproved
            ? hasUrl
              ? `data-ad-open="${escapeHtml(ad.id)}"`
              : `data-toast="لا يوجد رابط لهذا الإعلان"`
            : `data-toast="${escapeHtml(action)} (واجهة فقط)"`;

        return `
          <article class="card">
            ${media}
            <div class="row-between">
              <div>
                <div class="card-title">${escapeHtml(ad.title)}</div>
                <div class="muted">${escapeHtml(ad.desc)}</div>
              </div>
              <span class="status ${cls}">${escapeHtml(ad.status)}</span>
            </div>

            <div class="meta-row">
              <div><span class="muted">الميزانية:</span> ${escapeHtml(String(ad.budget))} π</div>
              <div><span class="muted">المدة:</span> ${escapeHtml(String(ad.durationDays))} أيام</div>
              <div><span class="muted">تاريخ الإنشاء:</span> ${escapeHtml(ad.created)}</div>
            </div>

            ${metrics}

            <div class="card-actions">
              <button class="btn ${actionIsPrimary ? 'btn-primary' : 'btn-outline'} btn-sm" type="button" ${actionAttrs}>${escapeHtml(action)}</button>
            </div>
          </article>
        `;
      })
      .join('');

    const statAds = $('#statAds');
    if (statAds) statAds.textContent = String(items.length);
  };

  const renderProfile = () => {
    const root = $('#profileRoot');
    if (!root) return;

    const s = getStoredPiSession();
    if (!s) {
      root.innerHTML = `
        <div class="card profile-card">
          <div class="profile-top">
            <div class="avatar"></div>
            <div>
              <div class="profile-name">تسجيل الدخول</div>
              <div class="profile-email">سجّل الدخول عبر Pi Browser للمتابعة</div>
            </div>
          </div>

          <div class="profile-actions">
            <button id="piLoginBtn" class="btn btn-primary" type="button" style="width:100%">تسجيل الدخول عبر Pi</button>
          </div>
        </div>
      `;
      return;
    }

    const p = data.profile;

    const stats = [
      { label: 'التقييمات', value: data.profileStats?.ratings ?? 0 },
      { label: 'المفضلة', value: data.profileStats?.favorites ?? 0 },
    ];

    const detailsOpen = Boolean(profileDetailsState.view);

    root.innerHTML = `
      <div class="card profile-card">
        <div class="profile-top">
          <div class="avatar"></div>
          <div>
            <div class="profile-name">${escapeHtml(s.pi_username)}</div>
            <div class="profile-email">المعرّف: ${escapeHtml(s.uid)}</div>
            <div class="profile-badges">
              ${p.badges.map((b) => `<span class="pill">${escapeHtml(b)}</span>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-top:12px" ${detailsOpen ? 'hidden' : ''}>
        ${stats
          .map(
            (s) => `
            <button class="card stat" type="button" data-profile-stat="${escapeHtml(String(s.label || ''))}">
              <div class="stat-value">${escapeHtml(s.value)}</div>
              <div class="stat-label">${escapeHtml(s.label)}</div>
            </button>
          `,
          )
          .join('')}
      </div>

      <div id="profileDetailsCard" class="card" hidden>
        <div class="row-between">
          <div id="profileDetailsTitle" class="card-title"></div>
          <button id="profileDetailsBackBtn" class="icon-btn" type="button" aria-label="رجوع">←</button>
        </div>
        <div id="profileDetailsBody"></div>
      </div>

      <div class="card menu" ${detailsOpen ? 'hidden' : ''}>
        <div class="menu-item" data-profile-open="my_products">
          <div class="menu-left">📦 منتجاتي</div>
          <div class="chev">›</div>
        </div>
        <div class="menu-item" data-toast="الإعدادات (واجهة فقط)">
          <div class="menu-left">⚙ الإعدادات</div>
          <div class="chev">›</div>
        </div>
        <div class="menu-item" data-toast="الخصوصية (واجهة فقط)">
          <div class="menu-left">🛡 الخصوصية</div>
          <div class="chev">›</div>
        </div>
        <div class="menu-item" data-toast="المساعدة (واجهة فقط)">
          <div class="menu-left">❓ المساعدة</div>
          <div class="chev">›</div>
        </div>
      </div>

      <div class="logout" ${detailsOpen ? 'hidden' : ''}>
        <button id="piLogoutBtn" class="btn btn-danger" type="button" style="width:100%">تسجيل الخروج</button>
      </div>
    `;

    renderProfileDetails();
  };

  const renderChat = () => {
    const root = $('#chatBody');
    if (!root) return;

    if (chatLoading) {
      root.innerHTML = '<div class="muted">جارٍ تحميل الرسائل...</div>';
      return;
    }

    const approved = getApprovedAds();
    const chatAd = pickApprovedAd(approved, 'chat_daily') || pickApprovedAd(approved, 'chat');
    const today = getDayKey(Date.now());
    const last = (() => {
      try {
        return localStorage.getItem(CHAT_SPONSORED_DAY_KEY);
      } catch {
        return null;
      }
    })();

    const shouldShowSponsored = Boolean(chatAd) && String(last || '') !== String(today);
    if (shouldShowSponsored) {
      try {
        localStorage.setItem(CHAT_SPONSORED_DAY_KEY, today);
      } catch {}
    }

    const sponsoredMsg =
      shouldShowSponsored && chatAd
        ? `
          <div class="msg msg-admin">
            <div class="msg-icon">A</div>
            <div class="bubble">
              <div class="bubble-text">📢 إعلان مموّل: ${escapeHtml(chatAd.title)}</div>
              <div class="bubble-time">${escapeHtml(formatTime(new Date()))}</div>
            </div>
          </div>
        `
        : '';

    const loadMoreBtn =
      chatHasMore && chatState.view === 'thread' && chatState.threadId
        ? '<button class="btn btn-outline w-full" type="button" data-chat-load-more="1" style="margin:10px 0">تحميل المزيد</button>'
        : '';

    if (chatLoadedOnce && (!Array.isArray(data.chat) || data.chat.length === 0)) {
      root.innerHTML = `${loadMoreBtn}${sponsoredMsg}<div class="muted">لا توجد رسائل بعد. اكتب رسالتك في الأسفل.</div>`;
      return;
    }

    const s = getStoredPiSession();

    root.innerHTML = `${loadMoreBtn}${sponsoredMsg}${data.chat
      .map((m) => {
        const mine = s && String(m.fromUid || '') === String(s.uid);
        if (mine) {
          return `
            <div class="msg msg-user">
              <div class="bubble">
                <div class="bubble-text">${escapeHtml(m.text)}</div>
                <div class="bubble-time">${escapeHtml(m.time)}</div>
              </div>
              <div class="msg-icon muted">U</div>
            </div>
          `;
        }

        return `
          <div class="msg msg-admin">
            <div class="msg-icon">A</div>
            <div class="bubble">
              <div class="bubble-text">${escapeHtml(m.text)}</div>
              <div class="bubble-time">${escapeHtml(m.time)}</div>
            </div>
          </div>
        `;
      })
      .join('')}`;

    if (chatSkipScrollOnce) {
      chatSkipScrollOnce = false;
      return;
    }

    scrollChatToEnd();
  };

  const adminAutoReply = (userText) => {
    const t = userText.toLowerCase();

    if (
      t.includes('upload') ||
      t.includes('image') ||
      t.includes('product') ||
      t.includes('رفع') ||
      t.includes('صورة') ||
      t.includes('صور') ||
      t.includes('منتج') ||
      t.includes('منتجات')
    ) {
      return 'يمكنك إضافة المنتجات من لوحة التاجر (واجهة فقط حالياً). لاحقاً يمكننا تنفيذ رفع الصور والتسعير بشكل فعلي.';
    }

    return 'شكراً! هذا نموذج واجهة فقط. أخبرني أي صفحة تريد تحسينها بعد ذلك.';
  };

  const init = () => {
    const themeToggle = $('#themeToggle');
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

    const prodNoLocation = $('#prodNoLocation');
    const prodCountry = $('#prodCountry');
    const prodRegion = $('#prodRegion');
    const prodCity = $('#prodCity');
    const syncProdLocation = () => {
      const off = Boolean(prodNoLocation && prodNoLocation.checked);

      const countryWrap = prodCountry ? prodCountry.closest('.grid-2') : null;
      const cityWrap = prodCity ? prodCity.closest('.field') : null;
      if (countryWrap) {
        countryWrap.hidden = off;
        countryWrap.style.display = off ? 'none' : '';
      }
      if (cityWrap) {
        cityWrap.hidden = off;
        cityWrap.style.display = off ? 'none' : '';
      }

      if (prodCountry) prodCountry.disabled = off;
      if (prodRegion) prodRegion.disabled = off;
      if (prodCity) prodCity.disabled = off;
      if (off) {
        if (prodCountry) prodCountry.value = '';
        if (prodRegion) prodRegion.value = '';
        if (prodCity) prodCity.value = '';
      }
    };
    if (prodNoLocation) prodNoLocation.addEventListener('change', syncProdLocation);
    syncProdLocation();

    document.addEventListener('change', async (e) => {
      const t = e.target;
      if (!t) return;

      if (t.id === 'prodImage') {
        const file = t.files && t.files[0] ? t.files[0] : null;
        try {
          await setImageUiFile('prod', file);
        } catch (err) {
          const msg = err && err.message ? String(err.message) : 'تعذر قراءة الصورة';
          showToast(msg);
        }
        return;
      }

      if (t.id === 'editProdImage') {
        const file = t.files && t.files[0] ? t.files[0] : null;
        try {
          await setImageUiFile('edit', file);
        } catch (err) {
          const msg = err && err.message ? String(err.message) : 'تعذر قراءة الصورة';
          showToast(msg);
        }
        return;
      }

      if (t.id === 'prodImageCrop') {
        syncImageUiHint('prod');
        return;
      }

      if (t.id === 'editProdImageCrop') {
        syncImageUiHint('edit');
        return;
      }
    });

    document.addEventListener('input', (e) => {
      const t = e.target;
      if (!t) return;
      if (t.id === 'prodImageQuality') {
        syncImageUiHint('prod');
        return;
      }
      if (t.id === 'editProdImageQuality') {
        syncImageUiHint('edit');
        return;
      }
    });

    const storedLocal = getStoredLocalFilter();
    if (storedLocal) {
      if (typeof storedLocal.country === 'string' && storedLocal.country.trim()) localFilterState.country = storedLocal.country;
      if (typeof storedLocal.region === 'string' && storedLocal.region.trim()) localFilterState.region = storedLocal.region;
      if (typeof storedLocal.city === 'string' && storedLocal.city.trim()) localFilterState.city = storedLocal.city;
      if (typeof storedLocal.enabled === 'boolean') homeState.localOnly = storedLocal.enabled;
    }

    initFirebase();
    initPiSdk();

    renderHome();
    renderVendors('');
    renderAds();
    renderProfile();
    renderChat();

    if (getStoredPiSession()) {
      loadChatThreadsFromFirestore();
    }

    loadProductsFromFirestore();

    const productSearch = $('#productSearch');
    if (productSearch) {
      productSearch.addEventListener('input', (e) => {
        homeState.query = e.target.value;
        renderHomeProducts();
      });
    }

    document.addEventListener('submit', async (e) => {
      const adsForm = e.target.closest('#adsRequestForm');
      if (adsForm) {
        e.preventDefault();

        const s = getStoredPiSession();
        if (!s) {
          showToast('لازم تسجل الدخول عبر Pi أولاً');
          setPage('profile');
          return;
        }

        const titleEl = $('#adTitle');
        const descEl = $('#adDesc');
        const budgetEl = $('#adBudget');
        const durationEl = $('#adDuration');
        if (!titleEl || !descEl || !budgetEl || !durationEl) return;

        const id = await createAdInFirestore(s, {
          title: titleEl.value,
          desc: descEl.value,
          budget: budgetEl.value,
          durationDays: durationEl.value,
        });

        if (!id) return;

        titleEl.value = '';
        descEl.value = '';
        budgetEl.value = '';
        durationEl.value = '';

        setAdsRequestMode(false);
        showToast('تم إرسال طلب الإعلان');
        await loadAdsFromFirestore();
        setPage('ads');
        return;
      }

      const form = e.target.closest('#rentBoothForm');
      if (!form) return;
      e.preventDefault();

      const s = getStoredPiSession();
      if (!s) {
        showToast('لازم تسجل الدخول عبر Pi أولاً');
        setPage('profile');
        return;
      }

      const nameEl = $('#vendorName');
      const catEl = $('#vendorCategory');
      const boothEl = $('#vendorBooth');
      if (!nameEl || !catEl || !boothEl) return;

      const id = await createVendorInFirestore(s, {
        name: nameEl.value,
        category: catEl.value,
        booth: boothEl.value,
      });

      if (!id) return;

      nameEl.value = '';
      boothEl.value = '';

      setVendorRentMode(false);

      showToast('تم إرسال طلب الاستئجار');
      await loadVendorsFromFirestore();
      setPage('vendors');
    });

    document.addEventListener('submit', async (e) => {
      const form = e.target.closest('#editMyProductForm');
      if (!form) return;
      e.preventDefault();

      const s = getStoredPiSession();
      if (!s) {
        showToast('لازم تسجل الدخول عبر Pi أولاً');
        setPage('profile');
        return;
      }

      const pid = String(form.dataset.editProduct || '').trim();
      const titleEl = $('#editProdTitle');
      const catEl = $('#editProdCategory');
      const priceEl = $('#editProdPrice');
      const imageEl = $('#editProdImage');
      const countryEl = $('#editProdCountry');
      const regionEl = $('#editProdRegion');
      const cityEl = $('#editProdCity');
      const descEl = $('#editProdDesc');
      if (!pid || !titleEl || !catEl || !priceEl) return;

      let imageFile = imageEl && imageEl.files && imageEl.files[0] ? imageEl.files[0] : null;
      if (imageFile && String(pid).startsWith('local_')) {
        showToast('تحديث الصورة يحتاج Firebase');
        return;
      }

      if (imageFile) {
        const imgErr = validateImageFile(imageFile);
        if (imgErr) {
          showToast(imgErr);
          clearImageUi('edit');
          return;
        }

        try {
          imageFile = await optimizeImageFile(imageFile, getImageUiOptions('edit'));
        } catch (err) {
          console.error('Optimize edit product image error:', err);
          showToast('تعذر معالجة الصورة');
          return;
        }
      }

      const ok = await updateMyProduct(
        pid,
        {
          title: titleEl.value,
          category: catEl.value,
          price: priceEl.value,
          desc: descEl ? descEl.value : '',
          locationCountry: countryEl ? countryEl.value : '',
          locationRegion: regionEl ? regionEl.value : '',
          locationCity: cityEl ? cityEl.value : '',
        },
        imageFile,
      );

      if (!ok) return;

      clearImageUi('edit');
      profileDetailsState.editingId = null;
      profileDetailsState.loading = true;
      renderProfileDetails();
      profileDetailsState.items = await loadMyProductsForProfile();
      profileDetailsState.loading = false;
      renderProfileDetails();

      await loadProductsFromFirestore();
      showToast('تم حفظ التعديلات');
    });

    document.addEventListener('submit', async (e) => {
      const form = e.target.closest('#addProductForm');
      if (!form) return;
      e.preventDefault();

      const s = getStoredPiSession();
      if (!s) {
        showToast('لازم تسجل الدخول عبر Pi أولاً');
        setPage('profile');
        return;
      }

      const titleEl = $('#prodTitle');
      const catEl = $('#prodCategory');
      const priceEl = $('#prodPrice');
      const imageEl = $('#prodImage');
      const noLocEl = $('#prodNoLocation');
      const countryEl = $('#prodCountry');
      const regionEl = $('#prodRegion');
      const cityEl = $('#prodCity');
      const descEl = $('#prodDesc');
      if (!titleEl || !catEl || !priceEl) return;

      let imageFile = imageEl && imageEl.files && imageEl.files[0] ? imageEl.files[0] : null;
      if (imageFile) {
        const imgErr = validateImageFile(imageFile);
        if (imgErr) {
          showToast(imgErr);
          clearImageUi('prod');
          return;
        }
      }

      const noLoc = Boolean(noLocEl && noLocEl.checked);
      const locationCountry = noLoc ? '' : countryEl ? String(countryEl.value || '').trim() : '';
      const locationRegion = noLoc ? '' : regionEl ? String(regionEl.value || '').trim() : '';
      const locationCity = noLoc ? '' : cityEl ? String(cityEl.value || '').trim() : '';

      const descText = descEl ? String(descEl.value || '') : '';
      if (descText.length > 20) {
        showToast('الوصف يجب ألا يتجاوز 20 حرفاً');
        return;
      }

      const payload = {
        title: titleEl.value,
        category: catEl.value,
        price: priceEl.value,
        locationCountry,
        locationRegion,
        locationCity,
        desc: descText,
        imageFile,
      };

      let createdLocal = false;
      let id = null;
      const db = getDb();
      if (!db && imageFile) {
        showToast('رفع الصور يحتاج Firebase');
        return;
      }

      if (db && imageFile) {
        try {
          const optimized = await optimizeImageFile(imageFile, getImageUiOptions('prod'));
          payload.imageFile = optimized;
        } catch (err) {
          console.error('Optimize product image error:', err);
          showToast('تعذر معالجة الصورة');
          return;
        }
      }
      if (db) {
        id = await createProductInFirestore(s, payload);
      }
      if (!id) {
        id = createProductLocal(s, payload);
        if (!id) return;
        createdLocal = true;
      }

      titleEl.value = '';
      priceEl.value = '';
      clearImageUi('prod');
      if (noLocEl) noLocEl.checked = false;
      if (countryEl) countryEl.value = '';
      if (regionEl) regionEl.value = '';
      if (cityEl) cityEl.value = '';
      if (descEl) descEl.value = '';
      setProductAddMode(false);
      showToast(createdLocal ? 'تم حفظ المنتج محلياً' : 'تم إرسال المنتج للمراجعة');
      await loadProductsFromFirestore();
      setPage('home');
    });

    const search = $('#vendorSearch');
    if (search) {
      search.addEventListener('input', (e) => renderVendors(e.target.value));
    }

    document.addEventListener('click', async (e) => {
      const prodClearBtn = e.target.closest('#prodImageClearBtn');
      if (prodClearBtn) {
        clearImageUi('prod');
        return;
      }

      const editClearBtn = e.target.closest('#editProdImageClearBtn');
      if (editClearBtn) {
        clearImageUi('edit');
        return;
      }

      const localSheet = e.target.closest('#localSheet');
      if (localSheet && e.target === localSheet) {
        closeLocalSheet();
        return;
      }

      const localSheetClose = e.target.closest('#localSheetClose');
      if (localSheetClose) {
        closeLocalSheet();
        return;
      }

      const localProductsBtn = e.target.closest('#localProductsBtn');
      if (localProductsBtn) {
        openLocalSheet();
        return;
      }

      const localEditBtn = e.target.closest('#localEditBtn');
      if (localEditBtn) {
        const input = $('#localCityInput');
        if (input) input.focus();
        return;
      }

      const localApplyBtn = e.target.closest('#localApplyBtn');
      if (localApplyBtn) {
        const onlyToggle = $('#localOnlyToggle');
        homeState.localOnly = Boolean(onlyToggle && onlyToggle.checked);

        const countryEl = $('#localCountryInput');
        const regionEl = $('#localRegionInput');
        const cityEl = $('#localCityInput');

        localFilterState.country = countryEl ? String(countryEl.value || '').trim() : '';
        localFilterState.region = regionEl ? String(regionEl.value || '').trim() : '';
        localFilterState.city = cityEl ? String(cityEl.value || '').trim() : '';

        const placeName = $('#localPlaceName');
        if (placeName) {
          const label = buildLocationText({
            country: localFilterState.country,
            region: localFilterState.region,
            city: localFilterState.city,
            fallback: '',
          });
          placeName.textContent = label || 'اختر مدينة';
        }

        setStoredLocalFilter({
          enabled: homeState.localOnly,
          country: localFilterState.country,
          region: localFilterState.region,
          city: localFilterState.city,
        });

        closeLocalSheet();
        renderHomeProducts();
        return;
      }

      const adOpen = e.target.closest('[data-ad-open]');
      if (adOpen && adOpen.dataset.adOpen) {
        const id = String(adOpen.dataset.adOpen);
        const ad = (Array.isArray(data.firestoreAds) ? data.firestoreAds : []).find((a) => String(a.id) === id);
        const url = ad ? String(ad.targetUrl || '').trim() : '';
        if (canOpenUrl(url)) {
          window.open(url, '_blank', 'noopener');
        } else {
          showToast('لا يوجد رابط لهذا الإعلان');
        }
        return;
      }

      const adsRequestBtn = e.target.closest('#adsRequestBtn');
      if (adsRequestBtn) {
        const s = getStoredPiSession();
        if (!s) {
          showToast('لازم تسجل الدخول عبر Pi أولاً');
          setPage('profile');
          return;
        }
        setAdsRequestMode(true);
        return;
      }

      const adsRequestCancelBtn = e.target.closest('#adsRequestCancelBtn');
      if (adsRequestCancelBtn) {
        setAdsRequestMode(false);
        return;
      }

      const homeAddProductBtn = e.target.closest('#homeAddProductBtn');
      if (homeAddProductBtn) {
        const s = getStoredPiSession();
        if (!s) {
          showToast('لازم تسجل الدخول عبر Pi أولاً');
          setPage('profile');
          return;
        }
        setPage('home');
        setProductAddMode(true);
        return;
      }

      const homeAddProductCancelBtn = e.target.closest('#homeAddProductCancelBtn');
      if (homeAddProductCancelBtn) {
        clearImageUi('prod');
        setProductAddMode(false);
        return;
      }

      const chatBackBtn = e.target.closest('#chatBackBtn');
      if (chatBackBtn) {
        chatState.threadId = null;
        chatState.productId = null;
        chatState.productTitle = '';
        chatState.otherUid = '';
        chatState.otherUsername = '';
        chatMessagesLimit = 50;
        chatHasMore = false;
        setChatView('threads');
        return;
      }

      const loadMoreChat = e.target.closest('[data-chat-load-more]');
      if (loadMoreChat) {
        if (!chatState.threadId) return;
        chatSkipScrollOnce = true;
        chatMessagesLimit = Math.min(500, Math.max(1, Number(chatMessagesLimit) || 50) + 50);
        await loadThreadMessagesFromFirestore(chatState.threadId);
        return;
      }

      const chatThreadBtn = e.target.closest('[data-chat-thread]');
      if (chatThreadBtn && chatThreadBtn.dataset.chatThread) {
        const s = getStoredPiSession();
        if (!s) {
          showToast('لازم تسجل الدخول عبر Pi أولاً');
          setPage('profile');
          return;
        }

        const threadId = String(chatThreadBtn.dataset.chatThread);
        const t = (Array.isArray(data.chatThreads) ? data.chatThreads : []).find((x) => String(x.id) === threadId);

        chatState.threadId = threadId;
        chatState.view = 'thread';
        chatState.productId = t ? String(t.productId || '') : '';
        chatState.productTitle = t ? String(t.productTitle || '') : '';
        chatState.otherUid = t ? String(t.otherUid || '') : '';
        chatState.otherUsername = t ? String(t.otherUsername || '') : '';

        chatMessagesLimit = 50;
        chatHasMore = false;

        setChatView('thread');
        await loadThreadMessagesFromFirestore(threadId);
        scrollChatToEnd();
        return;
      }

      const chatProductBtn = e.target.closest('[data-chat-product]');
      if (chatProductBtn && chatProductBtn.dataset.chatProduct) {
        const s = getStoredPiSession();
        if (!s) {
          showToast('لازم تسجل الدخول عبر Pi أولاً');
          setPage('profile');
          return;
        }

        const productId = String(chatProductBtn.dataset.chatProduct);
        const p = (Array.isArray(data.firestoreProducts) ? data.firestoreProducts : []).find((x) => String(x.id) === productId);
        if (!p) return;

        if (String(p.ownerUid || '') === String(s.uid)) {
          showToast('هذا منتجك. راجع المحادثات للرد على المشترين.');
          chatState.view = 'threads';
          setPage('chat');
          return;
        }

        const threadId = await upsertThreadInFirestore({
          productId: String(p.id),
          productTitle: String(p.title || ''),
          sellerUid: String(p.ownerUid || ''),
          sellerUsername: String(p.vendor || ''),
          buyerUid: String(s.uid),
          buyerUsername: String(s.pi_username || ''),
        });

        if (!threadId) return;

        chatState.threadId = threadId;
        chatState.view = 'thread';
        chatState.productId = String(p.id);
        chatState.productTitle = String(p.title || '');
        chatState.otherUid = String(p.ownerUid || '');
        chatState.otherUsername = String(p.vendor || '');

        setPage('chat');
        return;
      }

      const rentBoothBtn = e.target.closest('#rentBoothBtn');
      if (rentBoothBtn) {
        const s = getStoredPiSession();
        if (!s) {
          showToast('لازم تسجل الدخول عبر Pi أولاً');
          setPage('profile');
          return;
        }
        setVendorRentMode(true);
        return;
      }

      const rentBoothCancelBtn = e.target.closest('#rentBoothCancelBtn');
      if (rentBoothCancelBtn) {
        setVendorRentMode(false);
        return;
      }

      const viewBtn = e.target.closest('#viewBtn');
      if (viewBtn) {
        homeState.viewMode = homeState.viewMode === 'grid' ? 'list' : 'grid';
        syncHomeTopControls();
        return;
      }

      const piLoginBtn = e.target.closest('#piLoginBtn');
      if (piLoginBtn) {
        const res = await authenticatePi();
        if (res) setPage('profile');
        return;
      }

      const piLogoutBtn = e.target.closest('#piLogoutBtn');
      if (piLogoutBtn) {
        logoutPi();
        return;
      }

      const cat = e.target.closest('[data-cat]');
      if (cat && cat.dataset.cat) {
        homeState.category = cat.dataset.cat;
        renderHomeCategories();
        renderHomeProducts();
      }

      const productBackBtn = e.target.closest('#productBackBtn');
      if (productBackBtn) {
        setPage('home');
        return;
      }

      const contactSellerBtn = e.target.closest('#contactSellerBtn');
      if (contactSellerBtn) {
        const s = getStoredPiSession();
        if (!s) {
          showToast('لازم تسجل الدخول عبر Pi أولاً');
          setPage('profile');
          return;
        }

        const pid = String(productDetailsState.productId || '');
        const p = getProductByIdLocal(pid);
        if (!p) return;

        const threadId = await upsertThreadInFirestore({
          productId: String(p.id),
          productTitle: String(p.title || ''),
          sellerUid: String(p.ownerUid || ''),
          sellerUsername: String(p.vendor || ''),
          buyerUid: String(s.uid),
          buyerUsername: String(s.pi_username || ''),
        });

        if (!threadId) return;

        chatState.threadId = threadId;
        chatState.view = 'thread';
        chatState.productId = String(p.id);
        chatState.productTitle = String(p.title || '');
        chatState.otherUid = String(p.ownerUid || '');
        chatState.otherUsername = String(p.vendor || '');

        await sendThreadMessageToFirestore(threadId, `السلام عليكم، بغيت نسول على: ${String(p.title || '')}`);
        setPage('chat');
        loadProfileStatsFromFirestore();
        return;
      }

      const openChatBtn = e.target.closest('#openChatBtn');
      if (openChatBtn) {
        const s = getStoredPiSession();
        if (!s) {
          showToast('لازم تسجل الدخول عبر Pi أولاً');
          setPage('profile');
          return;
        }

        const pid = String(productDetailsState.productId || '');
        const p = getProductByIdLocal(pid);
        if (!p) return;

        const chatProductBtnShim = { dataset: { chatProduct: String(p.id) } };
        const threadId = await upsertThreadInFirestore({
          productId: String(p.id),
          productTitle: String(p.title || ''),
          sellerUid: String(p.ownerUid || ''),
          sellerUsername: String(p.vendor || ''),
          buyerUid: String(s.uid),
          buyerUsername: String(s.pi_username || ''),
        });

        if (!threadId) return;

        chatState.threadId = threadId;
        chatState.view = 'thread';
        chatState.productId = String(p.id);
        chatState.productTitle = String(p.title || '');
        chatState.otherUid = String(p.ownerUid || '');
        chatState.otherUsername = String(p.vendor || '');

        setPage('chat');
        return;
      }

      const profileDetailsBackBtn = e.target.closest('#profileDetailsBackBtn');
      if (profileDetailsBackBtn) {
        clearImageUi('edit');
        setProfileDetailsView(null, '');
        return;
      }

      const profileStat = e.target.closest('[data-profile-stat]');
      if (profileStat && profileStat.dataset.profileStat) {
        const label = String(profileStat.dataset.profileStat);
        if (label === 'المفضلة') {
          await openProfileDetails('favorites');
          return;
        }
      }

      const profileOpen = e.target.closest('[data-profile-open]');
      if (profileOpen && profileOpen.dataset.profileOpen) {
        const v = String(profileOpen.dataset.profileOpen);
        if (v === 'my_products') {
          await openProfileDetails('my_products');
          return;
        }
      }

      const cancelEdit = e.target.closest('[data-myprod-cancel-edit]');
      if (cancelEdit) {
        clearImageUi('edit');
        profileDetailsState.editingId = null;
        renderProfileDetails();
        return;
      }

      const editBtn = e.target.closest('[data-myprod-edit]');
      if (editBtn && editBtn.dataset.myprodEdit) {
        const pid = String(editBtn.dataset.myprodEdit);
        profileDetailsState.editingId = pid;
        renderProfileDetails();
        return;
      }

      const delBtn = e.target.closest('[data-myprod-delete]');
      if (delBtn && delBtn.dataset.myprodDelete) {
        const pid = String(delBtn.dataset.myprodDelete);
        const okConfirm = window.confirm('هل تريد حذف هذا المنتج؟');
        if (!okConfirm) return;
        const ok = await deleteMyProduct(pid);
        if (!ok) return;

        profileDetailsState.editingId = null;
        profileDetailsState.loading = true;
        renderProfileDetails();
        profileDetailsState.items = await loadMyProductsForProfile();
        profileDetailsState.loading = false;
        renderProfileDetails();

        await loadProductsFromFirestore();
        showToast('تم حذف المنتج');
        return;
      }

      const followVendor = e.target.closest('[data-follow-vendor]');
      if (followVendor && followVendor.dataset.followVendor) {
        const vid = String(followVendor.dataset.followVendor);
        const res = await toggleFollowVendorInFirestore(vid);
        if (res) {
          const vendors = Array.isArray(data.firestoreVendors) ? data.firestoreVendors : [];
          const v = vendors.find((x) => String(x.id) === vid);
          if (v) {
            v.following = Boolean(res.following);
            v.followers = Number(res.followers) || 0;
          }
          renderVendors($('#vendorSearch')?.value || '');
        }

        return;
      }

      const rateBtn = e.target.closest('[data-rate-product]');
      if (rateBtn && rateBtn.dataset.rateProduct) {
        const pid = String(rateBtn.dataset.rateProduct);
        const rawDirect = rateBtn.dataset.rateValue ? String(rateBtn.dataset.rateValue) : null;
        const raw = rawDirect != null ? rawDirect : window.prompt('أدخل تقييم من 1 إلى 5');
        if (raw == null) return;

        const v = Number(String(raw).trim());
        if (!Number.isFinite(v) || v < 1 || v > 5) {
          showToast('التقييم يجب أن يكون من 1 إلى 5');
          return;
        }
        const res = await rateProductInFirestore(pid, raw);
        if (res && Number.isFinite(Number(res.rating))) {
          const products = Array.isArray(data.firestoreProducts) ? data.firestoreProducts : [];
          const p = products.find((x) => String(x.id) === pid);
          if (p) p.rating = Number(res.rating).toFixed(1);
          renderHomeProducts();
          renderProductDetails();
          loadProfileStatsFromFirestore();
          showToast('تم حفظ التقييم');
        }
        return;
      }

      const fav = e.target.closest('[data-fav]');
      if (fav && fav.dataset.fav) {
        const id = String(fav.dataset.fav);
        const res = await toggleFavoriteProductInFirestore(id);
        if (res) {
          const inFs = Array.isArray(data.firestoreProducts) ? data.firestoreProducts : [];
          const p = inFs.find((x) => String(x.id) === id);
          if (p) {
            p.liked = Boolean(res.liked);
            p.likes = Number(res.likes) || 0;
          }
          renderHomeProducts();
          renderProductDetails();
          loadProfileStatsFromFirestore();
        }
        return;
      }

      const productCard = e.target.closest('.product[data-id]');
      if (productCard && productCard.dataset.id) {
        const clickedFav = e.target.closest('[data-fav]');
        const clickedChat = e.target.closest('[data-chat-product]');
        const clickedRate = e.target.closest('[data-rate-product]');
        if (clickedFav || clickedChat || clickedRate) return;
        openProductDetails(String(productCard.dataset.id));
        return;
      }

      const nav = e.target.closest('[data-nav]');
      if (nav && nav.dataset.nav) setPage(nav.dataset.nav);

      const toastEl = e.target.closest('[data-toast]');
      if (toastEl && toastEl.dataset.toast) showToast(toastEl.dataset.toast);
    });

    const chatForm = $('#chatForm');
    if (chatForm) {
      const sendBtn = chatForm.querySelector('button.send');

      const syncSendUi = () => {
        const input = $('#chatText');
        if (input) input.disabled = Boolean(chatSending);
        if (sendBtn) {
          sendBtn.disabled = Boolean(chatSending);
          if (chatSending) {
            sendBtn.textContent = '...';
          } else if (chatRetryText) {
            sendBtn.textContent = '↻';
          } else {
            sendBtn.textContent = '→';
          }
        }
      };

      const inputEl = $('#chatText');
      if (inputEl) {
        inputEl.addEventListener('input', () => {
          if (chatRetryText) {
            chatRetryText = null;
            syncSendUi();
          }
        });
      }

      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = $('#chatText');
        if (!input) return;

        if (chatSending) return;

        const text = String(input.value || '').trim();
        if (!text) return;

        const s = getStoredPiSession();
        if (!s) {
          showToast('لازم تسجل الدخول عبر Pi أولاً');
          setPage('profile');
          return;
        }

        if (!chatState.threadId) {
          showToast('اختر محادثة أولاً');
          return;
        }

        chatSending = true;
        syncSendUi();

        const toSend = text;
        input.value = '';

        const ok = await sendThreadMessageToFirestore(chatState.threadId, toSend);
        chatSending = false;

        if (!ok) {
          chatRetryText = toSend;
          input.value = toSend;
          showToast('فشل الإرسال. حاول مرة أخرى.');
        } else {
          chatRetryText = null;
        }

        syncSendUi();
      });

      syncSendUi();
    }

    const initial = (location.hash || '#home').replace('#', '').trim();
    const allowed = new Set(['home', 'product', 'vendors', 'chat', 'ads', 'profile']);
    setPage(allowed.has(initial) ? initial : 'home');

    const s = getStoredPiSession();
    if (s) loadProfileStatsFromFirestore();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
