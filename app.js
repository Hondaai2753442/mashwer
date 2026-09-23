(() => {
  'use strict';

  const cfg = window.MASHAWER_CONFIG || {};
  const app = document.getElementById('app');
  const toastNode = document.getElementById('toast');
  const introScreen = document.getElementById('intro-screen');
  const introVideo = document.getElementById('intro-video');
  let introTimer = null;
  const navigation = window.MASHAWER_NAVIGATION;
  if (!navigation) throw new Error('Navigation registry failed to load.');

  const {
    ICON_REGISTRY,
    CORE_ROUTES,
    normalizeRole,
    getNavigationItems,
    getRouteTitle,
    isRouteAllowed,
    loadRoute
  } = navigation;
  const hasSupabase = Boolean(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  const client = hasSupabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const STATUS_LABELS = Object.freeze({
    pending: 'جاري البحث عن مندوب', confirmed: 'تم تأكيد الطلب', searching_driver: 'جاري البحث عن مندوب',
    assigned: 'تم تعيين مندوب', driver_accepted: 'المندوب قبل الطلب', heading_to_pickup: 'في الطريق للاستلام',
    arrived_pickup: 'وصل للاستلام', picked_up: 'تم استلام الطلب', delivering: 'في الطريق إليك',
    arrived_destination: 'وصل للعنوان', delivered: 'تم التسليم', cancelled: 'ملغي', rejected: 'مرفوض', failed: 'تعذر التنفيذ'
  });
  const STATUS_STEPS = ['pending', 'confirmed', 'searching_driver', 'assigned', 'driver_accepted', 'heading_to_pickup', 'arrived_pickup', 'picked_up', 'delivering', 'arrived_destination', 'delivered'];
  const ACTIVE_STATUSES = ['pending', 'confirmed', 'searching_driver', 'assigned', 'driver_accepted', 'heading_to_pickup', 'arrived_pickup', 'picked_up', 'delivering', 'arrived_destination'];
  const TERMINAL_STATUSES = ['delivered', 'cancelled', 'rejected', 'failed'];
  const STATUS_SYMBOLS = Object.freeze({ pending: '◷', confirmed: '✓', searching_driver: '⌕', assigned: '↗', driver_accepted: '✓', heading_to_pickup: '→', arrived_pickup: '⌖', picked_up: '□', delivering: '→', arrived_destination: '⌖', delivered: '✓', cancelled: '×', rejected: '!', failed: '!' });
  const CATEGORIES = ['الكل', 'مطاعم', 'بقالة', 'صيدلية', 'طرود'];
  const ROLE_KEYS = { Customer: 'customer', Driver: 'courier', Admin: 'admin' };

  const DEMO_MERCHANTS = [
    { id: 'demo-merchant-1', name: 'مطعم البيت الشامي', category: 'مطاعم', description: 'أكل بيتي وسندوتشات طازة', address_text: 'شارع السوق', delivery_value: 18, active: true },
    { id: 'demo-merchant-2', name: 'سوبر ماركت البركة', category: 'بقالة', description: 'كل احتياجات البيت في مكان واحد', address_text: 'بجوار الوحدة الصحية', delivery_value: 22, active: true },
    { id: 'demo-merchant-3', name: 'صيدلية الحياة', category: 'صيدلية', description: 'طلبك الصحي يوصلك بأمان', address_text: 'شارع المدرسة القديمة', delivery_value: 15, active: true }
  ];
  const DEMO_PRODUCTS = [
    { id: 'demo-product-1', merchant_id: 'demo-merchant-1', name: 'وجبة مشاوي مشكلة', description: 'تكفي شخصين مع الأرز والسلطة', price: 185, category: 'مطاعم', available: true },
    { id: 'demo-product-2', merchant_id: 'demo-merchant-1', name: 'كشري مشاوير', description: 'خلطة البيت الحارة', price: 65, category: 'مطاعم', available: true },
    { id: 'demo-product-3', merchant_id: 'demo-merchant-2', name: 'سلة خضار اليوم', description: 'اختيار طازج من السوق', price: 120, category: 'بقالة', available: true },
    { id: 'demo-product-4', merchant_id: 'demo-merchant-2', name: 'مياه معدنية', description: 'كرتونة 12 زجاجة', price: 95, category: 'بقالة', available: true },
    { id: 'demo-product-5', merchant_id: 'demo-merchant-3', name: 'فيتامينات يومية', description: 'بعد مراجعة الوصفة عند الحاجة', price: 160, category: 'صيدلية', available: true }
  ];
  const DEMO_ORDERS = [
    { id: 'DEMO-1042', merchant_id: 'demo-merchant-1', merchant: 'مطعم البيت الشامي', status: 'delivering', total: 238, address: 'شارع المدرسة القديمة', created_at: 'اليوم', items: [] },
    { id: 'DEMO-1038', merchant_id: 'demo-merchant-2', merchant: 'سوبر ماركت البركة', status: 'delivered', total: 164, address: 'منطقة السوق', created_at: 'أمس', items: [] }
  ];

  const state = {
    user: null,
    profile: null,
    demo: false,
    route: 'customer.home',
    routeLoading: new Set(),
    routeReady: new Set(CORE_ROUTES),
    routeErrors: {},
    catalog: { status: 'idle', error: null },
    orders: { status: 'idle', error: null },
    notifications: { status: 'idle', error: null },
    merchants: [],
    products: [],
    orderRows: [],
    courierRows: [],
    customerRows: [],
    notificationRows: [],
    category: 'الكل',
    search: '',
    selectedMerchant: null,
    cart: [],
    checkout: { address: '', phone: '', payment: 'paid_to_store', paymentReference: '', notes: '' },
    ordersFilter: 'all',
    trackingOrder: null,
    trackingHistory: { status: 'idle', rows: [], error: null },
    trackingLocation: null,
    modal: null,
    authMode: 'login',
    authRole: 'customer',
    busy: false,
    error: null,
    offline: !navigator.onLine,
    adminMerchantId: null,
    liveChannel: null,
    refreshTimer: null,
    locationWatch: null,
    toastTimer: null
  };

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
  const money = (value) => `${Number(value || 0).toLocaleString('ar-EG')} ج.م`;
  const initials = (value) => String(value || 'م').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('') || 'م';
  const roleKey = (role) => ROLE_KEYS[normalizeRole(role)] || 'customer';
  const roleName = (role) => ({ customer: 'المستخدم', courier: 'المندوب', admin: 'الإدارة' }[roleKey(role)] || 'المستخدم');
  const currentRole = () => roleKey(state.profile?.role || state.user?.user_metadata?.role);
  const isDemo = () => state.demo === true;
  const isTerminal = (status) => TERMINAL_STATUSES.includes(status);
  const merchantFor = (id) => state.merchants.find((merchant) => String(merchant.id) === String(id));
  const productFor = (id) => state.products.find((product) => String(product.id) === String(id));
  const routeForRole = (role) => getNavigationItems(role)[0]?.route || 'customer.home';
  const pageTitle = () => getRouteTitle(state.route) || roleName(currentRole());
  const orderStatus = (order) => STATUS_LABELS[order?.status] ? order.status : 'pending';
  const statusTone = (status) => status === 'delivered' ? 'success' : ['cancelled', 'rejected', 'failed'].includes(status) ? 'danger' : ACTIVE_STATUSES.includes(status) ? 'progress' : 'neutral';
  const renderIcon = (name) => ICON_REGISTRY[name] || ICON_REGISTRY.orders;
  const CATEGORY_ICONS = Object.freeze({
    مطاعم: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 3v8M8 3v8M5 7h3M6.5 11v10M16 3v18M16 3c3 2 3 6 0 8"/></svg>',
    بقالة: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2 11h10l2-8H6M9 19h.01M17 19h.01"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>',
    صيدلية: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>',
    طرود: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z"/><path d="m4 7 8 4 8-4M12 11v10"/></svg>'
  });
  const renderCategoryIcon = (category) => CATEGORY_ICONS[category] || CATEGORY_ICONS.طرود;

  function finishIntro() {
    if (!introScreen || introScreen.classList.contains('is-hidden')) return;
    clearTimeout(introTimer);
    try { sessionStorage.setItem('mashwer_intro_seen', '1'); } catch { /* storage may be unavailable in restricted WebViews */ }
    document.body.classList.remove('intro-lock');
    app?.setAttribute('aria-hidden', 'false');
    introScreen.classList.add('is-hidden');
    setTimeout(() => introScreen.remove(), 420);
  }

  function startIntro() {
    if (!introScreen) return;
    let seen = false;
    try { seen = sessionStorage.getItem('mashwer_intro_seen') === '1'; } catch { /* continue with the intro */ }
    if (seen) return finishIntro();
    introTimer = setTimeout(finishIntro, 9000);
    introVideo?.addEventListener('ended', finishIntro, { once: true });
    introVideo?.addEventListener('error', () => {
      introVideo.classList.add('intro-video-fallback');
      introTimer = setTimeout(finishIntro, 1800);
    }, { once: true });
    const playback = introVideo?.play();
    if (playback?.catch) playback.catch(() => { introTimer = setTimeout(finishIntro, 1800); });
  }

  function showToast(message, error = false) {
    toastNode.textContent = message;
    toastNode.classList.toggle('toast-error', error);
    toastNode.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toastNode.classList.remove('show'), 3600);
  }

  function reportError(context, error) {
    console.error(`[Mashwer] ${context}`, error);
    return error?.message || 'حدث خطأ غير متوقع. حاول مرة أخرى.';
  }

  function statusBadge(status) {
    const value = orderStatus({ status });
    return `<span class="status ${statusTone(value)}"><span class="status-symbol" aria-hidden="true">${STATUS_SYMBOLS[value] || '•'}</span><span>${escapeHTML(STATUS_LABELS[value])}</span></span>`;
  }

  function navigationBadge(type) {
    if (type === 'cart') return state.cart.reduce((sum, item) => sum + item.quantity, 0);
    if (type === 'orders') return state.orderRows.filter((order) => ACTIVE_STATUSES.includes(orderStatus(order))).length;
    if (type === 'pendingOrders') return state.orderRows.filter((order) => ['pending', 'confirmed', 'searching_driver'].includes(orderStatus(order))).length;
    if (type === 'notifications') return state.notificationRows.filter((notice) => !notice.read_at).length;
    return 0;
  }

  function renderNavigation(role, activeRoute = state.route, mobile = false) {
    return getNavigationItems(role).map((item) => {
      const active = activeRoute === item.route;
      const badge = item.badge ? navigationBadge(item.badge) : 0;
      return `<button class="${mobile ? 'mobile-nav-item' : 'side-nav-item'} ${active ? 'active' : ''}" data-action="navigate-route" data-route="${item.route}" aria-label="${escapeHTML(item.label)}" aria-current="${active ? 'page' : 'false'}" title="${escapeHTML(item.label)}"><span class="nav-icon">${renderIcon(active ? item.activeIcon : item.icon)}</span><span>${escapeHTML(item.label)}</span>${badge ? `<b class="nav-badge">${badge > 99 ? '99+' : badge}</b>` : ''}</button>`;
    }).join('');
  }

  function dataState(kind, options = {}) {
    const source = state[kind];
    if (source.status === 'loading' || source.status === 'idle') return `<section class="state-card state-loading" aria-busy="true"><span class="loading-dot"></span><h2>جارٍ تحميل ${escapeHTML(options.title || 'البيانات')}</h2><p>نجهز أحدث المعلومات من النظام.</p></section>`;
    if (source.status === 'error') return `<section class="state-card state-error"><h2>تعذر تحميل ${escapeHTML(options.title || 'البيانات')}</h2><p>${escapeHTML(source.error || 'حدث خطأ في الاتصال.')}</p><button class="primary-button small-button" data-action="retry-data" data-kind="${kind}">إعادة المحاولة</button></section>`;
    if (source.status === 'empty') return `<section class="state-card state-empty"><h2>${escapeHTML(options.emptyTitle || `لا توجد ${options.title || 'بيانات'} حتى الآن`)}</h2><p>${escapeHTML(options.emptyText || 'ستظهر البيانات هنا عند توفرها.')}</p>${options.action || ''}</section>`;
    return '';
  }

  function emptyAction(route, label) {
    return route ? `<button class="primary-button small-button" data-action="navigate-route" data-route="${route}">${escapeHTML(label)}</button>` : '';
  }

  function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('20')) return `+${digits}`;
    if (digits.startsWith('0')) return `+20${digits.slice(1)}`;
    return `+${digits}`;
  }

  function authEmail(phone) {
    return `${normalizePhone(phone).replace('+', '')}@mashwer.local`;
  }

  function authErrorMessage(error) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('invalid login credentials')) return 'رقم الهاتف أو كلمة المرور غير صحيحة.';
    if (message.includes('email not confirmed')) return 'الحساب لم يتم تفعيله بعد. راجع حالة الحساب ثم حاول مرة أخرى.';
    if (message.includes('already registered') || message.includes('already been registered')) return 'هذا الرقم مسجل بالفعل. استخدم تسجيل الدخول.';
    if (message.includes('rate limit')) return 'تم تجاوز حد المحاولات مؤقتًا. انتظر قليلًا ثم حاول مرة أخرى.';
    if (message.includes('password') && message.includes('6')) return 'كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل.';
    return error?.message || 'حدث خطأ في المصادقة. حاول مرة أخرى.';
  }

  function normalizeMerchant(row) {
    return { ...row, delivery_value: Number(row.delivery_value || 0), active: row.active !== false };
  }

  function normalizeProduct(row) {
    return { ...row, price: Number(row.price || 0), available: row.available !== false };
  }

  function normalizeOrder(row) {
    const merchant = row.merchant || merchantFor(row.merchant_id);
    let items = row.items;
    if (typeof items === 'string') {
      try { items = JSON.parse(items); } catch { items = []; }
    }
    return {
      ...row,
      id: row.id || row.order_id,
      merchant_name: row.merchant_name || merchant?.name || 'طلب مشاوير',
      merchant,
      status: orderStatus(row),
      total: Number(row.total || 0),
      subtotal: Number(row.subtotal || 0),
      delivery_fee: Number(row.delivery_fee || 0),
      items: Array.isArray(items) ? items : [],
      address: row.address_text || row.address || 'العنوان غير محدد',
      created_label: row.created_label || formatDate(row.created_at)
    };
  }

  function localCatalog() {
    state.merchants = DEMO_MERCHANTS.map(normalizeMerchant);
    state.products = DEMO_PRODUCTS.map(normalizeProduct);
  }

  function localOrders() {
    if (state.orderRows.length && state.orderRows.every((order) => String(order.id).startsWith('DEMO-'))) {
      state.orders.status = 'success';
      return;
    }
    const role = currentRole();
    if (role === 'courier') {
      state.orderRows = DEMO_ORDERS.map((order) => normalizeOrder({ ...order, courier_id: 'demo-courier', merchant_name: order.merchant }));
    } else if (role === 'admin') {
      state.orderRows = DEMO_ORDERS.concat({ id: 'DEMO-1031', merchant: 'صيدلية الحياة', merchant_name: 'صيدلية الحياة', status: 'pending', total: 175, address: 'خلف الوحدة الصحية', created_at: 'أمس', items: [] }).map(normalizeOrder);
    } else {
      state.orderRows = DEMO_ORDERS.map(normalizeOrder);
    }
    state.orders.status = state.orderRows.length ? 'success' : 'empty';
  }

  async function loadCatalog() {
    state.catalog.status = 'loading';
    state.catalog.error = null;
    render();
    try {
      if (isDemo()) {
        localCatalog();
      } else {
        const [merchantResult, productResult] = await Promise.all([
          client.from('merchants').select('*').order('name'),
          client.from('products').select('*').eq('available', true).order('name')
        ]);
        if (merchantResult.error) throw merchantResult.error;
        if (productResult.error) throw productResult.error;
        state.merchants = (merchantResult.data || []).map(normalizeMerchant);
        state.products = (productResult.data || []).map(normalizeProduct);
      }
      state.catalog.status = state.merchants.length ? 'success' : 'empty';
    } catch (error) {
      state.catalog.status = 'error';
      state.catalog.error = reportError('catalog', error);
    }
    render();
  }

  async function loadOrders() {
    state.orders.status = 'loading';
    state.orders.error = null;
    render();
    try {
      if (isDemo()) {
        localOrders();
      } else {
        let query = client.from('orders').select('*, merchant:merchants(id,name,category,address_text), courier:profiles!orders_courier_id_fkey(id,full_name,phone)').order('created_at', { ascending: false });
        if (currentRole() === 'customer') query = query.eq('user_id', state.user.id);
        if (currentRole() === 'courier') query = query.or(`courier_id.eq.${state.user.id},and(courier_id.is.null,status.in.(pending,confirmed,searching_driver))`);
        const result = await query;
        if (result.error) throw result.error;
        state.orderRows = (result.data || []).map(normalizeOrder);
        state.orders.status = state.orderRows.length ? 'success' : 'empty';
      }
    } catch (error) {
      state.orders.status = 'error';
      state.orders.error = reportError('orders', error);
    }
    render();
  }

  async function loadNotifications() {
    state.notifications.status = 'loading';
    state.notifications.error = null;
    render();
    try {
      if (isDemo()) {
        state.notificationRows = [{ id: 'demo-notice-1', title: 'أهلاً بك في مشاوير', body: 'تابع طلبك من لحظة الإنشاء حتى التسليم.', read_at: null, created_at: new Date().toISOString() }];
      } else {
        const result = await client.from('notifications').select('*').eq('user_id', state.user.id).order('created_at', { ascending: false }).limit(30);
        if (result.error) throw result.error;
        state.notificationRows = result.data || [];
      }
      state.notifications.status = state.notificationRows.length ? 'success' : 'empty';
    } catch (error) {
      state.notifications.status = 'error';
      state.notifications.error = reportError('notifications', error);
    }
    render();
  }

  async function loadProfile(session) {
    if (!client || !session?.user) return null;
    const result = await client.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (result.error) throw result.error;
    return result.data || { id: session.user.id, full_name: session.user.user_metadata?.full_name || 'مستخدم مشاوير', role: session.user.user_metadata?.role || 'customer', phone: session.user.user_metadata?.phone || '' };
  }

  async function refreshUserData() {
    await Promise.all([loadCatalog(), loadOrders(), loadNotifications()]);
  }

  function startRealtime() {
    if (!client || isDemo() || !state.user || state.liveChannel) return;
    state.liveChannel = client.channel(`mashwer-${state.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => loadOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${state.user.id}` }, () => loadNotifications())
      .subscribe();
  }

  function stopRealtime() {
    if (state.liveChannel && client) client.removeChannel(state.liveChannel);
    state.liveChannel = null;
  }

  async function openSession(session, profile) {
    state.user = session.user;
    state.profile = profile || await loadProfile(session);
    state.demo = false;
    state.route = routeForRole(state.profile?.role);
    state.error = null;
    startRealtime();
    await refreshUserData();
    render();
  }

  async function bootstrap() {
    if (!client) {
      state.error = 'لم يتم إعداد الاتصال بقاعدة البيانات. أضف إعدادات Supabase ثم أعد فتح التطبيق.';
      render();
      return;
    }
    try {
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      if (result.data.session) await openSession(result.data.session);
      else render();
      client.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user && !state.user) await openSession(session);
        if (!session && state.user) await signOut(false);
      });
    } catch (error) {
      state.error = reportError('session', error);
      render();
    }
  }

  function brand() {
    return `<a class="brand brand-official" href="#" data-action="go-home" aria-label="مشاوير"><img class="brand-mark" src="logo-official-transparent.png" alt="مشاوير" /></a>`;
  }

  function formatDate(value) {
    if (!value) return 'الآن';
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? escapeHTML(value) : date.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function merchantCard(merchant) {
    const productCount = state.products.filter((product) => String(product.merchant_id) === String(merchant.id)).length;
    return `<article class="merchant-card"><div class="merchant-art merchant-${escapeHTML(merchant.category)}"><span>${renderCategoryIcon(merchant.category)}</span></div><div class="merchant-card-body"><span class="section-kicker">${escapeHTML(merchant.category)}</span><h3>${escapeHTML(merchant.name)}</h3><p>${escapeHTML(merchant.description || merchant.address_text || 'محل قريب منك')}</p><div class="merchant-meta"><span>${productCount} صنف متاح</span><span>التوصيل ${money(merchant.delivery_value)}</span></div><button class="secondary-button" data-action="select-merchant" data-merchant-id="${escapeHTML(merchant.id)}">تصفح الأصناف</button></div></article>`;
  }

  function productCard(product) {
    const line = state.cart.find((item) => String(item.product_id) === String(product.id));
    return `<article class="product-card"><div class="product-art"><span>${renderCategoryIcon(product.category)}</span></div><div class="product-card-body"><span class="section-kicker">${escapeHTML(product.category || 'صنف')}</span><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.description || 'تفاصيل الصنف تظهر هنا.')}</p><div class="product-footer"><strong>${money(product.price)}</strong><button class="add-button" data-action="add-to-cart" data-product-id="${escapeHTML(product.id)}" aria-label="أضف ${escapeHTML(product.name)}">${line ? `+${line.quantity}` : '+'}</button></div></div></article>`;
  }

  function orderCard(order, options = {}) {
    const status = orderStatus(order);
    const action = options.action || (currentRole() === 'customer' ? 'track-order' : currentRole() === 'courier' ? 'open-driver-order' : 'open-admin-order');
    const actionLabel = options.actionLabel || (currentRole() === 'customer' ? 'متابعة الطلب' : currentRole() === 'courier' ? 'فتح المشوار' : 'إدارة الطلب');
    const courier = order.courier?.full_name ? `<small class="muted">المندوب: ${escapeHTML(order.courier.full_name)}</small>` : '';
    return `<article class="order-card"><div class="order-card-top"><span class="order-number">#${escapeHTML(String(order.id || '').slice(-8))}</span>${statusBadge(status)}</div><div class="order-card-main"><div><span class="section-kicker">${escapeHTML(order.created_label || formatDate(order.created_at))}</span><h3>${escapeHTML(order.merchant_name)}</h3><p><span class="address-marker" aria-hidden="true">●</span> ${escapeHTML(order.address)}</p>${courier}</div><strong>${money(order.total)}</strong></div><div class="order-card-actions"><button class="secondary-button" data-action="${action}" data-order-id="${escapeHTML(order.id)}">${escapeHTML(actionLabel)}</button>${options.allowCancel && ACTIVE_STATUSES.includes(status) ? '<button class="link-button danger-link" data-action="cancel-order" data-order-id="' + escapeHTML(order.id) + '">إلغاء الطلب</button>' : ''}</div></article>`;
  }

  function statsCard(label, value, icon, tone = '') {
    return `<article class="stat-card ${tone}"><span class="stat-icon">${renderIcon(icon)}</span><div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div></article>`;
  }

  function routeLoadingView(title) {
    return `<main class="route-loading" aria-busy="true"><h1>${escapeHTML(title)}</h1><span class="loading-dot"></span><span>جارٍ فتح ${escapeHTML(title)}...</span></main>`;
  }

  function renderLanding() {
    const message = state.error ? `<div class="form-note error-note">${escapeHTML(state.error)}</div>` : '';
    return `<div class="landing-view"><header class="landing-header container">${brand()}<button class="ghost-button" data-action="open-auth" data-mode="login" data-role="customer">تسجيل الدخول</button></header><main class="landing-main container"><section class="landing-hero"><div class="landing-copy"><span class="landing-kicker">مشاوير · توصيل محلي</span><h1>من قلب قريتك،<br /><em>يوصلك أسرع.</em></h1><p>مطاعم، بقالة، صيدلية وطرود. اطلب من المحلات القريبة وتابع كل مرحلة بوضوح.</p><div class="landing-actions"><button class="primary-button" data-action="open-auth" data-mode="signup" data-role="customer">إنشاء حساب عميل</button><button class="light-button" data-action="open-auth" data-mode="login" data-role="courier">أنا مندوب</button><button class="text-button" data-action="enter-demo">استعراض التطبيق</button></div>${message}</div><div class="landing-mark"><div class="mark-swoosh"></div><img src="icon.svg" alt="مشاوير" /><strong>مشاوير</strong><span>دائمًا سابقين بخطوة</span></div></section><section class="entry-section"><div class="section-heading"><div><span class="section-kicker">اختار طريقك</span><h2>تجربة واضحة لكل دور</h2></div><span class="section-hint">دخول آمن حسب نوع الحساب</span></div><div class="entry-grid"><article class="entry-card entry-customer"><div class="entry-icon">⌂</div><h3>مستخدم</h3><p>اطلب من المحلات وتابع مشوارك حتى بابك.</p><button class="entry-button" data-action="open-auth" data-mode="signup" data-role="customer">ابدأ الآن ←</button></article><article class="entry-card entry-courier"><div class="entry-icon">➤</div><h3>مندوب</h3><p>استقبل المشاوير، حدّث الحالة، وتابع دخلك.</p><button class="entry-button" data-action="open-auth" data-mode="login" data-role="courier">دخول المندوب ←</button></article><article class="entry-card entry-admin"><div class="entry-icon">▦</div><h3>إدارة</h3><p>راقب الطلبات، المندوبين، والمحلات من لوحة واحدة.</p><button class="entry-button" data-action="open-auth" data-mode="login" data-role="admin">دخول الإدارة ←</button></article></div></section><section class="trust-strip"><span>✓ أسعار واضحة</span><span>✓ متابعة مباشرة</span><span>✓ محلات قريبة منك</span><span>✓ دفع يناسبك</span></section></main></div>`;
  }

  function renderTopbar() {
    const unread = state.notificationRows.filter((notice) => !notice.read_at).length;
    return `<header class="app-header container"><div class="header-location"><span class="location-pin">●</span><div><small>${currentRole() === 'customer' ? 'توصيل إلى' : 'حساب'}</small><strong>${escapeHTML(state.profile?.full_name || roleName(currentRole()))}</strong></div></div><div class="header-actions"><button class="icon-button" data-action="navigate-route" data-route="${currentRole() === 'customer' ? 'customer.notifications' : currentRole() === 'courier' ? 'driver.notifications' : 'admin.notifications'}" title="الإشعارات">${renderIcon(unread ? 'notificationsActive' : 'notifications')}${unread ? `<sup>${unread}</sup>` : ''}</button><button class="avatar" data-action="navigate-route" data-route="${currentRole() === 'customer' ? 'customer.account' : currentRole() === 'courier' ? 'driver.earnings' : 'admin.overview'}" title="الحساب">${escapeHTML(initials(state.profile?.full_name))}</button></div></header>`;
  }

  function renderShell(content) {
    const role = currentRole();
    const current = pageTitle();
    return `<div class="app-shell role-${role}"><aside class="side-panel"><div class="side-brand">${brand()}</div><div class="side-role"><span>مساحة ${escapeHTML(roleName(role))}</span><strong>${escapeHTML(current)}</strong></div><nav class="side-nav" aria-label="التنقل الرئيسي">${renderNavigation(role)}</nav><button class="side-logout" data-action="logout"><span>${renderIcon('account')}</span>تسجيل الخروج</button></aside><div class="app-content">${renderTopbar()}<div class="offline-banner ${state.offline ? 'visible' : ''}">أنت غير متصل حاليًا. نعرض آخر بيانات متاحة.</div>${content}<nav class="mobile-nav" aria-label="التنقل السفلي">${renderNavigation(role, state.route, true)}</nav></div>${state.modal ? renderModal() : ''}</div>`;
  }

  function renderCustomerHome() {
    const filteredMerchants = state.merchants.filter((merchant) => state.category === 'الكل' || merchant.category === state.category);
    const selected = merchantFor(state.selectedMerchant);
    const filteredProducts = state.products.filter((product) => (!selected || String(product.merchant_id) === String(selected.id)) && (state.category === 'الكل' || product.category === state.category) && (!state.search || `${product.name} ${product.description || ''}`.toLowerCase().includes(state.search.toLowerCase())));
    const catalogState = dataState('catalog', { title: 'المحلات', emptyTitle: 'لا توجد محلات متاحة الآن', emptyText: 'سيظهر المحل هنا بعد أن تضيفه الإدارة.' });
    return `<main class="dashboard-main container"><section class="welcome-panel"><div><span class="section-kicker">أهلاً ${escapeHTML((state.profile?.full_name || 'بك').split(' ')[0])}</span><h1>جاهز لمشوار<br /><em>يوصلك أسرع.</em></h1><p>اختار طلبك، وإحنا نكمل الطريق.</p></div><div class="welcome-scooter">➤</div></section><section class="service-grid">${CATEGORIES.slice(1).map((category) => `<button class="service-tile ${state.category === category ? 'active' : ''}" data-action="set-category" data-category="${category}"><span>${renderCategoryIcon(category)}</span><b>${category}</b></button>`).join('')}</section><section class="app-section"><div class="section-heading"><div><span class="section-kicker">اختيارات قريبة</span><h2>محلات قريتك</h2></div><button class="link-button" data-action="set-category" data-category="الكل">عرض الكل ←</button></div>${catalogState || `<div class="merchant-grid">${filteredMerchants.map(merchantCard).join('')}</div>`}</section><section class="app-section"><div class="section-heading"><div><span class="section-kicker">اطلب اللي تحتاجه</span><h2>${selected ? escapeHTML(selected.name) : 'الأكثر طلبًا'}</h2></div><button class="link-button" data-action="navigate-route" data-route="customer.cart">السلة (${navigationBadge('cart')})</button></div><div class="search-box"><span>⌕</span><input data-input="catalog-search" value="${escapeHTML(state.search)}" placeholder="ابحث عن صنف أو محل" aria-label="البحث في الكتالوج" /></div><div class="category-pills">${CATEGORIES.map((category) => `<button class="pill ${state.category === category ? 'active' : ''}" data-action="set-category" data-category="${category}">${category}</button>`).join('')}</div>${catalogState ? '' : `<div class="product-grid">${filteredProducts.map(productCard).join('') || `<section class="state-card state-empty"><h2>لا توجد أصناف مطابقة</h2><p>غيّر البحث أو اختر قسمًا آخر.</p></section>`}</div>`}</section></main>`;
  }

  function renderCustomerOrders() {
    const orders = state.orderRows.filter((order) => state.ordersFilter === 'all' || orderStatus(order) === state.ordersFilter);
    return `<main class="dashboard-main container"><div class="page-heading"><div><span class="section-kicker">تاريخ المشاوير</span><h1>طلباتي</h1><p>تابع الطلبات الحالية والسابقة من مكان واحد.</p></div><button class="primary-button" data-action="navigate-route" data-route="customer.home">طلب جديد</button></div><div class="filter-row">${[['all', 'الكل'], ['pending', 'جارية'], ['delivered', 'تم التسليم'], ['cancelled', 'ملغاة']].map(([value, label]) => `<button class="pill ${state.ordersFilter === value ? 'active' : ''}" data-action="orders-filter" data-filter="${value}">${label}</button>`).join('')}</div>${dataState('orders', { title: 'الطلبات', emptyTitle: 'لا توجد طلبات بعد', emptyText: 'ابدأ من المحلات القريبة وأضف أول طلب لك.', action: emptyAction('customer.home', 'ابدأ طلبًا جديدًا') }) || `<div class="orders-list">${orders.length ? orders.map((order) => orderCard(order, { allowCancel: true })).join('') : '<section class="state-card state-empty"><h2>لا توجد نتائج بهذا الفلتر</h2><p>جرّب اختيار الكل لعرض كل الطلبات.</p></section>'}</div>`}</main>`;
  }

  function renderCustomerCart() {
    const merchant = merchantFor(state.selectedMerchant || state.cart[0]?.merchant_id);
    const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const fee = state.cart.length ? Number(merchant?.delivery_value || 0) : 0;
    const total = subtotal + fee;
    return `<main class="dashboard-main container"><div class="page-heading"><div><span class="section-kicker">قبل تأكيد الطلب</span><h1>السلة</h1><p>راجع الأصناف والعنوان وطريقة الدفع ثم أرسل الطلب.</p></div><button class="secondary-button" data-action="navigate-route" data-route="customer.home">إضافة أصناف</button></div>${state.cart.length ? `<div class="cart-layout"><section class="cart-lines">${state.cart.map((item) => `<article class="cart-line"><div class="product-art small-art"><span>${renderCategoryIcon(item.category)}</span></div><div class="cart-line-copy"><h3>${escapeHTML(item.name)}</h3><p>${money(item.price)} · ${escapeHTML(merchantFor(item.merchant_id)?.name || '')}</p><div class="quantity-control"><button aria-label="تقليل الكمية" data-action="cart-quantity" data-product-id="${escapeHTML(item.product_id)}" data-change="-1">−</button><strong>${item.quantity}</strong><button aria-label="زيادة الكمية" data-action="cart-quantity" data-product-id="${escapeHTML(item.product_id)}" data-change="1">+</button></div></div><strong>${money(item.price * item.quantity)}</strong></article>`).join('')}</section><section class="checkout-card"><h2>بيانات التوصيل</h2><form id="checkout-form" class="form-grid"><div class="field"><label>العنوان</label><input name="address" required value="${escapeHTML(state.checkout.address)}" placeholder="اسم الشارع ورقم المنزل" /></div><div class="field"><label>رقم التواصل</label><input name="phone" required inputmode="tel" value="${escapeHTML(state.checkout.phone || state.profile?.phone || '')}" placeholder="01xxxxxxxxx" /></div><div class="field"><label>طريقة الدفع</label><select name="payment"><option value="paid_to_store" ${state.checkout.payment === 'paid_to_store' ? 'selected' : ''}>الدفع للمحل</option><option value="cash" ${state.checkout.payment === 'cash' ? 'selected' : ''}>كاش عند الاستلام</option><option value="vodafone_cash" ${state.checkout.payment === 'vodafone_cash' ? 'selected' : ''}>Vodafone Cash</option><option value="instapay" ${state.checkout.payment === 'instapay' ? 'selected' : ''}>InstaPay</option></select></div>${['vodafone_cash', 'instapay'].includes(state.checkout.payment) ? '<div class="field"><label>مرجع التحويل</label><input name="payment_reference" value="' + escapeHTML(state.checkout.paymentReference) + '" placeholder="رقم العملية" /></div>' : ''}<div class="field"><label>ملاحظات اختيارية</label><textarea name="notes" rows="3" placeholder="أي تفاصيل تساعد المندوب">${escapeHTML(state.checkout.notes)}</textarea></div><div class="totals"><div><span>الإجمالي الفرعي</span><strong>${money(subtotal)}</strong></div><div><span>التوصيل</span><strong>${money(fee)}</strong></div><div class="total-row"><span>الإجمالي</span><strong>${money(total)}</strong></div></div><button class="primary-button" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'جارٍ إرسال الطلب...' : 'تأكيد الطلب · ' + money(total)}</button></form></section></div>` : `<section class="state-card state-empty"><h2>السلة فارغة</h2><p>أضف أصنافًا من أحد المحلات القريبة لتبدأ طلبك.</p>${emptyAction('customer.home', 'تصفح المحلات')}</section>`}</main>`;
  }

  function renderAccount() {
    const name = state.profile?.full_name || state.user?.user_metadata?.full_name || 'مستخدم مشاوير';
    return `<main class="dashboard-main container"><div class="page-heading"><div><span class="section-kicker">ملفك داخل مشاوير</span><h1>حسابي</h1><p>حدّث بيانات التواصل والعنوان الافتراضي بسهولة.</p></div></div><section class="account-grid"><article class="profile-card"><div class="large-avatar">${escapeHTML(initials(name))}</div><div><h2>${escapeHTML(name)}</h2><p>${escapeHTML(state.profile?.phone || state.user?.user_metadata?.phone || '')}</p><span class="role-chip">${escapeHTML(roleName(currentRole()))}</span></div></article><form id="profile-form" class="panel-card form-grid"><h2>البيانات الشخصية</h2><div class="field"><label>الاسم بالكامل</label><input name="full_name" required value="${escapeHTML(name)}" /></div><div class="field"><label>العنوان الافتراضي</label><input name="address" value="${escapeHTML(state.profile?.address_text || '')}" placeholder="يمكنك تغييره عند كل طلب" /></div><button class="primary-button" type="submit" ${state.busy ? 'disabled' : ''}>حفظ التغييرات</button></form></section><section class="panel-card danger-zone"><h2>جلسة الحساب</h2><p>عند تسجيل الخروج ستحتاج إلى إدخال بياناتك مرة أخرى.</p><button class="secondary-button danger-button" data-action="logout">تسجيل الخروج</button></section></main>`;
  }

  function renderNotifications() {
    return `<main class="dashboard-main container"><div class="page-heading"><div><span class="section-kicker">آخر التحديثات</span><h1>الإشعارات</h1><p>تنبيهات الطلبات والحساب تظهر هنا.</p></div><button class="secondary-button" data-action="mark-notifications-read">تعليم الكل كمقروء</button></div>${dataState('notifications', { title: 'الإشعارات', emptyTitle: 'لا توجد إشعارات', emptyText: 'سنخبرك هنا بأي تحديث مهم.' }) || `<div class="notification-list">${state.notificationRows.map((notice) => `<article class="notification-card ${notice.read_at ? '' : 'unread'}"><span class="notification-icon">${renderIcon('notifications')}</span><div><h3>${escapeHTML(notice.title)}</h3><p>${escapeHTML(notice.body)}</p><small>${formatDate(notice.created_at)}</small></div>${notice.order_id ? `<button class="link-button" data-action="track-order" data-order-id="${escapeHTML(notice.order_id)}">فتح الطلب</button>` : ''}</article>`).join('')}</div>`}</main>`;
  }

  function renderDriverHome() {
    const active = state.orderRows.filter((order) => ACTIVE_STATUSES.includes(orderStatus(order)));
    const available = state.profile?.available === true;
    return `<main class="dashboard-main container"><section class="driver-hero"><div><span class="section-kicker">مساحة المندوب</span><h1>جاهز لمشوار جديد؟</h1><p>غيّر حالتك لاستقبال المشاوير القريبة منك.</p></div><button class="availability-toggle ${available ? 'online' : ''}" data-action="toggle-availability"><span></span>${available ? 'متاح لاستقبال الطلبات' : 'غير متاح حاليًا'}</button></section><section class="stats-grid">${statsCard('مشاوير نشطة', String(active.length), 'orders', 'stat-orange')}${statsCard('حالة الحساب', state.profile?.approved === false ? 'بانتظار الموافقة' : available ? 'متاح' : 'متوقف', 'account', available ? 'stat-green' : '')}${statsCard('تحديث GPS', state.trackingLocation ? 'مفعّل' : 'عند الحاجة', 'home', '')}</section><section class="app-section"><div class="section-heading"><div><span class="section-kicker">الأولوية الآن</span><h2>المشاوير المتاحة</h2></div><button class="link-button" data-action="navigate-route" data-route="driver.orders">كل المشاوير ←</button></div>${state.profile?.approved === false ? '<section class="state-card state-empty"><h2>الحساب ينتظر موافقة الإدارة</h2><p>ستظهر لك المشاوير بعد اعتماد حساب المندوب.</p></section>' : active.length ? `<div class="orders-list">${active.slice(0, 3).map((order) => orderCard(order, { action: 'open-driver-order', actionLabel: 'فتح المشوار' })).join('')}</div>` : '<section class="state-card state-empty"><h2>لا توجد مشاوير نشطة</h2><p>اترك التطبيق مفتوحًا وسنحدّث القائمة عند وصول طلب جديد.</p></section>'}</section></main>`;
  }

  function renderDriverOrders() {
    const rows = state.orderRows.filter((order) => state.ordersFilter === 'all' || orderStatus(order) === state.ordersFilter);
    return `<main class="dashboard-main container"><div class="page-heading"><div><span class="section-kicker">التقاط وتسليم</span><h1>المشاوير</h1><p>اقبل الطلبات المتاحة وحدّث الحالة بعد كل خطوة.</p></div><button class="secondary-button" data-action="refresh-orders">تحديث القائمة</button></div><div class="filter-row">${[['all', 'الكل'], ['pending', 'متاحة'], ['delivering', 'في الطريق'], ['delivered', 'مكتملة']].map(([value, label]) => `<button class="pill ${state.ordersFilter === value ? 'active' : ''}" data-action="orders-filter" data-filter="${value}">${label}</button>`).join('')}</div>${dataState('orders', { title: 'المشاوير', emptyTitle: 'لا توجد مشاوير حاليًا', emptyText: 'عند تفعيل حالة التوفر ستظهر الطلبات المتاحة هنا.' }) || `<div class="orders-list">${rows.map((order) => orderCard(order, { action: 'open-driver-order', actionLabel: 'إدارة المشوار' })).join('') || '<section class="state-card state-empty"><h2>لا توجد نتائج بهذا الفلتر</h2><p>جرّب اختيار الكل.</p></section>'}</div>`}</main>`;
  }

  function renderDriverEarnings() {
    const completed = state.orderRows.filter((order) => orderStatus(order) === 'delivered');
    const total = completed.reduce((sum, order) => sum + Number(order.delivery_fee || 0), 0);
    return `<main class="dashboard-main container"><div class="page-heading"><div><span class="section-kicker">ملخص الأداء</span><h1>حساب المندوب</h1><p>تابع المشاوير المكتملة ورسوم التوصيل المسجلة.</p></div></div><section class="stats-grid">${statsCard('المشاوير المكتملة', String(completed.length), 'orders', 'stat-green')}${statsCard('رسوم التوصيل', money(total), 'wallet', 'stat-orange')}${statsCard('التقييم', 'غير متاح', 'account', '')}</section><section class="panel-card"><h2>آخر المشاوير المكتملة</h2>${completed.length ? `<div class="orders-list compact-list">${completed.slice(0, 10).map((order) => orderCard(order, { action: 'open-driver-order', actionLabel: 'التفاصيل' })).join('')}</div>` : '<div class="inline-empty">لا توجد مشاوير مكتملة بعد.</div>'}</section></main>`;
  }

  function renderAdminOverview() {
    const active = state.orderRows.filter((order) => ACTIVE_STATUSES.includes(orderStatus(order)));
    const revenue = state.orderRows.reduce((sum, order) => sum + Number(order.total || 0), 0);
    return `<main class="dashboard-main container"><div class="page-heading"><div><span class="section-kicker">لوحة التحكم</span><h1>نظرة عامة</h1><p>تابع حركة مشاوير النظام واتخذ الإجراء المناسب.</p></div><button class="primary-button" data-action="refresh-orders">تحديث البيانات</button></div><section class="stats-grid">${statsCard('إجمالي الطلبات', String(state.orderRows.length), 'orders', 'stat-orange')}${statsCard('طلبات نشطة', String(active.length), 'home', 'stat-green')}${statsCard('قيمة الطلبات', money(revenue), 'wallet', '')}${statsCard('محلات نشطة', String(state.merchants.filter((merchant) => merchant.active).length), 'shops', '')}</section><section class="dashboard-columns"><section class="panel-card"><div class="section-heading"><div><span class="section-kicker">آخر الحركة</span><h2>أحدث الطلبات</h2></div><button class="link-button" data-action="navigate-route" data-route="admin.orders">عرض الكل ←</button></div>${state.orderRows.length ? `<div class="orders-list compact-list">${state.orderRows.slice(0, 5).map((order) => orderCard(order, { action: 'open-admin-order', actionLabel: 'إدارة' })).join('')}</div>` : '<div class="inline-empty">لا توجد طلبات في النظام.</div>'}</section><section class="panel-card"><div class="section-heading"><div><span class="section-kicker">المحلات</span><h2>التغطية الحالية</h2></div><button class="link-button" data-action="navigate-route" data-route="admin.shops">إدارة الأسعار ←</button></div><div class="mini-list">${state.merchants.slice(0, 5).map((merchant) => `<div class="mini-row"><span>${escapeHTML(merchant.name)}</span><strong>${state.products.filter((product) => String(product.merchant_id) === String(merchant.id)).length} أصناف</strong></div>`).join('') || '<div class="inline-empty">لا توجد محلات.</div>'}</div></section></section></main>`;
  }

  function renderAdminOrders() {
    const rows = state.orderRows.filter((order) => state.ordersFilter === 'all' || orderStatus(order) === state.ordersFilter);
    return `<main class="dashboard-main container"><div class="page-heading"><div><span class="section-kicker">التشغيل اليومي</span><h1>الطلبات</h1><p>راجع الطلبات وحدد المندوب أو حدّث الحالة.</p></div><button class="secondary-button" data-action="refresh-orders">تحديث</button></div><div class="filter-row">${[['all', 'الكل'], ['pending', 'جديدة'], ['assigned', 'مع مندوب'], ['delivering', 'قيد التوصيل'], ['delivered', 'مكتملة']].map(([value, label]) => `<button class="pill ${state.ordersFilter === value ? 'active' : ''}" data-action="orders-filter" data-filter="${value}">${label}</button>`).join('')}</div>${dataState('orders', { title: 'الطلبات', emptyTitle: 'لا توجد طلبات', emptyText: 'ستظهر الطلبات الجديدة هنا عند إنشائها.' }) || `<div class="orders-list">${rows.map((order) => orderCard(order, { action: 'open-admin-order', actionLabel: 'إدارة الطلب' })).join('') || '<section class="state-card state-empty"><h2>لا توجد نتائج بهذا الفلتر</h2><p>جرّب اختيار الكل.</p></section>'}</div>`}</main>`;
  }

  function renderAdminDrivers() {
    const couriers = state.courierRows;
    return `<main class="dashboard-main container"><div class="page-heading"><div><span class="section-kicker">فريق التوصيل</span><h1>المندوبون</h1><p>اعرض الاعتماد والتوفر وآخر نشاط لكل مندوب.</p></div><button class="secondary-button" data-action="load-admin-data">تحديث</button></div>${couriers.length ? `<div class="people-grid">${couriers.map((courier) => `<article class="person-card"><div class="person-avatar">${escapeHTML(initials(courier.full_name))}</div><div><h3>${escapeHTML(courier.full_name || 'مندوب')}</h3><p>${escapeHTML(courier.phone || 'بدون رقم')}</p><span class="status ${courier.approved === false ? 'new' : courier.available ? 'success' : 'neutral'}">${courier.approved === false ? 'بانتظار الموافقة' : courier.available ? 'متاح' : 'غير متاح'}</span></div><button class="secondary-button small-button" data-action="toggle-driver-approval" data-driver-id="${escapeHTML(courier.id)}" data-approved="${courier.approved === false ? 'false' : 'true'}">${courier.approved === false ? 'اعتماد' : 'تفاصيل'}</button></article>`).join('')}</div>` : '<section class="state-card state-empty"><h2>لا توجد بيانات مندوبين</h2><p>اضغط تحديث أو تأكد من وجود حسابات مندوبين معتمدة.</p></section>'}</main>`;
  }

  function renderAdminShops() {
    return `<main class="dashboard-main container"><div class="page-heading"><div><span class="section-kicker">المحلات والأصناف</span><h1>الأسعار والتغطية</h1><p>راجع رسوم التوصيل والأصناف المتاحة أمام العملاء.</p></div><button class="secondary-button" data-action="load-catalog">تحديث</button></div>${state.merchants.length ? `<div class="shops-table-wrap"><table class="data-table"><thead><tr><th>المحل</th><th>القسم</th><th>الأصناف</th><th>التوصيل</th><th>الحالة</th><th></th></tr></thead><tbody>${state.merchants.map((merchant) => `<tr><td><strong>${escapeHTML(merchant.name)}</strong><small>${escapeHTML(merchant.address_text || '')}</small></td><td>${escapeHTML(merchant.category)}</td><td>${state.products.filter((product) => String(product.merchant_id) === String(merchant.id)).length}</td><td>${money(merchant.delivery_value)}</td><td>${merchant.active ? '<span class="status success">نشط</span>' : '<span class="status danger">متوقف</span>'}</td><td><button class="link-button" data-action="edit-merchant" data-merchant-id="${escapeHTML(merchant.id)}">تعديل الرسوم</button></td></tr>`).join('')}</tbody></table></div>` : '<section class="state-card state-empty"><h2>لا توجد محلات</h2><p>أضف أول محل من قاعدة البيانات ليظهر هنا.</p></section>'}</main>`;
  }

  function renderAdminNotifications() {
    return renderNotifications();
  }

  function authModal() {
    const mode = state.authMode;
    const role = state.authRole;
    const title = mode === 'signup' ? (role === 'courier' ? 'انضم كمندوب' : 'ابدأ أول مشوار') : mode === 'forgot' ? 'استرجاع كلمة المرور' : `دخول ${roleName(role)}`;
    const subtitle = mode === 'signup' ? 'سجّل بياناتك للانضمام إلى مشاوير.' : mode === 'forgot' ? 'استخدم رقم الهاتف وPIN الاسترجاع.' : 'أدخل بياناتك للوصول إلى مساحة حسابك.';
    const roles = ['customer', 'courier'];
    return `<div class="modal-head"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="close-button" data-action="close-modal">×</button></div><div class="modal-body">${mode !== 'forgot' ? `<div class="auth-tabs"><button class="${mode === 'login' ? 'active' : ''}" data-action="auth-mode" data-mode="login">تسجيل الدخول</button><button class="${mode === 'signup' ? 'active' : ''}" data-action="auth-mode" data-mode="signup">حساب جديد</button></div><div class="role-tabs">${roles.map((item) => `<button class="${role === item ? 'active' : ''}" data-action="auth-role" data-role="${item}">${escapeHTML(roleName(item))}</button>`).join('')}</div>` : ''}<form id="auth-form" class="form-grid"><input type="hidden" name="mode" value="${mode}" /><input type="hidden" name="role" value="${role}" />${mode === 'signup' ? '<div class="field"><label>الاسم بالكامل</label><input name="full_name" required autocomplete="name" placeholder="مثال: أحمد محمد" /></div>' : ''}<div class="field"><label>رقم الهاتف</label><input name="phone" required inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" /></div>${mode === 'forgot' ? '<div class="field"><label>PIN الاسترجاع</label><input name="pin" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" /></div>' : ''}<div class="field"><label>${mode === 'forgot' ? 'كلمة المرور الجديدة' : 'كلمة المرور'}</label><input name="password" type="password" required minlength="6" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" placeholder="6 أحرف أو أرقام على الأقل" /></div>${mode === 'signup' ? '<div class="field"><label>PIN الاسترجاع</label><input name="pin" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6 أرقام" /></div><div class="form-note">احفظ PIN في مكان آمن؛ سيُستخدم لاسترجاع الحساب.</div>' : ''}<button class="primary-button" type="submit" ${state.busy ? 'disabled' : ''}>${state.busy ? 'جارٍ التنفيذ...' : mode === 'signup' ? 'إنشاء الحساب' : mode === 'forgot' ? 'تغيير كلمة المرور' : 'تسجيل الدخول'}</button></form>${mode === 'login' ? '<button class="link-button auth-forgot" data-action="auth-mode" data-mode="forgot">نسيت كلمة المرور؟</button>' : ''}</div>`;
  }

  function trackingModal(order) {
    const status = orderStatus(order);
    const index = Math.max(0, STATUS_STEPS.indexOf(status));
    return `<div class="modal-head"><div><span class="section-kicker">#${escapeHTML(String(order.id).slice(-8))}</span><h2>متابعة ${escapeHTML(order.merchant_name)}</h2><p>${escapeHTML(STATUS_LABELS[status])}</p></div><button class="close-button" data-action="close-modal">×</button></div><div class="modal-body tracking-body"><div class="tracking-summary"><strong>${money(order.total)}</strong><span>${escapeHTML(order.address)}</span></div><ol class="tracking-steps">${STATUS_STEPS.map((step, stepIndex) => `<li class="${stepIndex < index ? 'complete' : stepIndex === index ? 'current' : ''}"><span>${stepIndex < index ? '✓' : stepIndex + 1}</span><div><b>${escapeHTML(STATUS_LABELS[step])}</b>${stepIndex === index ? '<small>آخر تحديث من النظام</small>' : ''}</div></li>`).join('')}</ol><div class="tracking-actions">${!isTerminal(status) ? '<button class="secondary-button" data-action="refresh-orders">تحديث الحالة</button>' : ''}<button class="primary-button" data-action="close-modal">إغلاق</button></div></div>`;
  }

  function orderActionModal(order, role) {
    const status = orderStatus(order);
    const next = role === 'courier' ? ({ pending: ['driver_accepted', 'قبول المشوار'], confirmed: ['driver_accepted', 'قبول المشوار'], searching_driver: ['driver_accepted', 'قبول المشوار'], driver_accepted: ['heading_to_pickup', 'بدأت التوجه للاستلام'], heading_to_pickup: ['arrived_pickup', 'وصلت للاستلام'], arrived_pickup: ['picked_up', 'تم استلام الطلب'], picked_up: ['delivering', 'بدأ التوصيل'], delivering: ['arrived_destination', 'وصلت للعنوان'], arrived_destination: ['delivered', 'تأكيد التسليم'] }[status]) : null;
    const adminAction = ['pending', 'confirmed', 'searching_driver'].includes(status) ? 'تعيين مندوب' : 'تحديث حالة';
    return `<div class="modal-head"><div><span class="section-kicker">${role === 'courier' ? 'إدارة المشوار' : 'تشغيل الطلب'}</span><h2>#${escapeHTML(String(order.id).slice(-8))}</h2><p>${escapeHTML(order.merchant_name)} · ${escapeHTML(order.address)}</p></div><button class="close-button" data-action="close-modal">×</button></div><div class="modal-body"><div class="order-modal-summary"><div><span>الحالة الحالية</span>${statusBadge(status)}</div><strong>${money(order.total)}</strong></div><div class="order-lines">${order.items.length ? order.items.map((item) => `<div><span>${escapeHTML(item.name || item.product_name || 'صنف')} × ${escapeHTML(item.quantity || 1)}</span><strong>${money(Number(item.price || 0) * Number(item.quantity || 1))}</strong></div>`).join('') : '<p class="muted">تفاصيل الأصناف محفوظة داخل الطلب.</p>'}</div>${role === 'courier' && next ? `<button class="primary-button full-button" data-action="advance-order" data-order-id="${escapeHTML(order.id)}" data-next-status="${next[0]}">${escapeHTML(next[1])}</button>` : role === 'admin' ? `<button class="primary-button full-button" data-action="admin-order-action" data-order-id="${escapeHTML(order.id)}">${adminAction}</button>` : ''}${isTerminal(status) ? '<p class="form-note">هذا الطلب مغلق ولا يمكن تعديل حالته.</p>' : ''}</div>`;
  }

  function renderModal() {
    let content = '';
    if (state.modal === 'auth') content = authModal();
    if (state.modal === 'tracking' && state.trackingOrder) content = trackingModal(state.trackingOrder);
    if (state.modal === 'driver-order' && state.trackingOrder) content = orderActionModal(state.trackingOrder, 'courier');
    if (state.modal === 'admin-order' && state.trackingOrder) content = orderActionModal(state.trackingOrder, 'admin');
    if (state.modal === 'admin-assign' && state.trackingOrder) content = adminAssignModal(state.trackingOrder);
    if (state.modal === 'admin-advance' && state.trackingOrder) content = adminAdvanceModal(state.trackingOrder);
    return content ? `<div class="modal-backdrop" data-action="backdrop"><section class="modal" role="dialog" aria-modal="true">${content}</section></div>` : '';
  }

  function routeContent(route) {
    if (state.routeLoading.has(route)) return routeLoadingView(pageTitle());
    if (state.routeErrors[route]) return `<main class="dashboard-main container"><section class="state-card state-error"><h2>تعذر فتح ${escapeHTML(pageTitle())}</h2><p>${escapeHTML(state.routeErrors[route])}</p><button class="primary-button small-button" data-action="retry-route" data-route="${escapeHTML(route)}">إعادة المحاولة</button></section></main>`;
    const pages = {
      'customer.home': renderCustomerHome,
      'customer.orders': renderCustomerOrders,
      'customer.cart': renderCustomerCart,
      'customer.account': renderAccount,
      'customer.notifications': renderNotifications,
      'driver.home': renderDriverHome,
      'driver.orders': renderDriverOrders,
      'driver.earnings': renderDriverEarnings,
      'driver.notifications': renderNotifications,
      'admin.overview': renderAdminOverview,
      'admin.orders': renderAdminOrders,
      'admin.drivers': renderAdminDrivers,
      'admin.shops': renderAdminShops,
      'admin.notifications': renderAdminNotifications
    };
    return (pages[route] || (() => `<main class="dashboard-main container"><section class="state-card state-error"><h2>المسار غير معروف</h2><p>تعريف المسار غير متاح لهذا الإصدار.</p></section></main>`))();
  }

  function removePublicAdminEntry() {
    app.querySelectorAll('.entry-admin, [data-role="admin"]').forEach((node) => node.remove());
  }

  function render() {
    if (!state.user && !state.demo) {
      app.innerHTML = renderLanding() + (state.modal ? renderModal() : '');
      removePublicAdminEntry();
      return;
    }
    if (!isRouteAllowed(state.route, currentRole())) state.route = routeForRole(currentRole());
    app.innerHTML = renderShell(routeContent(state.route));
  }

  async function navigateRoute(route) {
    if (!isRouteAllowed(route, currentRole())) {
      showToast('هذه الوجهة غير متاحة لهذا الحساب.', true);
      return;
    }
    state.route = route;
    state.modal = null;
    state.routeErrors[route] = null;
    // The page renderers are bundled in this file. Do not block navigation on optional route metadata.
    render();
    if (!state.routeReady.has(route)) {
      state.routeReady.add(route);
      void loadRoute(route).catch((error) => {
        // Route modules only validate metadata; the bundled page remains usable if one is unavailable.
        console.warn(`[Mashwer] optional route metadata unavailable for ${route}`, error);
      });
    }
    if (route.includes('notifications')) void loadNotifications();
    if (route.includes('orders') || route.endsWith('overview')) void loadOrders();
    if (route === 'admin.drivers') void loadAdminData().then(render);
  }

  async function loadAdminData() {
    if (currentRole() !== 'admin') return;
    if (isDemo()) {
      state.courierRows = [{ id: 'demo-driver-1', full_name: 'ياسر محمد', phone: '010•••8421', approved: true, available: true }, { id: 'demo-driver-2', full_name: 'كريم السيد', phone: '011•••1904', approved: false, available: false }];
      return;
    }
    try {
      const result = await client.from('profiles').select('id,full_name,phone,role,approved,available').eq('role', 'courier').order('full_name');
      if (result.error) throw result.error;
      state.courierRows = result.data || [];
    } catch (error) {
      showToast(reportError('admin data', error), true);
    }
  }

  async function editMerchant(merchantId) {
    const merchant = merchantFor(merchantId);
    if (!merchant) return;
    const value = window.prompt(`رسوم توصيل ${merchant.name} بالجنيه`, String(merchant.delivery_value));
    if (value === null) return;
    const fee = Number(value);
    if (!Number.isFinite(fee) || fee < 0) return showToast('اكتب قيمة توصيل صحيحة.', true);
    try {
      if (isDemo()) merchant.delivery_value = fee;
      else {
        const result = await client.from('merchants').update({ delivery_value: fee }).eq('id', merchant.id);
        if (result.error) throw result.error;
        merchant.delivery_value = fee;
      }
      showToast('تم تحديث رسوم التوصيل.');
      render();
    } catch (error) {
      showToast(reportError('update merchant', error), true);
    }
  }

  async function toggleDriverApproval(driverId, approved) {
    if (approved) return showToast('المندوب معتمد بالفعل.');
    try {
      if (isDemo()) {
        const courier = state.courierRows.find((row) => String(row.id) === String(driverId));
        if (courier) courier.approved = true;
      } else {
        const result = await client.from('profiles').update({ approved: true }).eq('id', driverId).eq('role', 'courier');
        if (result.error) throw result.error;
      }
      await loadAdminData();
      showToast('تم اعتماد حساب المندوب.');
      render();
    } catch (error) {
      showToast(reportError('approve driver', error), true);
    }
  }

  function enterDemo() {
    stopRealtime();
    state.demo = true;
    state.user = { id: 'demo-user', user_metadata: { full_name: 'زائر مشاوير', role: 'customer', phone: 'غير مسجل' } };
    state.profile = { id: 'demo-user', full_name: 'زائر مشاوير', role: 'customer', phone: 'غير مسجل', approved: true, available: false };
    state.route = 'customer.home';
    state.catalog.status = 'idle';
    state.orders.status = 'idle';
    state.notifications.status = 'idle';
    loadCatalog();
    loadOrders();
    loadNotifications();
    render();
  }

  async function signOut(callClient = true) {
    stopRealtime();
    if (callClient && client && !isDemo()) await client.auth.signOut();
    state.user = null;
    state.profile = null;
    state.demo = false;
    state.route = 'customer.home';
    state.cart = [];
    state.modal = null;
    state.notificationRows = [];
    state.orderRows = [];
    render();
  }

  async function submitAuth(form) {
    if (!client) return showToast('الاتصال بقاعدة البيانات غير متاح.', true);
    const data = new FormData(form);
    const mode = String(data.get('mode') || 'login');
    const phone = normalizePhone(data.get('phone'));
    const password = String(data.get('password') || '');
    state.busy = true;
    render();
    try {
      if (mode === 'login') {
        const result = await client.auth.signInWithPassword({ email: authEmail(phone), password });
        if (result.error) throw result.error;
        if (!result.data.session) throw new Error('تعذر إنشاء جلسة الدخول.');
        await openSession(result.data.session);
        state.modal = null;
        showToast('تم تسجيل الدخول.');
      } else if (mode === 'signup') {
        const role = String(data.get('role') || 'customer');
        const fullName = String(data.get('full_name') || '').trim();
        const pin = String(data.get('pin') || '');
        if (!/^\d{6}$/.test(pin)) throw new Error('PIN الاسترجاع يجب أن يكون 6 أرقام.');
        const result = await client.auth.signUp({ email: authEmail(phone), password, options: { data: { full_name: fullName, phone, role } } });
        if (result.error) throw result.error;
        if (!result.data.session) {
          state.modal = null;
          showToast('تم إنشاء الحساب. أكمل تفعيل البريد ثم سجّل الدخول.');
        } else {
          const pinResult = await client.rpc('set_pin', { pin_value: pin });
          if (pinResult.error || pinResult.data?.ok === false) throw new Error(pinResult.error?.message || pinResult.data?.error || 'تعذر حفظ PIN الاسترجاع.');
          await openSession(result.data.session);
          state.modal = null;
          showToast('تم إنشاء الحساب.');
        }
      } else {
        const pin = String(data.get('pin') || '');
        if (!/^\d{6}$/.test(pin)) throw new Error('اكتب PIN صحيحًا من 6 أرقام.');
        const result = await client.rpc('recover_password', { phone_value: phone, pin_value: pin, new_password: password });
        if (result.error) throw result.error;
        if (result.data?.ok === false) throw new Error(result.data.error || 'تعذر استرجاع الحساب.');
        state.authMode = 'login';
        showToast('تم تغيير كلمة المرور. سجّل الدخول الآن.');
      }
    } catch (error) {
      showToast(authErrorMessage(error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function submitCheckout(form) {
    if (!state.cart.length) return showToast('السلة فارغة.', true);
    const data = new FormData(form);
    state.checkout = { address: String(data.get('address') || '').trim(), phone: String(data.get('phone') || '').trim(), payment: String(data.get('payment') || 'paid_to_store'), paymentReference: String(data.get('payment_reference') || '').trim(), notes: String(data.get('notes') || '').trim() };
    if (!state.checkout.address || !state.checkout.phone) return showToast('العنوان ورقم التواصل مطلوبان.', true);
    const merchant = merchantFor(state.cart[0].merchant_id);
    state.busy = true;
    render();
    try {
      const items = state.cart.map((item) => ({ product_id: item.product_id, quantity: item.quantity }));
      if (isDemo()) {
        const subtotal = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        state.orderRows.unshift(normalizeOrder({ id: `DEMO-${Math.floor(1000 + Math.random() * 8999)}`, merchant_id: merchant.id, merchant_name: merchant.name, status: 'pending', total: subtotal + Number(merchant.delivery_value || 0), subtotal, delivery_fee: merchant.delivery_value, address: state.checkout.address, created_at: new Date().toISOString(), items }));
        state.orders.status = 'success';
      } else {
        const result = await client.rpc('create_order', { merchant_id_value: merchant.id, items_value: items, payment_method_value: state.checkout.payment, payment_reference_value: state.checkout.paymentReference || null, address_text_value: state.checkout.address, contact_phone_value: state.checkout.phone, notes_value: state.checkout.notes || null });
        if (result.error) throw result.error;
        state.orderRows.unshift(normalizeOrder(result.data));
        state.orders.status = 'success';
      }
      state.cart = [];
      state.modal = null;
      state.route = 'customer.orders';
      showToast('تم إرسال الطلب بنجاح.');
    } catch (error) {
      showToast(reportError('create order', error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function updateProfile(form) {
    const fullName = String(new FormData(form).get('full_name') || '').trim();
    if (fullName.length < 2) return showToast('اكتب الاسم بالكامل.', true);
    state.busy = true;
    render();
    try {
      if (!isDemo()) {
        const result = await client.rpc('update_profile', { full_name_value: fullName });
        if (result.error) throw result.error;
        state.profile = { ...state.profile, ...result.data };
      } else state.profile = { ...state.profile, full_name: fullName };
      showToast('تم حفظ البيانات.');
    } catch (error) {
      showToast(reportError('update profile', error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  function addToCart(productId) {
    const product = productFor(productId);
    if (!product) return showToast('الصنف غير متاح الآن.', true);
    if (state.cart.length && String(state.cart[0].merchant_id) !== String(product.merchant_id)) return showToast('السلة تدعم محلًا واحدًا في كل طلب. أفرغ السلة أولًا.', true);
    const existing = state.cart.find((item) => String(item.product_id) === String(product.id));
    if (existing) existing.quantity = Math.min(99, existing.quantity + 1);
    else state.cart.push({ product_id: product.id, merchant_id: product.merchant_id, name: product.name, category: product.category, price: product.price, quantity: 1 });
    state.selectedMerchant = product.merchant_id;
    showToast(`تمت إضافة ${product.name} إلى السلة.`);
    render();
  }

  function changeCartQuantity(productId, change) {
    const item = state.cart.find((line) => String(line.product_id) === String(productId));
    if (!item) return;
    item.quantity += Number(change);
    if (item.quantity <= 0) state.cart = state.cart.filter((line) => String(line.product_id) !== String(productId));
    render();
  }

  function adminAssignModal(order) {
    const eligible = state.courierRows.filter((courier) => courier.approved !== false);
    return `<div class="modal-head"><div><span class="section-kicker">تعيين مشوار</span><h2>#${escapeHTML(String(order.id).slice(-8))}</h2><p>${escapeHTML(order.merchant_name)}</p></div><button class="close-button" data-action="close-modal">×</button></div><div class="modal-body"><div class="field"><label for="courier-select">اختر المندوب</label><select id="courier-select" name="courier_id">${eligible.map((courier) => `<option value="${escapeHTML(courier.id)}">${escapeHTML(courier.full_name)}${courier.available ? ' · متاح' : ''}</option>`).join('')}</select></div>${eligible.length ? `<button class="primary-button full-button" data-action="admin-assign" data-order-id="${escapeHTML(order.id)}">تعيين المندوب</button>` : '<section class="state-card state-empty"><h2>لا يوجد مندوب معتمد</h2><p>اعتمد حساب مندوب أولًا ثم أعد المحاولة.</p></section>'}</div>`;
  }

  function adminAdvanceModal(order) {
    const choices = STATUS_STEPS.filter((status) => STATUS_STEPS.indexOf(status) > STATUS_STEPS.indexOf(orderStatus(order))).slice(0, 3);
    return `<div class="modal-head"><div><span class="section-kicker">تحديث حالة الطلب</span><h2>#${escapeHTML(String(order.id).slice(-8))}</h2><p>${escapeHTML(order.merchant_name)}</p></div><button class="close-button" data-action="close-modal">×</button></div><div class="modal-body"><p class="muted">الحالة الحالية: ${escapeHTML(STATUS_LABELS[orderStatus(order)])}</p><div class="choice-list">${choices.map((status) => `<button class="secondary-button full-button" data-action="advance-order" data-order-id="${escapeHTML(order.id)}" data-next-status="${status}">${escapeHTML(STATUS_LABELS[status])}</button>`).join('') || '<p class="form-note">لا توجد حالة تالية متاحة.</p>'}</div></div>`;
  }

  async function advanceOrder(orderId, nextStatus) {
    const order = state.orderRows.find((row) => String(row.id) === String(orderId));
    if (!order) return;
    state.busy = true;
    render();
    try {
      if (isDemo()) {
        order.status = nextStatus;
      } else {
        const result = await client.rpc('advance_order', { order_id_value: order.id, next_status_value: nextStatus, note_value: null, latitude_value: state.trackingLocation?.latitude || null, longitude_value: state.trackingLocation?.longitude || null });
        if (result.error) throw result.error;
        Object.assign(order, normalizeOrder(result.data));
      }
      state.trackingOrder = order;
      state.modal = null;
      showToast(`تم تحديث الطلب إلى: ${STATUS_LABELS[nextStatus]}`);
      await loadOrders();
    } catch (error) {
      showToast(reportError('advance order', error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function assignOrder(orderId, courierId) {
    if (!courierId) return showToast('اختر مندوبًا أولًا.', true);
    state.busy = true;
    render();
    try {
      if (isDemo()) {
        const order = state.orderRows.find((row) => String(row.id) === String(orderId));
        if (order) { order.courier_id = courierId; order.status = 'assigned'; }
      } else {
        const result = await client.rpc('assign_order', { order_id_value: orderId, courier_id_value: courierId });
        if (result.error) throw result.error;
      }
      state.modal = null;
      showToast('تم تعيين المندوب.');
      await loadOrders();
    } catch (error) {
      showToast(reportError('assign order', error), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function cancelOrder(orderId) {
    if (!window.confirm('هل تريد إلغاء هذا الطلب؟')) return;
    await advanceOrder(orderId, 'cancelled');
  }

  async function toggleAvailability() {
    const next = state.profile?.available !== true;
    try {
      if (isDemo()) state.profile = { ...state.profile, available: next };
      else {
        const result = await client.rpc('set_driver_availability', { available_value: next });
        if (result.error) throw result.error;
        state.profile = { ...state.profile, ...result.data };
      }
      showToast(next ? 'أصبحت متاحًا لاستقبال المشاوير.' : 'تم إيقاف استقبال المشاوير.');
      render();
      await loadOrders();
    } catch (error) {
      showToast(reportError('availability', error), true);
    }
  }

  async function markNotificationsRead() {
    try {
      if (isDemo()) state.notificationRows.forEach((notice) => { notice.read_at = notice.read_at || new Date().toISOString(); });
      else {
        const result = await client.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', state.user.id).is('read_at', null);
        if (result.error) throw result.error;
        await loadNotifications();
      }
      showToast('تم تعليم الإشعارات كمقروءة.');
      render();
    } catch (error) {
      showToast(reportError('read notifications', error), true);
    }
  }

  async function requestLocation() {
    if (!navigator.geolocation) return showToast('الموقع غير مدعوم على هذا الجهاز.', true);
    navigator.geolocation.getCurrentPosition((position) => {
      state.trackingLocation = { latitude: position.coords.latitude, longitude: position.coords.longitude };
      showToast('تم تحديث موقعك الحالي.');
      render();
    }, () => showToast('لم نتمكن من قراءة موقعك. اسمح بالوصول للموقع ثم حاول.', true), { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }

  function openOrder(orderId, modal) {
    const order = state.orderRows.find((row) => String(row.id) === String(orderId));
    if (!order) return showToast('الطلب غير موجود في البيانات الحالية.', true);
    state.trackingOrder = order;
    state.modal = modal;
    render();
  }

  async function handleClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'backdrop' && event.target !== target) return;
    event.preventDefault();
    if (action === 'open-auth') { state.modal = 'auth'; state.authMode = target.dataset.mode || 'login'; state.authRole = target.dataset.role || 'customer'; render(); return; }
    if (action === 'skip-intro') { finishIntro(); return; }
    if (action === 'enter-demo') { enterDemo(); return; }
    if (action === 'close-modal' || action === 'backdrop') { state.modal = null; render(); return; }
    if (action === 'auth-mode') { state.authMode = target.dataset.mode || 'login'; if (state.authMode === 'signup' && state.authRole === 'admin') state.authRole = 'customer'; render(); return; }
    if (action === 'auth-role') { state.authRole = target.dataset.role || 'customer'; render(); return; }
    if (action === 'navigate-route') { await navigateRoute(target.dataset.route); return; }
    if (action === 'go-home') { await navigateRoute(routeForRole(currentRole())); return; }
    if (action === 'set-category') { state.category = target.dataset.category || 'الكل'; state.selectedMerchant = null; render(); return; }
    if (action === 'select-merchant') { state.selectedMerchant = target.dataset.merchantId; state.category = merchantFor(state.selectedMerchant)?.category || 'الكل'; window.scrollTo({ top: document.body.scrollHeight / 3, behavior: 'smooth' }); render(); return; }
    if (action === 'add-to-cart') { addToCart(target.dataset.productId); return; }
    if (action === 'cart-quantity') { changeCartQuantity(target.dataset.productId, Number(target.dataset.change || 0)); return; }
    if (action === 'orders-filter') { state.ordersFilter = target.dataset.filter || 'all'; render(); return; }
    if (action === 'track-order') { openOrder(target.dataset.orderId, 'tracking'); return; }
    if (action === 'open-driver-order') { openOrder(target.dataset.orderId, 'driver-order'); return; }
    if (action === 'open-admin-order') { openOrder(target.dataset.orderId, 'admin-order'); return; }
    if (action === 'cancel-order') { await cancelOrder(target.dataset.orderId); return; }
    if (action === 'advance-order') { await advanceOrder(target.dataset.orderId, target.dataset.nextStatus); return; }
    if (action === 'admin-order-action') { if (state.trackingOrder && ['pending', 'confirmed', 'searching_driver'].includes(orderStatus(state.trackingOrder))) { await loadAdminData(); state.modal = 'admin-assign'; } else state.modal = 'admin-advance'; render(); return; }
    if (action === 'admin-assign') { await assignOrder(target.dataset.orderId, document.getElementById('courier-select')?.value); return; }
    if (action === 'toggle-availability') { await toggleAvailability(); return; }
    if (action === 'mark-notifications-read') { await markNotificationsRead(); return; }
    if (action === 'refresh-orders' || action === 'retry-data') { await loadOrders(); return; }
    if (action === 'load-catalog') { await loadCatalog(); return; }
    if (action === 'load-admin-data') { await loadAdminData(); render(); return; }
    if (action === 'edit-merchant') { await editMerchant(target.dataset.merchantId); return; }
    if (action === 'toggle-driver-approval') { await toggleDriverApproval(target.dataset.driverId, target.dataset.approved === 'true'); return; }
    if (action === 'retry-route') { state.routeReady.delete(target.dataset.route); await navigateRoute(target.dataset.route); return; }
    if (action === 'logout') { await signOut(); return; }
    if (action === 'request-location') { requestLocation(); return; }
  }

  function handleInput(event) {
    const input = event.target;
    if (input.dataset.input === 'catalog-search') state.search = input.value;
  }

  function handleChange(event) {
    if (event.target.name === 'payment') {
      state.checkout.payment = event.target.value;
      render();
    }
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (form.id === 'auth-form') { event.preventDefault(); await submitAuth(form); return; }
    if (form.id === 'checkout-form') { event.preventDefault(); await submitCheckout(form); return; }
    if (form.id === 'profile-form') { event.preventDefault(); await updateProfile(form); }
  }

  document.addEventListener('click', handleClick);
  document.addEventListener('input', handleInput);
  document.addEventListener('change', handleChange);
  document.addEventListener('submit', handleSubmit);
  window.addEventListener('online', () => { state.offline = false; showToast('عاد الاتصال بالإنترنت.'); render(); });
  window.addEventListener('offline', () => { state.offline = true; showToast('انقطع الاتصال.'); render(); });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && state.modal) { state.modal = null; render(); } });

  startIntro();
  bootstrap();
})();
