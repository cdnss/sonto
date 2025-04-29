// Import dependency
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

/**
 * Fungsi untuk menyaring header request agar tidak mengirimkan header sensitif.
 */
export function filterRequestHeaders(headers: { [key: string]: string }): Headers {
  const newHeaders = new Headers();
  const forbidden = [
    "host",
    "connection",
    "x-forwarded-for",
    "cf-connecting-ip",
    "cf-ipcountry",
    "x-real-ip",
    "cookie",
    "authorization",
    "referer",
  ];

  for (const [key, value] of Object.entries(headers)) {
    if (!forbidden.includes(key.toLowerCase())) {
      newHeaders.append(key, value);
    } else {
       // console.log(`[INFO] Filtering out header in main.ts: ${key}`);
    }
  }
  return newHeaders;
}

// --- Definisi Selector yang Berbeda untuk Tiap Target ---

const commonUnwantedSelectors = [
    'script[src*="ad"], script[src*="analytics"], script[src*="googletagmanager"], script[src*="doubleclick"]',
    'script:contains("adsbygoogle")',
    'div[data-ad-client], div[data-ad-slot]'
];

const animeUnwantedSelectors = [
    ".ads", ".advertisement", ".banner", ".iklan",
    "#ad_box", "#ad_bawah", "#judi", "#judi2",
    // Tambahkan selector spesifik untuk target anime di sini
    ...commonUnwantedSelectors
];

const moviesUnwantedSelectors = [
    ".ads", ".advertisement", ".banner", ".iklan",
    "#ad_box", "#ad_bawah",
    // Tambahkan selector spesifik untuk target movies di sini
    ...commonUnwantedSelectors
];

const defaultUnwantedSelectors = [
    ...commonUnwantedSelectors
    // Tambahkan selector spesifik untuk target default di sini
];

// --- Fungsi Transformasi Terpisah ---

/**
 * Menghapus elemen yang tidak diinginkan berdasarkan tipe target.
 * @param $ - Cheerio object.
 * @param targetType - Tipe target ('anime', 'movies', 'default').
 */
function removeUnwantedElements($: cheerio.CheerioAPI, targetType: 'anime' | 'movies' | 'default'): void {
    let unwantedSelectors: string[] = [];
    switch (targetType) {
        case 'anime':
            unwantedSelectors = animeUnwantedSelectors;
            break;
        case 'movies':
            unwantedSelectors = moviesUnwantedSelectors;
            break;
        case 'default':
        default:
            unwantedSelectors = defaultUnwantedSelectors;
            break;
    }

    unwantedSelectors.forEach((selector) => {
        try {
            const removedCount = $(selector).remove().length;
            if (removedCount > 0) {
                // console.log(`[INFO] Removed ${removedCount} elements matching selector: ${selector}`); // Log ini bisa sangat verbose
            }
        } catch (e) {
            console.error(`[ERROR] Error removing elements with selector "${selector}" for ${targetType}:`, e);
        }
    });
    console.log(`[INFO] Finished removing unwanted elements for ${targetType}.`);
}

/**
 * Menambahkan atribut lazy loading ke gambar dan iframe.
 * @param $ - Cheerio object.
 */
function addLazyLoading($: cheerio.CheerioAPI): void {
    $("img, iframe").each((_, el) => {
        if (!$(el).attr("loading")) {
            $(el).attr("loading", "lazy");
        }
    });
    console.log("[INFO] Added lazy loading to images and iframes.");
}

/**
 * Menulis ulang URL internal agar mengarah ke proxy.
 * @param $ - Cheerio object.
 * @param canonicalUrl - Canonical URL (URL proxy).
 * @param selectedTargetUrl - URL lengkap target yang di-fetch.
 * @param targetType - Tipe target ('anime', 'movies', 'default').
 */
function rewriteUrls($: cheerio.CheerioAPI, canonicalUrl: string, selectedTargetUrl: string, targetType: 'anime' | 'movies' | 'default'): void {
    const attributesToRewrite = ['href', 'src', 'data-src', 'data-href', 'data-url'];
    const canonicalOrigin = new URL(canonicalUrl).origin;
    const targetOrigin = new URL(selectedTargetUrl).origin; // Origin dari target yang sedang diproses

    $('*').each((_, el) => {
        attributesToRewrite.forEach(attr => {
            const originalValue = $(el).attr(attr);
            if (originalValue) {
                try {
                    const url = new URL(originalValue, selectedTargetUrl);

                    if (targetOrigin && (url.origin === targetOrigin || (url.host.endsWith('.' + new URL(selectedTargetUrl).hostname) && url.origin.startsWith('http'))) && !originalValue.startsWith('#') && !originalValue.startsWith('mailto:')) {

                        let newPath = url.pathname;

                        // Logika untuk menambahkan prefix path proxy kembali ke URL internal
                        let prefix = '';
                        if (targetType === 'anime') {
                            prefix = '/anime';
                        } else if (targetType === 'movies') {
                            prefix = '/movies';
                        }
                        // Tambahkan prefix hanya jika belum ada, atau jika path aslinya bukan root '/'
                        // dan prefix bukan string kosong ('')
                         if (prefix !== '' && !newPath.startsWith(prefix + '/') && !(newPath === '/' && prefix !== '')) {
                            newPath = prefix + (newPath.startsWith('/') ? newPath : '/' + newPath);
                         } else if (newPath === '/' && prefix !== '') {
                             // Handle root path dari target ketika targetType punya prefix
                              newPath = prefix + '/';
                         }

                        const proxiedUrl = new URL(newPath + url.search + url.hash, canonicalOrigin);
                        proxiedUrl.protocol = 'https';
                        $(el).attr(attr, proxiedUrl.toString());
                        // console.log(`[INFO] Rewrote URL for ${targetType}: ${originalValue} -> ${proxiedUrl.toString()}`); // Verbose log

                    } else if (!url.protocol.startsWith('http') && canonicalOrigin && !originalValue.startsWith('//')) {
                         // Tangani path relatif yang tidak diawali '/' atau '//', jadikan absolut dengan origin proxy
                         const proxiedUrl = new URL(originalValue, canonicalOrigin);
                         $(el).attr(attr, proxiedUrl.toString());
                          // console.log(`[INFO] Rewrote relative URL for ${targetType}: ${originalValue} -> ${proxiedUrl.toString()}`); // Verbose log

                    } else if (originalValue.startsWith('//') && canonicalOrigin) {
                        // Tangani URL protokol-agnostik //site.com/path
                         const absoluteUrlFromTarget = new URL(`https:${originalValue}`, selectedTargetUrl);
                         if (targetOrigin && (absoluteUrlFromTarget.origin === targetOrigin || (absoluteUrlFromTarget.host.endsWith('.' + new URL(selectedTargetUrl).hostname) && absoluteUrlFromTarget.origin.startsWith('http')))) {

                            let newPath = absoluteUrlFromTarget.pathname;
                            let prefix = '';
                            if (targetType === 'anime') {
                                prefix = '/anime';
                            } else if (targetType === 'movies') {
                                prefix = '/movies';
                            }
                             if (prefix !== '' && !newPath.startsWith(prefix + '/') && !(newPath === '/' && prefix !== '')) {
                                newPath = prefix + (newPath.startsWith('/') ? newPath : '/' + newPath);
                            } else if (newPath === '/' && prefix !== '') {
                                 newPath = prefix + '/';
                            }

                           const proxiedUrl = new URL(newPath + absoluteUrlFromTarget.search + absoluteUrlFromTarget.hash, canonicalOrigin);
                           proxiedUrl.protocol = 'https';
                            $(el).attr(attr, proxiedUrl.toString());
                             // console.log(`[INFO] Rewrote protocol-agnostic URL for ${targetType}: ${originalValue} -> ${proxiedUrl.toString()}`); // Verbose log
                         }
                    }
                } catch (e) {
                    // Abaikan atribut yang nilainya bukan URL yang valid
                    // console.warn(`[WARN] Could not parse URL "${originalValue}" for rewriting in main.ts:`, e); // Verbose log
                }
            }
        });
    });
    console.log(`[INFO] Rewrote internal URLs for ${targetType}.`);
}


/**
 * Fungsi utama untuk memproses konten HTML dari target.
 * Mengorkestrasi pemanggilan fungsi transformasi yang lebih kecil.
 *
 * @param html - Konten HTML asli.
 * @param canonicalUrl - Canonical URL (URL proxy).
 * @param targetOrigin - Origin dari situs target.
 * @param selectedTargetUrl - URL lengkap target yang di-fetch.
 * @param targetType - Tipe target yang diproses ('anime', 'movies', 'default').
 * @returns HTML yang telah dimodifikasi.
 */
export function transformHTML(html: string, canonicalUrl: string, targetOrigin: string | null, selectedTargetUrl: string, targetType: 'anime' | 'movies' | 'default'): string {
  console.log(`[INFO] Starting HTML transformation in main.ts for ${targetType} target.`);

  let $;
  try {
    $ = cheerio.load(html);
  } catch (e) {
    console.error("[ERROR] Failed to load HTML with Cheerio in main.ts:", e);
    return html; // Kembalikan HTML asli jika parsing gagal
  }

  // Panggil fungsi-fungsi transformasi yang lebih kecil
  removeUnwantedElements($, targetType);
  addLazyLoading($);
  rewriteUrls($, canonicalUrl, selectedTargetUrl, targetType);

  let processedHtml = '';
  try {
    processedHtml = $.html();
  } catch (e) {
    console.error("[ERROR] Failed to serialize HTML with Cheerio in main.ts:", e);
    return html;
  }

  // Tambahkan DOCTYPE jika hilang
  if (!/^<!DOCTYPE\s+/i.test(processedHtml)) {
    processedHtml = "<!DOCTYPE html>\n" + processedHtml;
    console.log("[INFO] Added missing DOCTYPE.");
  }

  console.log(`[INFO] HTML transformation finished for ${targetType} target.`);
  return processedHtml;
}
