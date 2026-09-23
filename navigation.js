(() => {
  'use strict';

  const ROLES = Object.freeze({
    CUSTOMER: 'Customer',
    DRIVER: 'Driver',
    ADMIN: 'Admin'
  });

  const ROLE_ALIASES = Object.freeze({
    customer: ROLES.CUSTOMER,
    Customer: ROLES.CUSTOMER,
    courier: ROLES.DRIVER,
    driver: ROLES.DRIVER,
    Driver: ROLES.DRIVER,
    admin: ROLES.ADMIN,
    Admin: ROLES.ADMIN
  });

  // All navigation icons live here so screens only reference icon keys.
  const ICON_REGISTRY = Object.freeze({
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-6h6v6"/></svg>',
    homeActive: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.6 9 7V21H3V9.6l9-7Zm0 3.1L5 11.1V19h14v-7.9l-7-5.4Z"/><path d="M9 13h6v6H9z"/></svg>',
    orders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>',
    ordersActive: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12v18H6zM9 7h6v1.7H9zM9 11h6v1.7H9zM9 15h4v1.7H9z"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2.1 11.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20 8H6"/><circle cx="10" cy="20" r="1"/><circle cx="17" cy="20" r="1"/></svg>',
    cartActive: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 4h2l2.1 11.1a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L20 8H6l-.4-2H3V4Z"/><circle cx="10" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/></svg>',
    account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="3.2"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>',
    accountActive: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="3.3"/><path d="M5 21a7 7 0 0 1 14 0H5Z"/></svg>',
    drivers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.2"/><path d="M3.5 21a5.5 5.5 0 0 1 11 0M14 20a4 4 0 0 1 7 0"/></svg>',
    driversActive: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.2"/><path d="M3.5 21a5.5 5.5 0 0 1 11 0H3.5ZM14 20a4 4 0 0 1 7 0h-7Z"/></svg>',
    shops: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 10h16M6 10v10h12V10M5 10l1-6h12l1 6"/><path d="M9 20v-5h6v5"/></svg>',
    shopsActive: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 10h16v10H4zM6 4h12l1 6H5l1-6Zm3 11h6v5H9z"/></svg>',
    notifications: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>',
    notificationsActive: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4v-1h-4v1Z"/></svg>',
    wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h15a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M4 6V4h13M16 13h3"/><circle cx="16" cy="13" r=".5" fill="currentColor"/></svg>',
    walletActive: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h15a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-1Zm0-2h13v2H4V4Zm12 8h3v2h-3a1 1 0 1 1 0-2Z"/></svg>'
  });

  // This is the single source of truth for labels, routes, roles, icons and order.
  const NAVIGATION_CONFIG = Object.freeze([
    { id: 'customer-home', label: 'الرئيسية', icon: 'home', activeIcon: 'homeActive', route: 'customer.home', permission: [ROLES.CUSTOMER], badge: null, order: 10 },
    { id: 'customer-orders', label: 'طلباتي', icon: 'orders', activeIcon: 'ordersActive', route: 'customer.orders', permission: [ROLES.CUSTOMER], badge: 'orders', order: 20 },
    { id: 'customer-cart', label: 'السلة', icon: 'cart', activeIcon: 'cartActive', route: 'customer.cart', permission: [ROLES.CUSTOMER], badge: 'cart', order: 30 },
    { id: 'customer-account', label: 'حسابي', icon: 'account', activeIcon: 'accountActive', route: 'customer.account', permission: [ROLES.CUSTOMER], badge: null, order: 40 },
    { id: 'customer-notifications', label: 'الإشعارات', icon: 'notifications', activeIcon: 'notificationsActive', route: 'customer.notifications', permission: [ROLES.CUSTOMER], badge: 'notifications', order: 50 },
    { id: 'driver-home', label: 'الرئيسية', icon: 'home', activeIcon: 'homeActive', route: 'driver.home', permission: [ROLES.DRIVER], badge: null, order: 10 },
    { id: 'driver-orders', label: 'المشاوير', icon: 'orders', activeIcon: 'ordersActive', route: 'driver.orders', permission: [ROLES.DRIVER], badge: 'orders', order: 20 },
    { id: 'driver-earnings', label: 'حسابي', icon: 'wallet', activeIcon: 'walletActive', route: 'driver.earnings', permission: [ROLES.DRIVER], badge: null, order: 30 },
    { id: 'driver-notifications', label: 'الإشعارات', icon: 'notifications', activeIcon: 'notificationsActive', route: 'driver.notifications', permission: [ROLES.DRIVER], badge: 'notifications', order: 40 },
    { id: 'admin-overview', label: 'الرئيسية', icon: 'home', activeIcon: 'homeActive', route: 'admin.overview', permission: [ROLES.ADMIN], badge: null, order: 10 },
    { id: 'admin-orders', label: 'الطلبات', icon: 'orders', activeIcon: 'ordersActive', route: 'admin.orders', permission: [ROLES.ADMIN], badge: 'pendingOrders', order: 20 },
    { id: 'admin-drivers', label: 'المندوبون', icon: 'drivers', activeIcon: 'driversActive', route: 'admin.drivers', permission: [ROLES.ADMIN], badge: null, order: 30 },
    { id: 'admin-shops', label: 'الأسعار', icon: 'shops', activeIcon: 'shopsActive', route: 'admin.shops', permission: [ROLES.ADMIN], badge: null, order: 40 },
    { id: 'admin-notifications', label: 'الإشعارات', icon: 'notifications', activeIcon: 'notificationsActive', route: 'admin.notifications', permission: [ROLES.ADMIN], badge: 'notifications', order: 50 }
  ].map(Object.freeze));

  const ROUTE_TITLES = Object.freeze(Object.fromEntries(
    NAVIGATION_CONFIG.map((item) => [item.route, item.label])
  ));

  const CORE_ROUTES = Object.freeze(['customer.home', 'driver.home', 'admin.overview']);
  const LAZY_ROUTE_LOADERS = Object.freeze({
    'customer.orders': () => import('./routes/customer-orders.js'),
    'customer.cart': () => import('./routes/customer-cart.js'),
    'customer.account': () => import('./routes/customer-account.js'),
    'customer.notifications': () => import('./routes/customer-notifications.js'),
    'driver.orders': () => import('./routes/driver-orders.js'),
    'driver.earnings': () => import('./routes/driver-earnings.js'),
    'driver.notifications': () => import('./routes/driver-notifications.js'),
    'admin.orders': () => import('./routes/admin-orders.js'),
    'admin.drivers': () => import('./routes/admin-drivers.js'),
    'admin.shops': () => import('./routes/admin-shops.js'),
    'admin.notifications': () => import('./routes/admin-notifications.js')
  });

  const normalizeRole = (role) => ROLE_ALIASES[role] || ROLES.CUSTOMER;
  const getNavigationItems = (role) => NAVIGATION_CONFIG
    .filter((item) => item.permission.includes(normalizeRole(role)))
    .sort((a, b) => a.order - b.order);
  const getRouteDefinition = (route) => {
    const item = NAVIGATION_CONFIG.find((entry) => entry.route === route);
    return item ? { ...item, title: ROUTE_TITLES[route] } : null;
  };
  const getRouteTitle = (route) => ROUTE_TITLES[route] || getRouteDefinition(route)?.label || '';
  const isRouteAllowed = (route, role) => getNavigationItems(role).some((item) => item.route === route);
  const loadRoute = (route) => {
    const loader = LAZY_ROUTE_LOADERS[route];
    if (!loader) return Promise.resolve(null);
    return loader().then((module) => {
      if (module.route !== route || !module.page?.kind || !module.page?.data) throw new Error(`Lazy route definition is incomplete for ${route}.`);
      return module;
    });
  };
  const ROUTE_LABELS = Object.freeze(Object.fromEntries(NAVIGATION_CONFIG.map((item) => [item.route, item.label])));

  const requiredFields = ['id', 'label', 'icon', 'activeIcon', 'route', 'permission', 'badge', 'order'];
  const ids = new Set();
  const routes = new Set();
  NAVIGATION_CONFIG.forEach((item) => {
    requiredFields.forEach((field) => {
      if (item[field] === undefined) throw new Error(`Navigation item ${item.id || 'unknown'} is missing ${field}.`);
    });
    if (ids.has(item.id) || routes.has(item.route)) throw new Error(`Duplicate navigation identity: ${item.id}/${item.route}.`);
    if (!ICON_REGISTRY[item.icon] || !ICON_REGISTRY[item.activeIcon]) throw new Error(`Missing icon for ${item.route}.`);
    if (!ROUTE_TITLES[item.route]) throw new Error(`Missing route title for ${item.route}.`);
    if (!item.permission.length || item.permission.some((role) => !Object.values(ROLES).includes(role))) throw new Error(`Invalid permission for ${item.route}.`);
    if (!CORE_ROUTES.includes(item.route) && !LAZY_ROUTE_LOADERS[item.route]) throw new Error(`Missing lazy loader for ${item.route}.`);
    ids.add(item.id);
    routes.add(item.route);
  });

  window.MASHAWER_NAVIGATION = Object.freeze({
    ROLES,
    ICON_REGISTRY,
    NAVIGATION_CONFIG,
    ROUTE_LABELS,
    CORE_ROUTES,
    normalizeRole,
    getNavigationItems,
    getRouteDefinition,
    getRouteTitle,
    isRouteAllowed,
    loadRoute
  });
})();
