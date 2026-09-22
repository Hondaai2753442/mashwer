(() => {
  'use strict';

  const cfg = window.MASHAWER_CONFIG || {};
  const hasSupabase = Boolean(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && cfg.SUPABASE_ANON_KEY.length > 30);
  const client = hasSupabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  const app = document.getElementById('app');
  const toastNode = document.getElementById('toast');

  const categories = ['الكل', 'مطاعم', 'بقالة', 'صيدلية', 'طرود'];
  let merchants = [
    { id: 'm1', name: 'مطعم البيت الشامي', category: 'مطاعم', description: 'أكل بيتي وسندوتشات طازة', eta: '25 - 35 دقيقة', fee: 18, color: 'linear-gradient(135deg,#e76f39,#9e3b31)', symbol: '🍲' },
    { id: 'm2', name: 'سوبر ماركت البركة', category: 'بقالة', description: 'كل احتياجات البيت في مكان واحد', eta: '35 - 45 دقيقة', fee: 22, color: 'linear-gradient(135deg,#2d8a70,#1c5360)', symbol: '🛒' },
    { id: 'm3', name: 'صيدلية الحياة', category: 'صيدلية', description: 'طلبك الصحي يوصلك بأمان', eta: '20 - 30 دقيقة', fee: 15, color: 'linear-gradient(135deg,#3e8bc4,#3565a5)', symbol: '✚' }
  ];
  let products = [
    { id: 'p1', merchant_id: 'm1', name: 'وجبة مشاوي مشكلة', description: 'تكفي شخصين مع الأرز والسلطة', price: 185, emoji: '🍗', category: 'مطاعم' },
    { id: 'p2', merchant_id: 'm1', name: 'كشري مشاوير', description: 'خلطة البيت الحارة', price: 65, emoji: '🥘', category: 'مطاعم' },
    { id: 'p3', merchant_id: 'm1', name: 'ساندوتش شاورما', description: 'عيش طازج وصوص خاص', price: 75, emoji: '🌯', category: 'مطاعم' },
    { id: 'p4', merchant_id: 'm2', name: 'سلة خضار اليوم', description: 'اختيار طازج من السوق', price: 120, emoji: '🥬', category: 'بقالة' },
    { id: 'p5', merchant_id: 'm2', name: 'مياه معدنية', description: 'كرتونة 12 زجاجة', price: 95, emoji: '💧', category: 'بقالة' },
    { id: 'p6', merchant_id: 'm2', name: 'مستلزمات منزلية', description: 'منتجات يومية مختارة', price: 80, emoji: '🧺', category: 'بقالة' },
    { id: 'p7', merchant_id: 'm3', name: 'فيتامينات يومية', description: 'بعد مراجعة الوصفة عند الحاجة', price: 160, emoji: '💊', category: 'صيدلية' },
    { id: 'p8', merchant_id: 'm3', name: 'مستلزمات إسعاف', description: 'حقيبة صغيرة للبيت', price: 210, emoji: '🩹', category: 'صيدلية' }
  ];
  const demoOrders = [
    { id: 'MW-1042', merchant: 'مطعم البيت الشامي', customer: 'أحمد حسن', status: 'progress', statusText: 'مع المندوب', total: 238, address: 'شارع المدرسة القديمة', payment: 'دفعت للمحل', created_at: 'منذ 12 دقيقة' },
    { id: 'MW-1038', merchant: 'سوبر ماركت البركة', customer: 'سارة محمود', status: 'success', statusText: 'تم التسليم', total: 164, address: 'منطقة السوق', payment: 'Vodafone Cash', created_at: 'أمس' },
    { id: 'MW-1031', merchant: 'صيدلية الحياة', customer: 'محمود علي', status: 'new', statusText: 'جديد', total: 175, address: 'خلف الوحدة الصحية', payment: 'InstaPay', created_at: 'أمس' }
  ];
  const demoCouriers = [
    { name: 'ياسر محمد', phone: '010•••8421', status: 'نشط', approved: true, orders: 24, earnings: 1860 },
    { name: 'كريم السيد', phone: '011•••1904', status: 'بانتظار الموافقة', approved: false, orders: 0, earnings: 0 },
    { name: 'مصطفى عادل', phone: '012•••7338', status: 'غير متصل', approved: true, orders: 17, earnings: 1290 }
  ];

  const state = {
    user: null,
    profile: null,
    view: 'customer',
    authMode: 'login',
    authRole: 'customer',
    modal: null,
    selectedCategory: 'الكل',
    selectedMerchant: null,
    cart: [],
    orders: [...demoOrders],
    couriers: [...demoCouriers],
    liveChannel: null,
    courierOnline: true,
    adminTab: 'overview',
    location: null,
    busy: false
  };

  const money = (value) => `${Number(value || 0).toLocaleString('ar-EG')} ج.م`;
  const escapeHTML = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
  const initials = (value) => String(value || 'م').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('') || 'م';
  const roleName = (role) => ({ admin: 'الإدارة', courier: 'المندوب', customer: 'المستخدم' }[role] || 'المستخدم');
  const loginRoles = ['customer', 'courier', 'admin'];
  const normalizePhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('20')) return `+${digits}`;
    if (digits.startsWith('0')) return `+20${digits.slice(1)}`;
    return `+${digits}`;
  };
  const authEmail = (phone) => `${normalizePhone(phone).replace('+', '')}@mashwer.local`;
  const authErrorMessage = (error) => {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('invalid login credentials')) return 'رقم الهاتف أو كلمة المرور غير صحيحة.';
    if (message.includes('email not confirmed')) return 'الحساب لم يتم تفعيله بعد. أعد إنشاء الحساب أو تواصل مع الإدارة.';
    if (message.includes('already registered') || message.includes('already been registered')) return 'هذا الرقم مسجل بالفعل. استخدم تسجيل الدخول.';
    if (message.includes('rate limit') || message.includes('email rate limit')) return 'تم تجاوز حد التسجيل مؤقتًا. انتظر قليلًا ثم حاول مرة أخرى.';
    if (message.includes('password') && message.includes('6')) return 'كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل.';
    return error?.message || 'حدث خطأ في المصادقة. حاول مرة أخرى.';
  };
  const currentRole = () => state.profile?.role || state.user?.user_metadata?.role || 'customer';
  const isDemo = () => Boolean(state.user?.demo);
  const productFor = (id) => products.find((product) => product.id === id);
  const merchantFor = (id) => merchants.find((merchant) => merchant.id === id);
  const selectedMerchant = () => state.selectedMerchant ? merchantFor(state.selectedMerchant) : null;
  const cartSubtotal = () => state.cart.reduce((sum, line) => sum + (line.price * line.quantity), 0);
  const cartFee = () => selectedMerchant()?.fee || 18;
  const cartTotal = () => cartSubtotal() + (state.cart.length ? cartFee() : 0);

  function showToast(message) {
    toastNode.textContent = message;
    toastNode.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toastNode.classList.remove('show'), 3200);
  }

  function statusClass(status) {
    return ({ جديد: 'new', 'جاري التنفيذ': 'progress', 'مع المندوب': 'progress', 'تم التسليم': 'success', ملغي: 'danger' }[status] || 'neutral');
  }

  function statusBadge(text) {
    return `<span class="status ${statusClass(text)}">${escapeHTML(text)}</span>`;
  }

  function brand() {
    return `<a class="brand" href="#" data-action="go-home"><img class="brand-mark" src="icon.svg" alt="" /><span>مشاوير<small>توصيل أسرع من باب لباب</small></span></a>`;
  }

  function render() {
    if (!state.user) app.innerHTML = landingView();
    else if (currentRole() === 'customer') app.innerHTML = customerView();
    else app.innerHTML = dashboardView();
    if (state.modal) app.insertAdjacentHTML('beforeend', modalView());
    if (state.user?.demo) app.insertAdjacentHTML('beforeend', demoRibbon());
  }

  function landingView() {
    return `<div class="app-shell">
      <header class="topbar container">${brand()}<div class="nav-actions"><button class="ghost-button" data-action="open-auth" data-mode="login" data-role="customer">دخول مستخدم</button><button class="ghost-button" data-action="open-auth" data-mode="login" data-role="courier">دخول مندوب</button><button class="ghost-button" data-action="open-auth" data-mode="login" data-role="admin">دخول مدير</button><button class="primary-button" data-action="open-auth" data-mode="signup" data-role="customer">إنشاء حساب</button></div></header>
      <main>
        <section class="hero-wrap container"><div class="hero"><div class="hero-copy"><div class="eyebrow">كل طلبات القرية في مشوار واحد</div><h1>اللي تحتاجه،<br />يوصلك أسرع.</h1><p>مطاعم، بقالة، صيدلية وطرود من محلات قريتك إلى بابك، مع متابعة واضحة من أول الطلب حتى التسليم.</p><button class="primary-button hero-cta" data-action="open-auth" data-mode="signup">ابدأ مشوارك <span>←</span></button></div><div class="hero-orbit"><div class="speed-lines"></div><div class="scooter">🛵</div></div></div></section>
        <section class="section container"><div class="promo-strip"><div><strong>مشوارك في أمان</strong><span>ادفع للمحل، أو استخدم Vodafone Cash وInstaPay بالطريقة التي تناسبك.</span></div><div class="promo-badge">✦</div></div></section>
        <section class="section container"><div class="section-heading"><div><h2>اختار من محلات قريتك</h2><p>كل مكان قريب، وكل طلب له متابعة.</p></div><button class="link-button" data-action="open-auth" data-mode="signup">شاهد الكل ←</button></div><div class="merchant-grid">${merchants.map(merchantCard).join('')}</div></section>
      </main>
      <footer class="site-footer"><div class="container footer-inner"><span class="footer-brand">مشاوير</span><span>خدمة توصيل محلية قابلة للتوسع لكل القرى</span></div></footer>
    </div>`;
  }

  function merchantCard(merchant) {
    return `<article class="merchant-card" data-action="choose-merchant" data-merchant="${merchant.id}"><div class="merchant-cover" style="background:${merchant.color}"><strong>${escapeHTML(merchant.name)}</strong><span>${escapeHTML(merchant.description)}</span><div class="merchant-symbol">${merchant.symbol}</div></div><div class="merchant-body"><div class="merchant-title"><h3>${escapeHTML(merchant.name)}</h3><span class="rating">★ 4.8</span></div><div class="meta-row"><span>توصيل ${merchant.eta}</span><span>${money(merchant.fee)}</span></div></div></article>`;
  }

  function customerView() {
    const name = state.profile?.full_name || state.user?.user_metadata?.full_name || 'يا صديقي';
    const filtered = products.filter((product) => (state.selectedCategory === 'الكل' || product.category === state.selectedCategory) && (!state.selectedMerchant || product.merchant_id === state.selectedMerchant));
    return `<div class="app-shell"><header class="topbar container">${brand()}<div class="nav-actions"><button class="icon-button" data-action="open-orders" title="طلباتي">◷</button><button class="icon-button" data-action="open-cart" title="السلة">🛒<sup>${state.cart.reduce((s, item) => s + item.quantity, 0) || ''}</sup></button><button class="avatar" data-action="logout" title="تسجيل الخروج">${escapeHTML(initials(name))}</button></div></header>
      <main>
        <section class="hero-wrap container"><div class="hero"><div class="hero-copy"><div class="eyebrow">أهلاً ${escapeHTML(name.split(' ')[0])}، جاهز للمشوار؟</div><h1>اطلبها.<br />واحنا نوصلها.</h1><p>اختار من محلات قريتك، اكتب عنوانك، وخلي الباقي علينا.</p><button class="primary-button hero-cta" data-action="scroll-products">ابدأ الطلب <span>←</span></button></div><div class="hero-orbit"><div class="speed-lines"></div><div class="scooter">🛵</div></div></div></section>
        <section class="section container"><div class="section-heading"><div><h2>تسوق حسب احتياجك</h2><p>كل ما تحتاجه، قريب منك.</p></div></div><div class="chips">${categories.map((category) => `<button class="chip ${state.selectedCategory === category ? 'active' : ''}" data-action="category" data-category="${category}">${category}</button>`).join('')}</div></section>
        <section class="section container"><div class="section-heading"><div><h2>${state.selectedMerchant ? escapeHTML(selectedMerchant().name) : 'محلات مميزة'}</h2><p>${state.selectedMerchant ? 'اختر اللي نفسك فيه واضفه للسلة.' : 'أماكن موثوقة، ووقت توصيل واضح.'}</p></div>${state.selectedMerchant ? '<button class="link-button" data-action="clear-merchant">كل المحلات ←</button>' : ''}</div><div class="merchant-grid">${merchants.filter((m) => state.selectedCategory === 'الكل' || m.category === state.selectedCategory).map(merchantCard).join('')}</div></section>
        <section id="products" class="section container"><div class="section-heading"><div><h2>اختيارات اليوم</h2><p>${state.cart.length ? `في السلة ${state.cart.length} أصناف جاهزة للمراجعة.` : 'اضغط + لإضافة أي صنف إلى السلة.'}</p></div><button class="link-button" data-action="open-cart">السلة (${state.cart.reduce((s, item) => s + item.quantity, 0)}) ←</button></div><div class="product-grid">${filtered.map(productCard).join('') || '<div class="empty-state">لا توجد أصناف في هذا القسم بعد.</div>'}</div></section>
        ${ordersSection()}
      </main><footer class="site-footer"><div class="container footer-inner"><span class="footer-brand">مشاوير</span><span>طلبك تحت المتابعة حتى بابك</span><button class="link-button" data-action="logout">خروج</button></div></footer>
    </div>`;
  }

  function productCard(product) {
    return `<article class="product-card"><div class="product-thumb">${product.emoji}</div><h3>${escapeHTML(product.name)}</h3><p>${escapeHTML(product.description)}</p><div class="product-footer"><span class="price">${money(product.price)}</span><button class="add-button" data-action="add-cart" data-product="${product.id}" aria-label="إضافة">+</button></div></article>`;
  }

  function ordersSection() {
    const orders = state.orders.slice(0, 3);
    return `<section id="orders" class="section container"><div class="section-heading"><div><h2>آخر طلباتك</h2><p>تقدر تتابع كل مشوار من هنا.</p></div><button class="link-button" data-action="show-notice" data-message="صفحة سجل الطلبات الكاملة ستكون متاحة في الإصدار التالي.">كل الطلبات ←</button></div><div class="dashboard-card">${orders.length ? orders.map((order) => `<div class="courier-order"><div class="order-main"><strong>${escapeHTML(order.merchant || 'طلب مشاوير')}</strong><span>${escapeHTML(order.address || 'العنوان غير محدد')} · ${escapeHTML(order.created_at || 'الآن')}</span></div><div class="order-actions">${statusBadge(order.statusText || order.status || 'جديد')}<strong>${money(order.total)}</strong></div></div>`).join('') : '<div class="empty-state">لم تطلب شيئًا بعد. أول مشوار مستنيك.</div>'}</div></section>`;
  }

  function dashboardView() {
    return `<div class="dashboard-layout"><aside class="side-panel">${brand()}<nav class="side-nav">${dashboardNav()}</nav><div class="side-footer">مشاوير<br />لوحة ${roleName(currentRole())}<br /><span>الإصدار 1.0</span></div></aside><main class="dashboard-main">${dashboardTop()}${currentRole() === 'admin' ? adminView() : courierView()}</main><nav class="mobile-nav">${dashboardNav(true)}</nav></div>`;
  }

  function dashboardNav(mobile = false) {
    const items = currentRole() === 'admin' ? [['overview', '⌂', 'نظرة عامة'], ['orders', '▣', 'الطلبات'], ['couriers', '♙', 'المندوبون'], ['shops', '⌁', 'المحلات']] : [['overview', '⌂', 'الرئيسية'], ['orders', '▣', 'طلباتي'], ['earnings', '◈', 'أرباحي']];
    return items.map(([id, icon, label]) => `<button class="${(state.adminTab === id || (!state.adminTab && id === 'overview')) ? 'active' : ''}" data-action="dashboard-tab" data-tab="${id}"><b>${icon}</b>${mobile ? `<span>${label}</span>` : label}</button>`).join('') + `<button data-action="logout"><b>↪</b>${mobile ? '<span>خروج</span>' : 'تسجيل الخروج'}</button>`;
  }

  function dashboardTop() {
    const name = state.profile?.full_name || state.user?.user_metadata?.full_name || roleName(currentRole());
    return `<div class="dashboard-top"><div><h1>${currentRole() === 'admin' ? 'صباح الخير، مدير مشاوير' : `أهلاً ${escapeHTML(name.split(' ')[0])}`}</h1><p>${currentRole() === 'admin' ? 'تابع الحركة، الطلبات والمندوبين من مكان واحد.' : 'خليك متابع، وكل مشوار له حسابه.'}</p></div><div class="button-row"><button class="icon-button" data-action="show-notice" data-message="لا توجد إشعارات جديدة.">♧</button><button class="avatar" data-action="logout">${escapeHTML(initials(name))}</button></div></div>`;
  }

  function adminView() {
    const courierList = isDemo() ? demoCouriers : state.couriers;
    const counts = { all: state.orders.length, new: state.orders.filter((o) => o.statusText === 'جديد').length, couriers: courierList.length, revenue: state.orders.reduce((sum, order) => sum + Number(order.delivery_fee || 0), 0) };
    return `<section class="stats-grid"><div class="stat-card"><span class="stat-label">طلبات اليوم</span><strong>${counts.all}</strong><span class="stat-note">+12% عن أمس</span></div><div class="stat-card"><span class="stat-label">تحتاج متابعة</span><strong>${counts.new}</strong><span class="stat-note">طلبات جديدة</span></div><div class="stat-card"><span class="stat-label">المندوبون</span><strong>${counts.couriers}</strong><span class="stat-note">${demoCouriers.filter((c) => c.approved).length} موافق عليهم</span></div><div class="stat-card"><span class="stat-label">إجمالي التوصيل</span><strong>${money(counts.revenue)}</strong><span class="stat-note">هذا الشهر</span></div></section>${state.adminTab === 'overview' || state.adminTab === 'orders' ? adminOrders() : state.adminTab === 'couriers' ? adminCouriers() : adminShops()}`;
  }

  function adminOrders() {
    const rows = (isDemo() ? state.orders : state.orders).slice(0, 10);
    return `<section class="dashboard-card"><div class="card-heading"><div><h2>حركة الطلبات</h2><span>كل الطلبات في مكان واحد</span></div><button class="primary-button small-button" data-action="show-notice" data-message="إضافة طلب يدوي متاحة من لوحة الطلبات القادمة.">+ طلب جديد</button></div>${rows.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>رقم الطلب</th><th>العميل</th><th>المحل</th><th>الحالة</th><th>الإجمالي</th><th></th></tr></thead><tbody>${rows.map((order, index) => `<tr><td><strong>${escapeHTML(order.id || `MW-${1040 - index}`)}</strong></td><td>${escapeHTML(order.customer || 'عميل مشاوير')}</td><td>${escapeHTML(order.merchant || 'متجر')}</td><td>${statusBadge(order.statusText || 'جديد')}</td><td>${money(order.total)}</td><td><button class="ghost-button small-button" data-action="advance-order" data-order-id="${escapeHTML(order.id || '')}">تحديث</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">لا توجد طلبات حتى الآن.</div>'}</section>`;
  }

  function adminCouriers() {
    const couriers = isDemo() ? demoCouriers : state.couriers;
    return `<section class="dashboard-card"><div class="card-heading"><div><h2>المندوبون</h2><span>الموافقة والمتابعة والأرباح الخاصة بكل مندوب</span></div><button class="primary-button small-button" data-action="show-notice" data-message="يمكن فتح التسجيل العام للمندوبين من الإعدادات.">دعوة مندوب</button></div>${couriers.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>المندوب</th><th>الهاتف</th><th>الحالة</th><th>الطلبات</th><th>الأرباح</th><th></th></tr></thead><tbody>${couriers.map((courier) => `<tr><td><strong>${escapeHTML(courier.full_name || courier.name || 'مندوب')}</strong></td><td>${escapeHTML(courier.phone || '')}</td><td>${courier.approved === false ? '<span class="status new">بانتظار الموافقة</span>' : statusBadge(courier.status || 'نشط')}</td><td>${courier.orders || 0}</td><td>${money(courier.earnings || 0)}</td><td><button class="ghost-button small-button" data-action="approve-courier" data-courier-id="${escapeHTML(courier.id || '')}" data-courier="${escapeHTML(courier.full_name || courier.name || 'مندوب')}">${courier.approved === false ? 'موافقة' : 'الملف'}</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">لا يوجد مندوبون مسجلون بعد.</div>'}</section>`;
  }

  function adminShops() {
    return `<section class="dashboard-card"><div class="card-heading"><div><h2>المحلات والرسوم</h2><span>أضف المحلات، الأقسام، ومنطقة التوصيل</span></div><button class="primary-button small-button" data-action="show-notice" data-message="نموذج إضافة محل جديد جاهز للربط بقاعدة البيانات.">+ إضافة محل</button></div><div class="merchant-grid">${merchants.map((merchant) => `<div class="merchant-card"><div class="merchant-cover" style="background:${merchant.color}"><strong>${escapeHTML(merchant.name)}</strong><span>${escapeHTML(merchant.category)}</span><div class="merchant-symbol">${merchant.symbol}</div></div><div class="merchant-body"><div class="merchant-title"><h3>${money(merchant.fee)}</h3><span class="status success">نشط</span></div><div class="meta-row"><span>رسوم التوصيل الحالية</span><button class="link-button" data-action="show-notice" data-message="تعديل الرسوم سيكون حسب المنطقة أو النسبة.">تعديل</button></div></div></div>`).join('')}</div></section>`;
  }

  function courierView() {
    const approved = state.profile?.approved !== false;
    if (!approved && !isDemo()) return `<section class="dashboard-card"><div class="empty-state"><div style="font-size:42px;margin-bottom:10px">🛵</div><h2>حسابك قيد المراجعة</h2><p>سيظهر لك الطلب بمجرد موافقة الإدارة على حساب المندوب.</p></div></section>`;
    const assigned = state.orders.slice(0, 3);
    const earnings = assigned.reduce((sum, order) => sum + Number(order.delivery_fee || 0), 0);
    return `<section class="stats-grid"><div class="stat-card"><span class="stat-label">طلبات اليوم</span><strong>${assigned.length}</strong><span class="stat-note">طلبات مسندة إليك</span></div><div class="stat-card"><span class="stat-label">أرباحي الحالية</span><strong>${money(earnings)}</strong><span class="stat-note">من رسوم التوصيل</span></div><div class="stat-card"><span class="stat-label">إجمالي الطلبات</span><strong>${state.orders.length}</strong><span class="stat-note">الطلبات الخاصة بك</span></div><div class="stat-card"><span class="stat-label">الحالة الآن</span><strong style="font-size:20px">${state.courierOnline ? 'متاح' : 'غير متاح'}</strong><span class="stat-note">${state.courierOnline ? 'تستقبل طلبات' : 'لن تستقبل طلبات'}</span></div></section><section class="dashboard-card"><div class="card-heading"><div><h2>حالة المندوب</h2><span>فعّل ظهورك لاستقبال مشاوير جديدة</span></div><button class="toggle ${state.courierOnline ? 'on' : ''}" data-action="toggle-online"><i></i></button></div><div class="notice">نصيحة: حدّث حالة الطلب فور الاستلام والتسليم حتى يطمئن العميل.</div></section><section class="dashboard-card"><div class="card-heading"><div><h2>المشاوير الحالية</h2><span>الطلبات الخاصة بك فقط</span></div><span>${assigned.length} طلب</span></div>${assigned.length ? assigned.map((order) => `<div class="courier-order"><div class="order-main"><strong>${escapeHTML(order.merchant || 'طلب مشاوير')}</strong><span>${escapeHTML(order.address || 'العنوان')} · ${escapeHTML(order.customer || 'عميل')}</span></div><div class="order-actions">${statusBadge(order.statusText || 'جديد')}<button class="primary-button small-button" data-action="advance-order" data-order-id="${escapeHTML(order.id || '')}">تحديث الحالة</button></div></div>`).join('') : '<div class="empty-state">لا توجد طلبات مسندة إليك.</div>'}</section>`;
  }

  function demoRibbon() {
    return `<div class="demo-ribbon">وضع التجربة · <button data-action="switch-demo" data-view="customer">مستخدم</button> · <button data-action="switch-demo" data-view="courier">مندوب</button> · <button data-action="switch-demo" data-view="admin">إدارة</button></div>`;
  }

  function modalView() {
    return `<div class="modal-backdrop" data-action="backdrop"><section class="modal ${state.modal === 'cart' ? 'modal-wide' : ''}" role="dialog" aria-modal="true">${state.modal === 'auth' ? authModal() : cartModal()}</section></div>`;
  }

  function authModalLegacy() {
    const mode = state.authMode;
    const title = mode === 'signup' ? 'ابدأ أول مشوار' : mode === 'forgot' ? 'استرجاع كلمة المرور' : 'أهلاً بك في مشاوير';
    const subtitle = mode === 'signup' ? 'حسابك يفتح في دقيقة، وبدون رسائل أو أكواد.' : mode === 'forgot' ? 'استخدم رقم الهاتف وPIN الاسترجاع الذي اخترته عند التسجيل.' : 'سجل دخولك وتابع طلبك حتى بابك.';
    return `<div class="modal-head"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="close-button" data-action="close-modal">×</button></div><div class="modal-body">${mode !== 'forgot' ? `<div class="auth-tabs"><button class="${mode === 'login' ? 'active' : ''}" data-action="auth-mode" data-mode="login">تسجيل الدخول</button><button class="${mode === 'signup' ? 'active' : ''}" data-action="auth-mode" data-mode="signup">حساب جديد</button></div>` : ''}<form id="auth-form" class="form-grid"><input type="hidden" name="mode" value="${mode}" />${mode === 'signup' ? `<div class="field"><label>الاسم بالكامل</label><input name="full_name" required autocomplete="name" placeholder="مثال: أحمد محمد" /></div>` : ''}<div class="field"><label>رقم الهاتف</label><input name="phone" required inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" /></div>${mode !== 'forgot' ? `<div class="field"><label>كلمة المرور</label><div class="password-row"><input name="password" type="password" required minlength="6" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" placeholder="6 أحرف أو أكثر" /><button type="button" class="password-toggle" data-action="toggle-password">◉</button></div></div>` : `<div class="field"><label>PIN الاسترجاع</label><input name="pin" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6 أرقام" /></div><div class="field"><label>كلمة المرور الجديدة</label><input name="password" type="password" required minlength="6" autocomplete="new-password" placeholder="كلمة مرور جديدة" /></div>`}${mode === 'signup' ? `<div class="field"><label>PIN الاسترجاع</label><input name="pin" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6 أرقام لا يعرفها أحد غيرك" /></div><div class="form-note">الـPIN ليس كودًا يُرسل إليك؛ هو مفتاح استرجاع تختاره وتحفظه لنفسك. لا تشاركه مع أي شخص.</div>` : ''}<button class="primary-button" type="submit">${mode === 'signup' ? 'إنشاء الحساب' : mode === 'forgot' ? 'تغيير كلمة المرور' : 'دخول آمن'}</button>${mode === 'login' ? '<button type="button" class="link-button" data-action="auth-mode" data-mode="forgot">نسيت كلمة المرور؟ استخدم PIN الاسترجاع</button>' : mode === 'forgot' ? '<button type="button" class="link-button" data-action="auth-mode" data-mode="login">العودة لتسجيل الدخول</button>' : ''}<div class="form-note">للتجربة الآن: يمكنك استعراض واجهات المستخدم والمندوب والإدارة من زر التجربة أسفل الصفحة.</div></form></div>`;
  }

  function authModal() {
    const mode = state.authMode;
    const roleLabel = roleName(state.authRole);
    const title = mode === 'signup' ? (state.authRole === 'courier' ? 'انضم كمندوب' : 'ابدأ أول مشوار') : mode === 'forgot' ? 'استرجاع كلمة المرور' : `دخول ${roleLabel}`;
    const subtitle = mode === 'signup' ? (state.authRole === 'courier' ? 'سجّل بياناتك للانضمام إلى فريق المندوبين.' : 'حسابك يفتح في دقيقة، وبدون رسائل أو أكواد.') : mode === 'forgot' ? 'استخدم رقم الهاتف وPIN الاسترجاع الذي اخترته عند التسجيل.' : `سجّل دخولك إلى واجهة ${roleLabel}.`;
    const roleTabs = mode === 'login' ? `<div class="role-tabs">${loginRoles.map((role) => `<button class="${state.authRole === role ? 'active' : ''}" data-action="auth-role" data-role="${role}">${roleName(role)}</button>`).join('')}</div>` : '';
    const courierNote = mode === 'signup' && state.authRole === 'courier' ? '<div class="form-note">حساب المندوب يبدأ بانتظار موافقة الإدارة قبل استقبال الطلبات.</div>' : '';
    return `<div class="modal-head"><div><h2>${title}</h2><p>${subtitle}</p></div><button class="close-button" data-action="close-modal">×</button></div><div class="modal-body">${mode !== 'forgot' ? `<div class="auth-tabs"><button class="${mode === 'login' ? 'active' : ''}" data-action="auth-mode" data-mode="login">تسجيل الدخول</button><button class="${mode === 'signup' ? 'active' : ''}" data-action="auth-mode" data-mode="signup">حساب جديد</button></div>` : ''}${roleTabs}<form id="auth-form" class="form-grid"><input type="hidden" name="mode" value="${mode}" /><input type="hidden" name="role" value="${state.authRole}" />${mode === 'signup' ? `<div class="field"><label>الاسم بالكامل</label><input name="full_name" required autocomplete="name" placeholder="مثال: أحمد محمد" /></div>` : ''}<div class="field"><label>رقم الهاتف</label><input name="phone" required inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" /></div>${mode !== 'forgot' ? `<div class="field"><label>كلمة المرور</label><div class="password-row"><input name="password" type="password" required minlength="6" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" placeholder="6 أحرف أو أكثر" /><button type="button" class="password-toggle" data-action="toggle-password">◉</button></div></div>` : `<div class="field"><label>PIN الاسترجاع</label><input name="pin" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6 أرقام" /></div><div class="field"><label>كلمة المرور الجديدة</label><input name="password" type="password" required minlength="6" autocomplete="new-password" placeholder="كلمة مرور جديدة" /></div>`}${mode === 'signup' ? `<div class="field"><label>PIN الاسترجاع</label><input name="pin" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="6 أرقام لا يعرفها أحد غيرك" /></div><div class="form-note">الـPIN ليس كودًا يُرسل إليك؛ هو مفتاح استرجاع تختاره وتحفظه لنفسك. لا تشاركه مع أي شخص.</div>${courierNote}` : ''}<button class="primary-button" type="submit">${mode === 'signup' ? (state.authRole === 'courier' ? 'إنشاء حساب مندوب' : 'إنشاء الحساب') : mode === 'forgot' ? 'تغيير كلمة المرور' : 'تسجيل الدخول'}</button></form>${mode !== 'forgot' ? `<button class="link-button auth-forgot" data-action="auth-mode" data-mode="forgot">نسيت كلمة المرور؟</button>` : `<button class="link-button auth-forgot" data-action="auth-mode" data-mode="login">العودة لتسجيل الدخول</button>`}</div>`;
  }

  function cartModal() {
    const subtotal = cartSubtotal();
    return `<div class="modal-head"><div><h2>راجع مشوارك</h2><p>${selectedMerchant() ? escapeHTML(selectedMerchant().name) : 'أضف أصنافًا من محل واحد لكل طلب.'}</p></div><button class="close-button" data-action="close-modal">×</button></div><div class="modal-body">${state.cart.length ? `<div>${state.cart.map(cartLine).join('')}</div><div class="form-grid" style="margin-top:16px"><div class="field"><label>عنوان التوصيل بالوصف</label><textarea name="address" id="address-input" placeholder="اسم الشارع، علامة مميزة، الدور...">${escapeHTML(state.checkoutAddress || '')}</textarea></div><div class="map-box"><span>📍 ${state.location ? 'تم تحديد موقعك على الخريطة' : 'أضف موقعك لمساعدة المندوب'}</span><button type="button" class="ghost-button small-button" data-action="locate">${state.location ? 'تحديث الموقع' : 'استخدم موقعي'}</button></div><div class="field"><label>رقم للتواصل عند الوصول</label><input id="checkout-phone" name="checkout_phone" inputmode="tel" value="${escapeHTML(state.user?.phone || '')}" placeholder="01xxxxxxxxx" /></div><div class="field"><label>طريقة الدفع أو التسوية</label><div class="payment-list"><label class="payment-option"><input type="radio" name="payment" value="paid_to_store" checked /><span>دفعت للمحل، والمطلوب توصيل فقط</span></label><label class="payment-option"><input type="radio" name="payment" value="vodafone_cash" /><span>Vodafone Cash</span></label><label class="payment-option"><input type="radio" name="payment" value="instapay" /><span>InstaPay</span></label><label class="payment-option"><input type="radio" name="payment" value="cash" /><span>الدفع عند الاستلام</span></label></div></div><div class="field"><label>رقم العملية، إن وجد</label><input id="payment-ref" placeholder="اختياري" /></div><div class="order-total"><span>الإجمالي التقريبي</span><span>${money(subtotal)} + ${money(cartFee())} توصيل = ${money(cartTotal())}</span></div><button class="primary-button" data-action="submit-order">تأكيد الطلب · ${money(cartTotal())}</button></div>` : '<div class="empty-state"><div style="font-size:46px">🛒</div><h3>السلة فاضية</h3><p>اختار طلبك الأول من المطاعم والمحلات.</p><button class="primary-button" data-action="close-modal">ابدأ التسوق</button></div>'}</div>`;
  }

  function cartLine(line) {
    return `<div class="cart-line"><div class="line-info"><strong>${escapeHTML(line.name)}</strong><span>${money(line.price)} · ${escapeHTML(line.merchantName)}</span></div><div class="quantity"><button data-action="cart-dec" data-product="${line.id}">−</button><b>${line.quantity}</b><button data-action="cart-inc" data-product="${line.id}">+</button></div></div>`;
  }

  async function loadProfile(user) {
    if (!client || !user) return;
    const { data } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
    state.profile = data || { full_name: user.user_metadata?.full_name || 'عميل مشاوير', role: user.user_metadata?.role || 'customer', approved: true };
    state.view = state.profile.role === 'customer' ? 'customer' : state.profile.role;
    const { data: orderData } = await client.from('orders').select('*').order('created_at', { ascending: false }).limit(10);
    if (orderData) state.orders = orderData.map(mapOrder);
    if (state.profile.role === 'admin') {
      const { data: courierData } = await client.from('profiles').select('*').eq('role', 'courier').order('created_at', { ascending: false });
      if (courierData) state.couriers = courierData;
    }
  }

  async function loadCatalog() {
    if (!client) return;
    const { data: merchantData } = await client.from('merchants').select('*').eq('active', true).order('created_at');
    const { data: productData } = await client.from('products').select('*').eq('available', true).order('created_at');
    if (merchantData?.length) {
      merchants = merchantData.map((merchant, index) => ({
        ...merchant,
        fee: Number(merchant.delivery_value || 18),
        eta: '25 - 45 دقيقة',
        color: ['linear-gradient(135deg,#e76f39,#9e3b31)', 'linear-gradient(135deg,#2d8a70,#1c5360)', 'linear-gradient(135deg,#3e8bc4,#3565a5)'][index % 3],
        symbol: ['🍲', '🛒', '✚'][index % 3]
      }));
    }
    if (productData?.length) {
      products = productData.map((product, index) => ({ ...product, price: Number(product.price), emoji: ['🍗', '🥘', '🌯', '🥬', '💧', '🧺', '💊', '🩹'][index % 8] }));
    }
  }

  function mapOrder(order) {
    const merchant = merchantFor(order.merchant_id);
    return { ...order, merchant: merchant?.name || 'طلب مشاوير', statusText: order.status || 'جديد', total: order.total || 0, address: order.address_text || '' };
  }

  async function completeAuth(user) {
    state.user = user;
    await loadProfile(user);
    if (client && !state.liveChannel) {
      state.liveChannel = client.channel('mashwer-orders-live').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async () => {
        await loadProfile(state.user);
        render();
      }).subscribe();
    }
    state.modal = null;
    render();
  }

  async function submitAuth(form) {
    const data = new FormData(form);
    const mode = String(data.get('mode'));
    const phone = normalizePhone(data.get('phone'));
    const password = String(data.get('password') || '');
    state.busy = true;
    render();
    try {
      if (mode === 'login') {
        const expectedRole = String(data.get('role') || 'customer');
        if (!loginRoles.includes(expectedRole)) throw new Error('نوع الدخول غير صحيح.');
        if (!client) return demoLogin(expectedRole);
        const result = await client.auth.signInWithPassword({ email: authEmail(phone), password });
        if (result.error) throw new Error(authErrorMessage(result.error));
        await loadProfile(result.data.user);
        const actualRole = currentRole();
        if (actualRole !== expectedRole) {
          await client.auth.signOut();
          state.profile = null;
          throw new Error(`هذا الحساب مسجل كـ${roleName(actualRole)}. اختر واجهة الدخول المناسبة.`);
        }
        await completeAuth(result.data.user);
        showToast('تم تسجيل الدخول، أهلاً بك في مشاوير.');
      } else if (mode === 'signup') {
        const fullName = String(data.get('full_name') || '').trim();
        const pin = String(data.get('pin') || '');
        const requestedRole = String(data.get('role') || 'customer');
        if (!/^\+20\d{10}$/.test(phone)) throw new Error('اكتب رقم هاتف مصري صحيحًا مثل 01012345678.');
        if (password.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف أو أرقام على الأقل.');
        if (!/^\d{6}$/.test(pin)) throw new Error('PIN الاسترجاع يجب أن يكون 6 أرقام.');
        if (!['customer', 'courier'].includes(requestedRole)) throw new Error('إنشاء حساب المدير يتم من الإدارة فقط.');
        if (!client) return demoLogin(requestedRole, fullName || 'عميل مشاوير');
        const result = await client.auth.signUp({ email: authEmail(phone), password, options: { data: { full_name: fullName, phone, role: requestedRole } } });
        if (result.error) throw new Error(authErrorMessage(result.error));
        if (!result.data.session) throw new Error('تعذر فتح الحساب تلقائيًا. تأكد من إيقاف تأكيد البريد في Supabase.');
        const pinResult = await client.rpc('set_pin', { pin_value: pin });
        if (pinResult.error) throw new Error(`تم إنشاء الحساب، لكن تعذر حفظ PIN الاسترجاع: ${authErrorMessage(pinResult.error)}`);
        await completeAuth(result.data.user);
        showToast('تم إنشاء حسابك بنجاح.');
      } else {
        const pin = String(data.get('pin') || '');
        if (!/^\d{6}$/.test(pin)) throw new Error('اكتب PIN صحيحًا من 6 أرقام.');
        if (!client) throw new Error('وضع التجربة لا ينفذ استعادة حقيقية.');
        const result = await client.rpc('recover_password', { phone_value: phone, pin_value: pin, new_password: password });
        if (result.error || !result.data?.ok) throw new Error(result.error?.message || result.data?.error || 'تعذر الاسترجاع.');
        state.authMode = 'login';
        render();
        showToast('تم تغيير كلمة المرور. سجل دخولك الآن.');
      }
    } catch (error) {
      showToast(error.message || 'حدث خطأ، حاول مرة أخرى.');
      render();
    } finally {
      state.busy = false;
    }
  }

  function demoLogin(role = 'customer', name = '') {
    state.user = { id: `demo-${role}`, phone: '+201000000000', demo: true, user_metadata: { full_name: name || (role === 'admin' ? 'مدير مشاوير' : role === 'courier' ? 'مندوب مشاوير' : 'عميل مشاوير'), role } };
    state.profile = { full_name: state.user.user_metadata.full_name, role, approved: true };
    state.view = role;
    state.modal = null;
    state.busy = false;
    render();
    showToast(`تم فتح واجهة ${roleName(role)} للتجربة.`);
  }

  function addToCart(productId) {
    const product = productFor(productId);
    if (!product) return;
    if (state.selectedMerchant && state.selectedMerchant !== product.merchant_id) {
      showToast('كل طلب من محل واحد. أكمل السلة الحالية أولاً.');
      return;
    }
    state.selectedMerchant = product.merchant_id;
    const existing = state.cart.find((line) => line.id === product.id);
    if (existing) existing.quantity += 1;
    else state.cart.push({ ...product, quantity: 1, merchantName: merchantFor(product.merchant_id)?.name || 'محل' });
    render();
    showToast(`تمت إضافة ${product.name} إلى السلة.`);
  }

  function changeCart(productId, delta) {
    const line = state.cart.find((item) => item.id === productId);
    if (!line) return;
    line.quantity += delta;
    if (line.quantity <= 0) state.cart = state.cart.filter((item) => item.id !== productId);
    if (!state.cart.length) state.selectedMerchant = null;
    render();
    if (state.modal === 'cart') state.modal = 'cart';
  }

  async function getLocation() {
    if (!navigator.geolocation) return showToast('المتصفح لا يدعم تحديد الموقع. استخدم وصف العنوان.');
    showToast('جارٍ تحديد موقعك...');
    navigator.geolocation.getCurrentPosition((position) => {
      state.location = { lat: position.coords.latitude, lng: position.coords.longitude };
      render();
      showToast('تم حفظ موقعك لمساعدة المندوب.');
    }, () => showToast('لم نتمكن من تحديد الموقع. اكتب العنوان بالوصف.'));
  }

  async function submitOrder() {
    const address = document.getElementById('address-input')?.value.trim();
    const phone = document.getElementById('checkout-phone')?.value.trim();
    const payment = document.querySelector('input[name="payment"]:checked')?.value || 'paid_to_store';
    const paymentRef = document.getElementById('payment-ref')?.value.trim() || null;
    if (!address) return showToast('اكتب عنوان التوصيل بالتفصيل.');
    if (!phone) return showToast('اكتب رقمًا للتواصل عند الوصول.');
    const payload = {
      merchant_id: state.selectedMerchant,
      items: state.cart.map((line) => ({ product_id: line.id, name: line.name, quantity: line.quantity, unit_price: line.price })),
      subtotal: cartSubtotal(),
      delivery_fee: cartFee(),
      total: cartTotal(),
      payment_method: payment,
      payment_reference: paymentRef,
      address_text: address,
      contact_phone: normalizePhone(phone),
      latitude: state.location?.lat || null,
      longitude: state.location?.lng || null,
      status: 'جديد'
    };
    if (isDemo() || !client) {
      state.orders.unshift({ id: `MW-${1043 + state.orders.length}`, merchant: selectedMerchant()?.name || 'محل مشاوير', customer: state.profile?.full_name || 'عميل مشاوير', statusText: 'جديد', total: payload.total, address, payment: payment, created_at: 'الآن' });
      finishOrder();
      showToast('تم تسجيل طلبك، وسيظهر للمندوب بعد قبول المحل.');
      return;
    }
    const { data, error } = await client.from('orders').insert({ ...payload, user_id: state.user.id, payment_status: payment === 'paid_to_store' ? 'not_required' : 'pending' }).select().single();
    if (error) return showToast(error.message || 'تعذر تسجيل الطلب.');
    state.orders.unshift(mapOrder(data));
    finishOrder();
    showToast('تم تسجيل الطلب بنجاح.');
  }

  function finishOrder() {
    state.cart = [];
    state.selectedMerchant = null;
    state.location = null;
    state.checkoutAddress = '';
    state.modal = null;
    render();
  }

  async function advanceOrder(orderId) {
    const steps = ['جديد', 'مقبول', 'قيد التجهيز', 'مع المندوب', 'تم التسليم'];
    const order = state.orders.find((item) => String(item.id) === String(orderId)) || state.orders[0];
    if (!order) return;
    const current = steps.indexOf(order.statusText);
    const nextStatus = steps[(current + 1) % steps.length];
    if (client && !isDemo() && order.id) {
      const { error } = await client.from('orders').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', order.id);
      if (error) return showToast('تعذر تحديث حالة الطلب.');
    }
    order.statusText = nextStatus;
    render();
    showToast(`تم تحديث الحالة إلى: ${order.statusText}`);
  }

  function setRoleView(role) {
    if (!state.user?.demo) return showToast('حسابك يفتح الواجهة الخاصة بدوره فقط.');
    state.profile.role = role;
    state.user.user_metadata.role = role;
    state.view = role;
    render();
  }

  async function logout() {
    if (client && !isDemo()) await client.auth.signOut();
    if (client && state.liveChannel) { await client.removeChannel(state.liveChannel); state.liveChannel = null; }
    state.user = null;
    state.profile = null;
    state.view = 'customer';
    state.modal = null;
    render();
    showToast('تم تسجيل الخروج.');
  }

  function handleClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'backdrop' && event.target !== target) return;
    if (action === 'open-auth') { state.modal = 'auth'; state.authMode = target.dataset.mode || 'login'; state.authRole = loginRoles.includes(target.dataset.role) ? target.dataset.role : 'customer'; render(); return; }
    if (action === 'auth-mode') { state.modal = 'auth'; state.authMode = target.dataset.mode; render(); return; }
    if (action === 'auth-role') { state.authRole = target.dataset.role; render(); return; }
    if (action === 'close-modal' || action === 'backdrop') { state.modal = null; render(); return; }
    if (action === 'toggle-password') { const input = target.closest('.password-row')?.querySelector('input'); if (input) input.type = input.type === 'password' ? 'text' : 'password'; return; }
    if (action === 'go-home') { event.preventDefault(); state.selectedMerchant = null; state.selectedCategory = 'الكل'; render(); return; }
    if (action === 'choose-merchant') { state.selectedMerchant = target.dataset.merchant; state.selectedCategory = 'الكل'; render(); document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (action === 'clear-merchant') { state.selectedMerchant = null; render(); return; }
    if (action === 'category') { state.selectedCategory = target.dataset.category; if (state.selectedCategory !== 'الكل') state.selectedMerchant = null; render(); return; }
    if (action === 'scroll-products') { document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (action === 'add-cart') { addToCart(target.dataset.product); return; }
    if (action === 'open-cart') { state.modal = 'cart'; render(); return; }
    if (action === 'open-orders') { document.getElementById('orders')?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (action === 'cart-inc') { changeCart(target.dataset.product, 1); return; }
    if (action === 'cart-dec') { changeCart(target.dataset.product, -1); return; }
    if (action === 'locate') { getLocation(); return; }
    if (action === 'submit-order') { submitOrder(); return; }
    if (action === 'logout') { logout(); return; }
    if (action === 'switch-demo') { setRoleView(target.dataset.view); return; }
    if (action === 'dashboard-tab') { state.adminTab = target.dataset.tab; render(); return; }
    if (action === 'toggle-online') { state.courierOnline = !state.courierOnline; render(); showToast(state.courierOnline ? 'أصبحت متاحًا لاستقبال الطلبات.' : 'تم إيقاف استقبال الطلبات.'); return; }
    if (action === 'advance-order') { advanceOrder(target.dataset.orderId); return; }
    if (action === 'approve-courier') {
      if (client && !isDemo() && target.dataset.courierId) {
        client.from('profiles').update({ approved: true }).eq('id', target.dataset.courierId).then(({ error }) => {
          if (error) return showToast('تعذر اعتماد المندوب.');
          loadProfile(state.user).then(() => { render(); showToast(`تم اعتماد ${target.dataset.courier}.`); });
        });
      } else showToast(`تم فتح ملف ${target.dataset.courier} للمراجعة.`);
      return;
    }
    if (action === 'show-notice') { showToast(target.dataset.message || 'هذه الخاصية ستكون متاحة قريبًا.'); return; }
  }

  function handleSubmit(event) {
    if (event.target.id !== 'auth-form') return;
    event.preventDefault();
    submitAuth(event.target);
  }

  async function boot() {
    document.addEventListener('click', handleClick);
    document.addEventListener('submit', handleSubmit);
    app.innerHTML = '<div class="loading"><span class="loading-dot"></span></div>';
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (client) {
      await loadCatalog();
      const { data } = await client.auth.getSession();
      if (data.session?.user) await completeAuth(data.session.user);
      client.auth.onAuthStateChange((_event, session) => {
        if (!session?.user && state.user && !state.user.demo) { state.user = null; state.profile = null; render(); }
      });
    }
    if (!state.user) render();
  }

  boot();
})();
