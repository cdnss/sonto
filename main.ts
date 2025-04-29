// Import dependency
// main.ts
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";


function addJQueryIframePathScript($: cheerio.CheerioAPI): void {
    const script = `
<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
<script>
$(document).ready(function() {
    $('iframe').each(function() {
        var src = $(this).attr('src');
        if (src) {
            try {
                // Gunakan window.location.href sebagai basis URL proxy saat ini
                // Ini akan mengganti src asli dengan format proxy
                $(this).attr('src', '/proxy?type=html&url=' + encodeURIComponent(src)); // Gunakan encodeURIComponent

            } catch (e) {
                console.error('Error processing iframe src:', src, e);
            }
        }
    });
});
</script>
`;
    const target = $('head').length ? $('head') : $('body');
    if (target.length) {
      target.append(script);
      // console.log("[INFO] Added jQuery script for iframe path manipulation."); // Log ini bisa sering muncul
    } else {
      console.warn("[WARN] Could not find <head> or <body> to add jQuery script.");
    }
}

/**
 * Fungsi untuk menyaring header request agar tidak mengirimkan header sensitif.
 */
export function filterRequestHeaders(headers: Headers): Headers { // Ubah tipe input menjadi Headers
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
    "user-agent", // Mungkin ingin memfilter ini juga
    "accept-encoding", // Biarkan Deno/browser yang menangani encoding
    "content-length", // Deno akan menghitung ulang
    "transfer-encoding", // Deno akan menangani
 ];

  for (const [key, value] of headers) { // Iterasi langsung pada objek Headers
    if (!forbidden.includes(key.toLowerCase())) {
      newHeaders.append(key, value);
    } else {
       // console.log(`[INFO] Filtering out header in main.ts: ${key}`); // Log ini bisa sangat verbose
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
    'iframe[src*="ad"], iframe[src*="banner"]', // Hapus iframe iklan juga
    // Tambahkan selector spesifik untuk target anime di sini
    ...commonUnwantedSelectors
];

const moviesUnwantedSelectors = [
    ".ads", ".advertisement", ".banner", ".iklan",
    "#ad_box", "#ad_bawah",
    'iframe[src*="ad"], iframe[src*="banner"]', // Hapus iframe iklan juga
    // Tambahkan selector spesifik untuk target movies di sini
    ...commonUnwantedSelectors
];

// Untuk target default atau generic proxy, mungkin tidak ingin menghapus banyak elemen
const defaultUnwantedSelectors = [
    ...commonUnwantedSelectors
    // Tambahkan selector spesifik untuk target default di sini
];

// --- Fungsi Transformasi Terpisah ---

/**
 * Menghapus elemen yang tidak diinginkan berdasarkan tipe target.
 * @param $ - Cheerio object.
 * @param targetType - Tipe target ('anime', 'movies', 'default', 'proxy').
 */
function removeUnwantedElements($: cheerio.CheerioAPI, targetType: 'anime' | 'movies' | 'default' | 'proxy'): void {
    // Jangan hapus elemen untuk targetType 'proxy' atau 'default' (sesuaikan jika perlu)
    if (targetType === 'proxy' || targetType === 'default') {
        // console.log(`[INFO] Skipping unwanted element removal for ${targetType} target.`);
        return;
    }

    let unwantedSelectors: string[] = [];
    switch (targetType) {
        case 'anime':
            unwantedSelectors = animeUnwantedSelectors;
            break;
        case 'movies':
            unwantedSelectors = moviesUnwantedSelectors;
            break;
        // case 'default': // Default dan Proxy ditangani di awal fungsi
        // case 'proxy':
        default:
            // Logika ini seharusnya tidak tercapai jika guard di awal fungsi berfungsi
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
    console.log(`[INFO] Finished attempting to remove unwanted elements for ${targetType}.`);
}

/**
 * Menambahkan atribut lazy loading ke gambar dan iframe.
 * @param $ - Cheerio object.
 * @param targetType - Tipe target ('anime', 'movies', 'default', 'proxy').
 */
function addLazyLoading($: cheerio.CheerioAPI, targetType: 'anime' | 'movies' | 'default' | 'proxy'): void {
    // Jangan tambahkan lazy loading untuk targetType 'proxy' atau 'default' (sesuaikan jika perlu)
    if (targetType === 'proxy' || targetType === 'default') {
         // console.log(`[INFO] Skipping lazy loading for ${targetType} target.`);
        return;
    }

    $("img, iframe").each((_, el) => {
        if (!$(el).attr("loading")) {
            $(el).attr("loading", "lazy");
        }
    });
    console.log(`[INFO] Added lazy loading to images and iframes for ${targetType}.`);
}

/**
 * Menulis ulang URL internal agar mengarah ke proxy.
 * @param $ - Cheerio object.
 * @param canonicalUrl - Canonical URL (URL proxy).
 * @param selectedTargetUrl - URL lengkap target yang di-fetch.
 * @param targetType - Tipe target yang diproses ('anime', 'movies', 'default', 'proxy').
 */
function rewriteUrls($: cheerio.CheerioAPI, canonicalUrl: string, selectedTargetUrl: string, targetType: 'anime' | 'movies' | 'default' | 'proxy'): void {
    const attributesToRewrite = ['href', 'src', 'data-src', 'data-href', 'data-url'];
    const canonicalOrigin = new URL(canonicalUrl).origin;
    const targetOrigin = new URL(selectedTargetUrl).origin; // Origin dari target yang sedang diproses

    $('*').each((_, el) => {
        attributesToRewrite.forEach(attr => {
            const originalValue = $(el).attr(attr);
            if (originalValue && typeof originalValue === 'string') { // Pastikan originalValue adalah string
                try {
                    const url = new URL(originalValue, selectedTargetUrl);

                    // Cek apakah URL mengarah ke domain target atau subdomainnya, dan bukan fragmen (#) atau mailto:
                    if (targetOrigin && (url.origin === targetOrigin || (url.host.endsWith('.' + new URL(selectedTargetUrl).hostname) && url.origin.startsWith('http'))) && !originalValue.startsWith('#') && !originalValue.startsWith('mailto:')) {

                        let proxiedUrlString: string;

                        // --- Logika Rewrite berdasarkan targetType ---
                        if (targetType === 'anime' || targetType === 'movies') {
                            // Tambahkan prefix /anime atau /movies
                            const prefix = targetType === 'anime' ? '/anime' : '/movies';
                            let newPath = url.pathname;
                            if (!newPath.startsWith(prefix + '/') && !(newPath === '/' && prefix !== '')) {
                                newPath = prefix + (newPath.startsWith('/') ? newPath : '/' + newPath);
                            } else if (newPath === '/' && prefix !== '') {
                                newPath = prefix + '/';
                            }
                            const proxiedUrl = new URL(newPath + url.search + url.hash, canonicalOrigin);
                            proxiedUrl.protocol = 'https';
                            proxiedUrlString = proxiedUrl.toString();

                        } else if (targetType === 'proxy') {
                             // Untuk /proxy?type=html, arahkan kembali ke endpoint /proxy
                             // Pastikan URL target asli di-encode
                             proxiedUrlString = `${canonicalOrigin}/proxy?type=html&url=${encodeURIComponent(url.toString())}`;
                             // console.log(`[INFO] Rewriting for proxy target: ${originalValue} -> ${proxiedUrlString}`); // Verbose log
                         }
                         // Tambahkan case lain jika targetType default juga perlu rewrite spesifik
                         else { // targetType === 'default' atau lainnya
                             // Gunakan logika default yang mungkin hanya perlu absolutkan URL relatif
                              const proxiedUrl = new URL(url.pathname + url.search + url.hash, canonicalOrigin);
                              proxiedUrl.protocol = 'https';
                              proxiedUrlString = proxiedUrl.toString();
                         }
                        // --- Akhir Logika Rewrite ---

                        if (proxiedUrlString) {
                          $(el).attr(attr, proxiedUrlString);
                          // console.log(`[INFO] Rewrote URL for ${targetType}: ${originalValue} -> ${proxiedUrlString}`); // Verbose log
                        }


                    } else if (!url.protocol.startsWith('http') && canonicalOrigin && !originalValue.startsWith('//') && !originalValue.startsWith('#') && !originalValue.startsWith('mailto:')) {
                         // Tangani path relatif yang tidak diawali '/' atau '//', jadikan absolut dengan origin proxy
                         const proxiedUrl = new URL(originalValue, canonicalOrigin);
                         $(el).attr(attr, proxiedUrl.toString());
                          // console.log(`[INFO] Rewrote relative URL for ${targetType}: ${originalValue} -> ${proxiedUrl.toString()}`); // Verbose log

                    } else if (originalValue.startsWith('//') && canonicalOrigin) {
                        // Tangani URL protokol-agnostik //site.com/path
                         const absoluteUrlFromTarget = new URL(`https:${originalValue}`, selectedTargetUrl);

                         if (targetOrigin && (absoluteUrlFromTarget.origin === targetOrigin || (absoluteUrlFromTarget.host.endsWith('.' + new URL(selectedTargetUrl).hostname) && absoluteUrlFromTarget.origin.startsWith('http')))) {

                            let proxiedUrlString: string;

                             if (targetType === 'anime' || targetType === 'movies') {
                                let newPath = absoluteUrlFromTarget.pathname;
                                let prefix = targetType === 'anime' ? '/anime' : '/movies';
                                if (prefix !== '' && !newPath.startsWith(prefix + '/') && !(newPath === '/' && prefix !== '')) {
                                    newPath = prefix + (newPath.startsWith('/') ? newPath : '/' + newPath);
                                } else if (newPath === '/' && prefix !== '') {
                                    newPath = prefix + '/';
                                }
                                const proxiedUrl = new URL(newPath + absoluteUrlFromTarget.search + absoluteUrlFromTarget.hash, canonicalOrigin);
                                proxiedUrl.protocol = 'https';
                                proxiedUrlString = proxiedUrl.toString();

                            } else if (targetType === 'proxy') {
                                // Untuk /proxy?type=html, arahkan kembali ke endpoint /proxy
                                proxiedUrlString = `${canonicalOrigin}/proxy?type=html&url=${encodeURIComponent(absoluteUrlFromTarget.toString())}`;
                                // console.log(`[INFO] Rewriting protocol-agnostic for proxy target: ${originalValue} -> ${proxiedUrlString}`); // Verbose log
                            }
                            // Tambahkan case lain jika targetType default juga perlu rewrite spesifik
                             else { // targetType === 'default' atau lainnya
                                // Gunakan logika default
                                const proxiedUrl = new URL(absoluteUrlFromTarget.pathname + absoluteUrlFromTarget.search + absoluteUrlFromTarget.hash, canonicalOrigin);
                                proxiedUrl.protocol = 'https';
                                proxiedUrlString = proxiedUrl.toString();
                             }

                             if (proxiedUrlString) {
                                $(el).attr(attr, proxiedUrlString);
                                // console.log(`[INFO] Rewrote protocol-agnostic URL for ${targetType}: ${originalValue} -> ${proxiedUrlString}`); // Verbose log
                             }
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
 * @param targetType - Tipe target yang diproses ('anime', 'movies', 'default', 'proxy').
 * @returns HTML yang telah dimodifikasi.
 */
export function transformHTML(html: string, canonicalUrl: string, targetOrigin: string | null, selectedTargetUrl: string, targetType: 'anime' | 'movies' | 'default' | 'proxy'): string {
  console.log(`[INFO] Starting HTML transformation in main.ts for ${targetType} target.`);

  let $;
  try {
    $ = cheerio.load(html);
  } catch (e) {
    console.error("[ERROR] Failed to load HTML with Cheerio in main.ts:", e);
    return html; // Kembalikan HTML asli jika parsing gagal
  }

  // Panggil fungsi-fungsi transformasi yang lebih kecil secara kondisional
    // removeUnwantedElements dan addLazyLoading dilewati jika targetType adalah 'proxy' atau 'default'
  removeUnwantedElements($, targetType);
  addLazyLoading($, targetType);

    // rewriteUrls dan addJQueryIframePathScript selalu dipanggil jika targetType adalah 'proxy'
    // Untuk tipe lain, panggil sesuai kebutuhan
    if (targetType === 'proxy' || targetType === 'movies' ) {
        rewriteUrls($, canonicalUrl, selectedTargetUrl, targetType);
        addJQueryIframePathScript($); // Panggil fungsi khusus iframe di sini
        console.log("[INFO] Applied proxy-specific transformations (rewriteUrls, iframe script).");
    } else { // 'anime', 'movies', 'default'
         rewriteUrls($, canonicalUrl, selectedTargetUrl, targetType);
         // Panggil addJQueryIframePathScript untuk tipe lain jika diinginkan
         // addJQueryIframePathScript($); // <-- Jika ingin script iframe di semua tipe HTML
         console.log(`[INFO] Applied ${targetType}-specific transformations.`);
    }


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
