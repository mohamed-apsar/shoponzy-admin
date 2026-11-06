import { useCallback, useEffect, useState } from "react";
import "./App.css";
import "./modern-theme.css";
import CategoryManager from "./components/CategoryManager";
import ManageSite from "./components/ManageSite";
import ProductsPage from "./components/ProductsPage";
import OrdersPage from "./components/OrdersPage";
import DashboardHome from "./components/DashboardHome";
import CustomersPage from "./components/CustomersPage";
import CouponsPage from "./components/CouponsPage";
import SeoSettings from "./components/SeoSettings";
import InventoryPage from "./components/InventoryPage";
import TransactionsPage from "./components/TransactionsPage";
import ReturnsPage from "./components/ReturnsPage";
import { ToastProvider } from "./components/ops/OpsKit";
import { adminRequest } from "./api/adminApi";
import { useAdminAuth } from "./context/AdminAuthContext";

const menuItems = [
  { name: "Dashboard", icon: "▦" },
  { name: "Manage Categories", icon: "▤" },
  { name: "Manage Products", icon: "□" },
  { name: "Inventory Management", icon: "▥" },
  { name: "Manage Orders", icon: "▣" },
  { name: "Transactions & Payments", icon: "₹" },
  { name: "Returns & Refunds", icon: "↺" },
  { name: "Customer List", icon: "♙" },
  { name: "Coupons", icon: "%" },
  { name: "Manage Site", icon: "⚙" },
  { name: "SEO Settings", icon: "⌕" },
];

const manageSitePages = [
  "General Settings",
  "Homepage Categories",
  "Homepage Banners",
  "Homepage Sections",
  "Branding & Colors",
  "Header & Footer",
  "Announcement Bar",
  "Popup Management",
  "Pages & Policies",
  "Contact & Social Links",
  "Maintenance Mode",
];

export default function App() {
  const { user, status: authStatus, error: authError, setError: setAuthError, signIn, signOut } = useAdminAuth();
  const [page, setPage] = useState("Dashboard");
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState("");
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const [siteOpen, setSiteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [openOrders, setOpenOrders] = useState(null);
  const [pendingReturns, setPendingReturns] = useState(null);

  const updateOrderCounts = useCallback((counts) => {
    setOpenOrders(["placed", "confirmed", "packed"].reduce((sum, s) => sum + (counts[s] || 0), 0));
  }, []);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    adminRequest("/admin/orders?limit=1").then((result) => updateOrderCounts(result.meta?.statusCounts || {})).catch(() => {});
    adminRequest("/admin/returns/summary").then((result) => setPendingReturns(result.data.pending)).catch(() => {});
  }, [authStatus, updateOrderCounts, page]);

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true);
    setCategoriesError("");
    try {
      const result = await adminRequest("/admin/categories?limit=500&page=1");
      setCategories(result.data.map((category) => ({
        id: category.id,
        level: category.level,
        parentId: category.parent || null,
        name: category.name,
        slug: category.slug,
        image: category.image || null,
        exploreImage: category.exploreImage || null,
        bannerImage: category.bannerImage || null,
        status: category.status,
      })));
    } catch (error) {
      setCategoriesError(error.message);
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated") loadCategories();
  }, [authStatus, loadCategories]);

  async function saveCategory(id, payload) {
    if (id) await adminRequest(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    else await adminRequest("/admin/categories", { method: "POST", body: JSON.stringify(payload) });
    await loadCategories();
  }

  async function deleteCategory(id) {
    await adminRequest(`/admin/categories/${id}`, { method: "DELETE" });
    await loadCategories();
  }

  async function toggleCategoryStatus(id, status) {
    await adminRequest(`/admin/categories/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    setCategories((current) => current.map((category) => (
      category.id === id ? { ...category, status } : category
    )));
  }

  async function submitLogin(event) {
    event.preventDefault();
    setLoginLoading(true);
    setAuthError("");
    try {
      await signIn(email, password);
      setPassword("");
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setLoginLoading(false);
    }
  }

  async function submitSignOut() {
    try {
      await signOut();
    } catch (error) {
      setAuthError(error.message);
    }
  }

  if (authStatus === "loading") {
    return <div className="auth-screen"><p role="status">Connecting to the admin API…</p></div>;
  }

  if (authStatus === "error") {
    return <div className="auth-screen"><section className="auth-card" role="alert">
      <h1>Admin API unavailable</h1><p>{authError}</p><button className="auth-submit" onClick={() => location.reload()}>Retry</button>
    </section></div>;
  }

  if (authStatus !== "authenticated") {
    return <div className="auth-screen">
      <form className="auth-card" onSubmit={submitLogin}>
        <img className="brand-logo auth-brand-logo" src="/shoponzy-logo.png" alt="Shoponzy" />
        <p className="eyebrow">ADMIN PANEL</p>
        <h1>Sign in</h1>
        <p className="muted">Sign in with an administrator account to manage the store.</p>
        <label>Email<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {authError && <p className="auth-error" role="alert">{authError}</p>}
        <button className="auth-submit" type="submit" disabled={loginLoading}>{loginLoading ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>;
  }

  function navigate(name) {
    setPage(name);
    setQuery("");
    setSidebarOpen(false);

    const categoryPages = [
      "Categories",
      "Sub categories",
      "Child categories",
      "Child Second categories",
      "Child Third categories",
    ];

    setCategoriesOpen(categoryPages.includes(name));
    setSiteOpen(manageSitePages.includes(name));
  }

  return (
    <ToastProvider>
    <div className="app-shell">
      {sidebarOpen && <button aria-label="Close menu" className="mobile-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-logo-wrap">
            <img className="brand-logo" src="/shoponzy-logo.png" alt="Shoponzy" />
            <span>ADMIN PANEL</span>
          </div>
        </div>
        <div className="menu-label">WORKSPACE</div>
        <nav>
          {menuItems.map((item) => ["Manage Categories", "Manage Site"].includes(item.name) ? (
            <div key={item.name} className="nav-group">
              <button
                type="button"
                aria-expanded={item.name === "Manage Categories" ? categoriesOpen : siteOpen}
                className={`nav-item ${[
                  ...(item.name === "Manage Categories"
                    ? ["Categories", "Sub categories", "Child categories", "Child Second categories", "Child Third categories"]
                    : manageSitePages),
                ].includes(page) ? "active" : ""}`}
                onClick={() => {
                  if (item.name === "Manage Categories") {
                    setCategoriesOpen((open) => !open);
                  } else if (siteOpen) {
                    setSiteOpen(false);
                  } else {
                    navigate("General Settings");
                  }
                }}
              >
                <span className="nav-icon">{item.icon}</span>
                <span>{item.name}</span>
                <span className="nav-chevron">{(item.name === "Manage Categories" ? categoriesOpen : siteOpen) ? "⌄" : "›"}</span>
              </button>
              {(item.name === "Manage Categories" ? categoriesOpen : siteOpen) && (
                <div className="nav-submenu">
                  {(item.name === "Manage Categories" ? [
                    "Categories",
                    "Sub categories",
                    "Child categories",
                    "Child Second categories",
                    "Child Third categories",
                  ] : manageSitePages).map((label) => (
                    <button
                      type="button"
                      key={label}
                      className={`nav-subitem ${page === label ? "active" : ""}`}
                      onClick={() => navigate(label)}
                    >
                      <span>•</span>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              key={item.name}
              className={`nav-item ${page === item.name ? "active" : ""}`}
              onClick={() => navigate(item.name)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.name}</span>
              {item.name === "Manage Orders" && openOrders > 0 && <span className="nav-count">{openOrders}</span>}
              {item.name === "Returns & Refunds" && pendingReturns > 0 && <span className="nav-count" title="Return requests awaiting review">{pendingReturns}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer"><div className="avatar">{(user?.name || "A").slice(0, 1).toUpperCase()}</div><div className="sidebar-user"><strong>{user?.name || "Administrator"}</strong><span title={user?.email}>{user?.email}</span></div><button type="button" className="sign-out" onClick={submitSignOut}>Sign out</button></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" aria-label="Open menu" onClick={() => setSidebarOpen(true)}>☰</button>
          <div className="breadcrumb">Shoponzy <span>/</span> <strong>{page}</strong></div>
          <div className="topbar-actions">
            <label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products or orders..." /></label>
            <button className="icon-button" aria-label="Notifications" onClick={() => alert("No new notifications.")}>♧<i /></button>
            <div className="top-avatar">SA</div>
          </div>
        </header>

        <div className="page-content">
          {page === "Dashboard" && <DashboardHome setPage={navigate} />}
          {page === "Manage Products" && <ProductsPage query={query} categories={categories} />}
          {page === "Manage Orders" && <OrdersPage query={query} onCountsChange={updateOrderCounts} />}
          {page === "Inventory Management" && <InventoryPage categories={categories} />}
          {page === "Transactions & Payments" && <TransactionsPage />}
          {page === "Returns & Refunds" && <ReturnsPage />}
          {page === "Customer List" && <CustomersPage query={query} />}
          {page === "Coupons" && <CouponsPage query={query} />}
          {page === "SEO Settings" && <SeoSettings />}
          {page === "Categories" && <CategoryManager categories={categories} mode={1} loading={categoriesLoading} loadError={categoriesError} onSave={saveCategory} onDelete={deleteCategory} onToggleStatus={toggleCategoryStatus} />}
          {page === "Sub categories" && <CategoryManager categories={categories} mode={2} loading={categoriesLoading} loadError={categoriesError} onSave={saveCategory} onDelete={deleteCategory} onToggleStatus={toggleCategoryStatus} />}
          {page === "Child categories" && <CategoryManager categories={categories} mode={3} loading={categoriesLoading} loadError={categoriesError} onSave={saveCategory} onDelete={deleteCategory} onToggleStatus={toggleCategoryStatus} />}
          {page === "Child Second categories" && <CategoryManager categories={categories} mode={4} loading={categoriesLoading} loadError={categoriesError} onSave={saveCategory} onDelete={deleteCategory} onToggleStatus={toggleCategoryStatus} />}
          {page === "Child Third categories" && <CategoryManager categories={categories} mode={5} loading={categoriesLoading} loadError={categoriesError} onSave={saveCategory} onDelete={deleteCategory} onToggleStatus={toggleCategoryStatus} />}
          {manageSitePages.includes(page) && <ManageSite activeSection={page} onSectionChange={navigate} categories={categories} />}
        </div>
        <footer className="footer">© 2026 Shoponzy · Admin dashboard <span>All changes are saved to the database</span></footer>
      </main>
    </div>
    </ToastProvider>
  );
}
