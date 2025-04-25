// Import dependency
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";
/**
 * Fungsi untuk menyaring header request agar tidak mengirimkan header sensitif.
 */
// File: main.ts
const target = "https://ww1.anoboy.app";

export function filterRequestHeaders(headers: { [key: string]: string }): Headers {
// Atau gunakan 'any' jika Anda tidak memakai TypeScript atau ingin lebih fleksibel:
// export function filterRequestHeaders(headers: any): Headers {

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
  ];

  // Iterasi menggunakan Object.entries() karena input adalah objek biasa {}
  for (const [key, value] of Object.entries(headers)) { // <-- PERUBAHAN DI SINI
    if (!forbidden.includes(key.toLowerCase())) {
      newHeaders.append(key, value);
    } else {
       // console.log(`[INFO] Filtering out header in main.ts: ${key}`);
    }
  }

   // Opsional: Atur User-Agent default jika dihapus
   // if (!newHeaders.has('user-agent')) {
   //    newHeaders.set('user-agent', 'Deno Proxy SEO Bot/1.0'); // Ganti 'Deno Proxy SEO Bot' jika tidak relevan
   // }

  return newHeaders; // Mengembalikan objek Headers baru, OK
}

// ... Implementasi transformHTML Anda di sini ...
// Pastikan transformHTML juga diekspor: export function transformHTML(...) { ... }

/**
 * Fungsi transformHTML menerapkan perbaikan SEO.
 *
 * @param html - Konten HTML asli.
 * @param canonicalUrl - Canonical URL yang diambil dari request (requestUrl.href).
 * @param targetOrigin - Origin dari situs target (contoh: https://ww1.anoboy.app).
 * @returns HTML yang telah dimodifikasi.
 */
export function transformHTML(html: string, canonicalUrl: string, targetOrigin: string | null, targetString: string): string {
  console.log(`[INFO] Starting HTML transformation in main.ts for canonicalUrl: ${canonicalUrl}`);

  let $;
  try {
    $ = cheerio.load(html);
  } catch (e) {
    console.error("[ERROR] Failed to load HTML with Cheerio in main.ts:", e);
    return html; // Kembalikan HTML asli jika parsing gagal
  }

  const canonicalOrigin = new URL(canonicalUrl).origin;

  // Hapus elemen yang tidak diinginkan
  const unwantedSelectors = [
    ".ads", ".advertisement", ".banner", "#coloma", ".iklan", ".sidebar a",
    "#ad_box", "#ad_bawah", "#judi", "#judi2",
    'script[src*="ad"], script[src*="analytics"], script[src*="googletagmanager"], script[src*="doubleclick"]',
    'iframe[src*="ad"]',
    'div[class*="ad"], div[id*="ad"]',
    'div[class*="banner"], div[id*="banner"]',
    'link[rel="dns-prefetch"]',
    'link[rel="shortlink"]',
    'script:contains("adsbygoogle")',
    'div[data-ad-client], div[data-ad-slot]'
  ];
  unwantedSelectors.forEach((selector) => {
      try {
          const removedCount = $(selector).remove().length;
          if (removedCount > 0) {
               console.log(`[INFO] Removed ${removedCount} elements matching selector: ${selector}`);
          }
      } catch (e) {
          console.error(`[ERROR] Error removing elements with selector "${selector}" in main.ts:`, e);
      }
  });


  // Tambahkan meta tag bila belum ada
  if ($("meta[charset]").length === 0) {
    $("head").prepend(`<meta charset="UTF-8">`);
    console.log("[INFO] Added missing charset meta tag.");
  }
  if ($("meta[name='viewport']").length === 0) {
    $("head").append(`<meta name="viewport" content="width=device-width, initial-scale=1">`);
     console.log("[INFO] Added missing viewport meta tag.");
  }
  if ($("meta[name='keywords']").length === 0) {
    $("head").append(`<meta name="keywords" content="anime, streaming, subtitle indonesia, download anime">`);
     console.log("[INFO] Added missing keywords meta tag.");
  }
  if ($("meta[name='description']").length === 0) {
    $("head").append(`<meta name="description" content="Akses konten anime terbaru dengan subtitle Indonesia.">`);
     console.log("[INFO] Added missing description meta tag.");
  } else {
      const currentDescription = $("meta[name='description']").attr("content");
      if (currentDescription && currentDescription.length < 50) {
           $("head meta[name='description']").attr("content", "Akses konten anime terbaru dengan subtitle Indonesia.");
            console.log("[INFO] Updated short description meta tag.");
      }
  }


  // Hapus tag canonical yang ada sebelum menambahkan yang baru
  $("link[rel='canonical']").remove();
  // Tambahkan tag canonical dengan canonicalUrl (override apa pun)
  $("head").append(`<link rel="canonical" href="${canonicalUrl}">`);
  console.log(`[INFO] Added canonical link tag: ${canonicalUrl}`);


  // Modifikasi atau Sisipkan structured data JSON‑LD
   // Hapus script schema.org Article yang lama jika ada
  $('script[type="application/ld+json"]').each((_, el) => {
      try {
          const json = JSON.parse($(el).html() || '');
          if (json['@type'] === 'Article' || (json['@graph'] && Array.isArray(json['@graph']) && json['@graph'].some(item => item['@type'] === 'Article'))) {
               $(el).remove();
               console.log("[INFO] Removed existing Article schema.org script.");
          }
      } catch (e) {
          console.warn("[WARN] Could not parse JSON-LD script for removal in main.ts:", e);
      }
  });


  // Ganti URL di semua script application/ld+json yang mengarah ke targetOrigin
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const jsonContent = $(el).html();
      if (jsonContent) {
        let json = JSON.parse(jsonContent);
        const originalJsonString = JSON.stringify(json);

        function replaceUrlsInJson(obj: any) {
          for (const key in obj) {
            if (typeof obj[key] === 'string') {
               try {
                   // Coba parse string sebagai URL, relatif terhadap target base
                   // Menggunakan targetOrigin untuk base di sini
                   const url = new URL(obj[key], targetOrigin || 'https://default.com'); // Default base jika targetOrigin null
                   // Periksa apakah host URL adalah target host atau subdomainnya
                   if (targetOrigin && (url.origin === targetOrigin || (url.host.endsWith('.' + new URL(target).hostname) && url.origin.startsWith('http')))) {
                        url.host = new URL(canonicalUrl).host; // Ganti host dengan host proxy
                        url.protocol = 'https'; // Pastikan menggunakan https
                        obj[key] = url.toString();
                   } else if (obj[key].startsWith('/') && canonicalOrigin && !obj[key].startsWith('//')) {
                         const url = new URL(obj[key], canonicalOrigin); // Buat URL absolut dengan origin proxy
                         obj[key] = url.toString();
                   } else if (obj[key].startsWith('//') && canonicalOrigin) {
                       const url = new URL(`https:${obj[key]}`);
                       if (targetOrigin && (url.origin === targetOrigin || (url.host.endsWith('.' + new URL(target).hostname)))) {
                            url.host = new URL(canonicalUrl).host;
                            url.protocol = 'https';
                            obj[key] = url.toString();
                       }
                   }
               } catch (e) {
                   // Abaikan jika string bukan URL yang valid
               }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
              replaceUrlsInJson(obj[key]); // Rekursif untuk objek nested
            } else if (Array.isArray(obj[key])) {
                obj[key].forEach(item => {
                    if (typeof item === 'object' && item !== null) {
                         replaceUrlsInJson(item); // Rekursif untuk item array
                    }
                });
            }
          }
        }

        replaceUrlsInJson(json);

        if (JSON.stringify(json) !== originalJsonString) {
             $(el).html(JSON.stringify(json, null, 2)); // Gunakan null, 2 untuk format yang rapi (opsional)
             console.log("[INFO] Modified URLs in JSON-LD script.");
        }

      }
    } catch (e) {
      console.error("[ERROR] Error parsing or modifying JSON-LD script in main.ts:", e);
    }
  });

   // Tambahkan structured data JSON‑LD untuk schema.org (Article) oleh proxy
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "Article",
        "mainEntityOfPage": {
          "@type": "WebPage",
          "@id": canonicalUrl,
        },
        "headline": $("title").text() || "Halaman Artikel",
        "description": $("meta[name='description']").attr("content") || "Akses konten terbaru.",
        "author": {
          "@type": "Organization",
          "name": $("meta[name='author']").attr("content") || "Sumber Konten",
        },
        "publisher": {
          "@type": "Organization",
          "name": "Proxy SEO",
          "logo": {
            "@type": "ImageObject",
            "url": `${canonicalOrigin}/default-logo.png`, // Gunakan origin proxy
             "width": 60,
             "height": 60
          },
        },
        "datePublished": $("meta[property='article:published_time']").attr("content") || new Date().toISOString(),
        "dateModified": $("meta[property='article:modified_time']").attr("content") || new Date().toISOString(),
      };

     // Coba cari logo publisher yang lebih baik dari target site
     const publisherLogo = $('link[rel="apple-touch-icon"]').attr('href') || $('link[rel="icon"]').attr('href');
     if (publisherLogo && targetOrigin) { // Pastikan targetOrigin ada
         try {
              const logoUrl = new URL(publisherLogo, targetOrigin).toString(); // Resolve relatif terhadap targetOrigin
               // Ganti host logo jika mengarah ke targetOrigin
              if (logoUrl.startsWith(targetOrigin)) {
                   structuredData.publisher.logo.url = logoUrl.replace(targetOrigin, canonicalOrigin); // Ganti dengan origin proxy
              } else {
                   structuredData.publisher.logo.url = logoUrl; // Gunakan URL logo apa adanya jika eksternal
              }
              // Coba ambil ukuran logo dari atribut atau default
               const logoImg = $(`img[src="${publisherLogo}"]`); // Cari tag img yang pakai logo ini
               if (logoImg.length > 0) {
                   const width = logoImg.attr('width') || logoImg.attr('realWidth');
                   const height = logoImg.attr('height') || logoImg.attr('realHeight');
                   if(width) structuredData.publisher.logo.width = parseInt(width);
                   if(height) structuredData.publisher.logo.height = parseInt(height);
               } else {
                    structuredData.publisher.logo.width = 192;
                    structuredData.publisher.logo.height = 192;
               }

         } catch (e) {
             console.warn("[WARN] Could not resolve publisher logo URL in main.ts:", publisherLogo, e);
         }
     } else if ($('meta[property="og:image"]').length > 0 && targetOrigin) { // Fallback ke og:image jika ada dan targetOrigin ada
         const ogImage = $('meta[property="og:image"]').attr('content');
         if (ogImage) {
             try {
                 const ogImageUrl = new URL(ogImage, targetOrigin).toString();
                  if (ogImageUrl.startsWith(targetOrigin)) {
                      structuredData.publisher.logo.url = ogImageUrl.replace(targetOrigin, canonicalOrigin);
                  } else {
                       structuredData.publisher.logo.url = ogImageUrl;
                  }
                  structuredData.publisher.logo.width = 200;
                  structuredData.publisher.logo.height = 200;

             } catch (e) {
                 console.warn("[WARN] Could not resolve og:image URL for publisher logo in main.ts:", ogImage, e);
             }
         }
     }


   $("head").append(`<script type="application/ld+json">${JSON.stringify(structuredData, null, 2)}</script>`);
   console.log("[INFO] Added new Article schema.org script by proxy.");


  // Tambahkan lazy loading ke semua tag <img> dan <iframe>
  $("img, iframe").each((_, el) => {
    if (!$(el).attr("loading")) {
      $(el).attr("loading", "lazy");
    }
  });
   console.log("[INFO] Added lazy loading to images and iframes.");


  // Ubah setiap tag yang memiliki atribut href atau src yang mengarah ke target
  const attributesToRewrite = ['href', 'src', 'data-src', 'data-href', 'data-url'];
  $('*').each((_, el) => {
      attributesToRewrite.forEach(attr => {
          const originalValue = $(el).attr(attr);
          if (originalValue) {
              try {
                   // Coba parse nilai atribut sebagai URL, relatif terhadap target base
                   const url = new URL(originalValue, targetOrigin || 'https://default.com'); // Default base

                   // Periksa apakah URL ini mengarah ke targetOrigin atau subdomainnya
                   // Juga pastikan itu bukan link fragmen (#) atau link mailto:
                   if (targetOrigin && (url.origin === targetOrigin || (url.host.endsWith('.' + new URL(target).hostname) && url.origin.startsWith('http'))) && !originalValue.startsWith('#') && !originalValue.startsWith('mailto:')) {
                        url.host = new URL(canonicalUrl).host; // Ganti host dengan host proxy
                        url.protocol = 'https'; // Pastikan menggunakan https
                        $(el).attr(attr, url.toString());
                   } else if (originalValue.startsWith('/') && canonicalOrigin && !originalValue.startsWith('//')) {
                       // Tangani path relatif yang dimulai dengan '/', pastikan bukan URL protokol-agnostik //
                        const url = new URL(originalValue, canonicalOrigin); // Buat URL absolut dengan origin proxy
                         $(el).attr(attr, url.toString());
                   } else if (originalValue.startsWith('//') && canonicalOrigin) {
                       const url = new URL(`https:${originalValue}`);
                       if (targetOrigin && (url.origin === targetOrigin || (url.host.endsWith('.' + new URL(target).hostname)))) {
                            url.host = new URL(canonicalUrl).host;
                            url.protocol = 'https';
                             $(el).attr(attr, url.toString());
                       }
                   }

              } catch (e) {
                  // Abaikan atribut yang nilainya bukan URL yang valid
              }
          }
      });
  });
   console.log("[INFO] Rewrote internal URLs in various attributes.");


  let processedHtml = '';
  try {
    processedHtml = $.html();
  } catch (e) {
    console.error("[ERROR] Failed to serialize HTML with Cheerio in main.ts:", e);
    return html;
  }

  if (!/^<!DOCTYPE\s+/i.test(processedHtml)) {
    processedHtml = "<!DOCTYPE html>\n" + processedHtml;
    console.log("[INFO] Added missing DOCTYPE.");
  }

  console.log("[INFO] HTML transformation finished in main.ts.");
  return processedHtml;
}
