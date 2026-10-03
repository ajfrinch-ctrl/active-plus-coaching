/* One place for the institute look every surface shares: the top bar, the
   downloaded PDFs and the offline receipts all read the same name, slogan and
   logo file. The logo is the app's own asset (assets/icons/logo-128.png) — no
   second copy of it is ever created. */
export const BRAND_NAME = 'Active Plus Coaching';
export const BRAND_TAGLINE = 'শিখতে থাকো, এগিয়ে যাও';
export const BRAND_LOGO = 'assets/icons/logo-128.png';
export const BRAND_LOGO_LARGE = 'assets/icons/app-logo.png';
export const brandLogoSrc = (base = import.meta.url) => new URL(`../${BRAND_LOGO}`, base).href;
export const brandLogoLargeSrc = (base = import.meta.url) => new URL(`../${BRAND_LOGO_LARGE}`, base).href;
