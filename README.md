# Shoponzy admin panel

## Run locally

1. Start the backend from `backend/` with `npm run dev`.
2. Create an administrator account once with `npm run create-admin -- --email owner@example.com --name "Store Owner"`. Use a password of at least 12 characters.
3. Start this panel with `npm run dev` from `admin-panel/`, then sign in at `http://127.0.0.1:5176`.

The admin panel uses its own fixed port so it cannot collide with the storefront. The Vite dev server proxies `/api` to the backend on port 5000; the backend's `ADMIN_URL` must match `http://127.0.0.1:5176` for authenticated requests. Restart the backend after changing `backend/.env`. Category lists and category create, edit, status, and delete actions use the authenticated admin API and persist in MongoDB. Category images require Cloudinary to be configured in the backend.

Products, orders, dashboard figures, and Manage Site screens are not connected to the backend yet.
