# Shoponzy admin panel

## Run locally

1. Start the backend from `backend/` with `npm run dev`.
2. Create an administrator account once with `npm run create-admin -- --email owner@example.com --name "Store Owner"`. Use a password of at least 12 characters.
3. Start this panel with `npm run dev` from `admin-panel/`, then sign in at `http://127.0.0.1:5176`.

The admin panel uses its own fixed port so it cannot collide with the storefront. The Vite dev server proxies `/api` to the backend on port 5000; the backend's `ADMIN_URL` must match `http://127.0.0.1:5176` for authenticated requests. Production builds default to `https://shoponzy-backend.vercel.app/api/v1`; set the Vercel project environment variable `VITE_API_BASE_URL` to override it. The backend's production `ADMIN_URL` must match this panel's deployed origin for authenticated requests. Restart the backend after changing `backend/.env`. Admin changes persist through the authenticated API; category images require Cloudinary to be configured in the backend.

Product management uses the backend API. Add/Edit Product supports ordered wide banners and three-image rows, which appear below the product details on the storefront. Shop all card background images are saved as category `exploreImage` fields, so deploy the backend with category background-image support before using that control. Orders, dashboard figures, and Manage Site screens are not connected to the backend yet.

In Manage Categories, edit a top-level category to upload its circular category image, category page banner (`bannerImage`), and Shop all card background (`exploreImage`). Edit each subcategory to upload its own circular image. These images are configured alongside the category they belong to; there is no separate Category Artwork section under Manage Site.

The standalone **SEO Settings** menu item below **Manage Site** contains Webmaster Tools verification, robots.txt editing, sitemap generation/download/upload, default and per-page metadata, and storefront 404 logging with redirect management. The backend serves the live sitemap and robots.txt at `/api/v1/seo/sitemap.xml` and `/api/v1/seo/robots.txt`; production storefront root URLs require the web-server proxy described in the backend README.
