/* The exact size every admin image is cropped to, matched to where the storefront shows it.
   One place, so the crop window, the field hints and the storefront stay in step. */
export const IMAGE_SIZES = {
  productImage: { width: 800, height: 800, ratio: "1:1 square" },
  productRowImage: { width: 800, height: 1200, ratio: "2:3 portrait" },
  productBanner: { width: 1920, height: 600, ratio: "16:5 wide" },
  seoImage: { width: 1200, height: 600, ratio: "2:1" },
  categoryCircle: { width: 600, height: 600, ratio: "1:1 square" },
  categoryBanner: { width: 1920, height: 800, ratio: "12:5 wide" },
  categoryExplore: { width: 1200, height: 800, ratio: "3:2 landscape" },
  subcategoryImage: { width: 800, height: 1200, ratio: "2:3 portrait" },
  subcategoryBanner: { width: 1920, height: 600, ratio: "16:5 wide" },
  siteBanner: { width: 1920, height: 800, ratio: "12:5 wide" },
  siteBannerMobile: { width: 750, height: 1000, ratio: "3:4 portrait" },
  popup: { width: 800, height: 1000, ratio: "4:5 portrait" },
  logo: { width: 600, height: 200, ratio: "3:1 wide" },
  maintenance: { width: 1200, height: 800, ratio: "3:2 landscape" },
};

export const sizeLabel = (size) => `${size.width} × ${size.height} px (${size.ratio})`;

export const cropHint = (size) =>
  `Image size: ${sizeLabel(size)}. Upload a JPG, JPEG, PNG or WebP. You can crop, zoom, move and rotate it before it is saved.`;
