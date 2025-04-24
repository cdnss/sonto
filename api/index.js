// Import dependency npm
// 'node-fetch' diperlukan untuk fungsi fetch di lingkungan Node.js
import fetch from 'node-fetch';
import * as cheerio from 'cheerio'; // Cheerio diinstal via npm

// Konfigurasi melalui environment variable
// Di lingkungan Node.js, environment variables diakses via process.env
const target = process.env.TARGET_URL || "https://ww1.anoboy.app";

// Header CORS standar
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Origin, X-Requested-With, Content-Type, Accept",
};

/**
 * Fungsi untuk menyaring header request agar tidak mengirimkan header sensitif.
 * Di Vercel, headers request sudah diproses oleh Vercel, tapi filter ini bisa tetap relevan.
 */
function filterRequestHeaders(headers) {
  const newHeaders = new Headers();
  const forbidden = [
    "host",
    "connection",
    // Header Vercel yang mungkin ingin dihapus sebelum forward
    "x-forwarded-for",
    "x-real-ip",
    "x-vercel-ip-city",
    "x-vercel-ip-country",
    "x-vercel-ip-country-region",
    "x-vercel-ip-latitude",
    "x-vercel-ip-longitude",
    "x-vercel-ip-timezone",
    "x-vercel-forwarded-for",
    // Header sensitif lainnya
    "cookie",
    "authorization",
    // "user-agent", // Biarkan jika ingin meneruskan UA asli
  ];

  // Headers di objek req Vercel mungkin berbeda formatnya (misal Plain Object atau IncomingMessage headers)
  // Iterasi melalui keys jika itu objek biasa
  if (typeof headers.forEach !== 'function') {
      for (const key in headers) {
          if (!forbidden.includes(key.toLowerCase())) {
              newHeaders.append(key, headers[key]);
          } else {
              console.log(`[INFO] Filtering out header: ${key}`);
          }
      }
  } else {
      // Jika ini adalah instance Headers (kurang umum di req Vercel standar)
      headers.forEach((value, key) => {
           if (!forbidden.includes(key.toLowerCase())) {
              newHeaders.append(key, value);
          } else {
               console.log(`[INFO] Filtering out header: ${key}`);
           }
      });
  }


   // Opsional: Atur User-Agent default jika dihapus atau ingin menggantinya
   // if (!newHeaders.has('user-agent') || newHeaders.get('user-agent') === '') {
   //    newHeaders.set('user-agent', 'Vercel Serverless Proxy SEO/1.0');
   // }

  return newHeaders;
}

/**
 * Fungsi transformHTML menerapkan perbaikan SEO.
 * Logika inti Cheerio dan penulisan ulang URL sebagian besar tetap sama.
 */
function transformHTML(html, canonicalUrl) {
  console.log(`[INFO] Starting HTML transformation for canonicalUrl: ${canonicalUrl}`);
  // Pastikan canonicalUrl diawali dengan 'https://'
  if (!canonicalUrl.startsWith("https://")) {
    canonicalUrl = "https://" + canonicalUrl.replace(/^https?:\/\//, "");
    console.log(`[INFO] Corrected canonicalUrl to HTTPS: ${canonicalUrl}`);
  }

  let $;
  try {
    $ = cheerio.load(html);
  } catch (e) {
    console.error("[ERROR] Failed to load HTML with Cheerio:", e);
    // Kembalikan HTML asli jika parsing gagal
    return html;
  }

  const canonicalOrigin = new URL(canonicalUrl).origin;
  let targetOrigin;
  try {
      targetOrigin = new URL(target).origin;
  } catch (e) {
      console.error("[ERROR] Invalid target URL:", target, e);
      targetOrigin = null;
  }


  // Hapus elemen yang tidak diinginkan
  const unwantedSelectors = [
    ".ads",
    ".advertisement",
    ".banner",
    "#coloma",
    ".iklan",
    ".sidebar a",
    "#ad_box",
    "#ad_bawah",
    "#judi",
    "#judi2",
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
          console.error(`[ERROR] Error removing elements with selector "${selector}":`, e);
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
   // Hapus script schema.org Article yang lama jika ada, sebelum menambah yang baru oleh proxy
  $('script[type="application/ld+json"]').each((_, el) => {
      try {
          const json = JSON.parse($(el).html() || '');
          if (json['@type'] === 'Article' || (json['@graph'] && Array.isArray(json['@graph']) && json['@graph'].some(item => item['@type'] === 'Article'))) {
               $(el).remove();
               console.log("[INFO] Removed existing Article schema.org script.");
          }
      } catch (e) {
          console.warn("[WARN] Could not parse JSON-LD script for removal:", e);
      }
  });


  // Ganti URL di semua script application/ld+json yang mengarah ke targetOrigin
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const jsonContent = $(el).html();
      if (jsonContent) {
        let json = JSON.parse(jsonContent);
        const originalJsonString = JSON.stringify(json);

        function replaceUrlsInJson(obj) {
          for (const key in obj) {
            if (typeof obj[key] === 'string') {
               try {
                   const url = new URL(obj[key], target);
                   if (targetOrigin && (url.origin === targetOrigin || (url.host.endsWith('.' + new URL(target).hostname) && url.origin.startsWith('http')))) {
                        url.host = new URL(canonicalUrl).host;
                        url.protocol = 'https';
                        obj[key] = url.toString();
                   } else if (obj[key].startsWith('/') && canonicalOrigin && !obj[key].startsWith('//')) {
                         const url = new URL(obj[key], canonicalOrigin);
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
               }
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
              replaceUrlsInJson(obj[key]);
            } else if (Array.isArray(obj[key])) {
                obj[key].forEach(item => {
                    if (typeof item === 'object' && item !== null) {
                         replaceUrlsInJson(item);
                    }
                });
            }
          }
        }

        replaceUrlsInJson(json);

        if (JSON.stringify(json) !== originalJsonString) {
             $(el).html(JSON.stringify(json, null, 2));
             console.log("[INFO] Modified URLs in JSON-LD script.");
        }

      }
    } catch (e) {
      console.error("[ERROR] Error parsing or modifying JSON-LD script:", e);
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
            "url": `${canonicalOrigin}/default-logo.png`,
             "width": 60,
             "height": 60
          },
        },
        "datePublished": $("meta[property='article:published_time']").attr("content") || new Date().toISOString(),
        "dateModified": $("meta[property='article:modified_time']").attr("content") || new Date().toISOString(),
      };

     const publisherLogo = $('link[rel="apple-touch-icon"]').attr('href') || $('link[rel="icon"]').attr('href');
     if (publisherLogo) {
         try {
              const logoUrl = new URL(publisherLogo, target).toString();
              if (targetOrigin && logoUrl.startsWith(targetOrigin)) {
                   structuredData.publisher.logo.url = logoUrl.replace(targetOrigin, canonicalOrigin);
              } else {
                   structuredData.publisher.logo.url = logoUrl;
              }
               const logoImg = $(`img[src="${publisherLogo}"]`);
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
             console.warn("[WARN] Could not resolve publisher logo URL:", publisherLogo, e);
         }
     } else if ($('meta[property="og:image"]').length > 0) {
         const ogImage = $('meta[property="og:image"]').attr('content');
         if (ogImage) {
             try {
                 const ogImageUrl = new URL(ogImage, target).toString();
                  if (targetOrigin && ogImageUrl.startsWith(targetOrigin)) {
                      structuredData.publisher.logo.url = ogImageUrl.replace(targetOrigin, canonicalOrigin);
                  } else {
                       structuredData.publisher.logo.url = ogImageUrl;
                  }
                  structuredData.publisher.logo.width = 200;
                  structuredData.publisher.logo.height = 200;

             } catch (e) {
                 console.warn("[WARN] Could not resolve og:image URL for publisher logo:", ogImage, e);
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
                   const url = new URL(originalValue, target);

                   if (targetOrigin && (url.origin === targetOrigin || (url.host.endsWith('.' + new URL(target).hostname) && url.origin.startsWith('http')))) {
                        url.host = new URL(canonicalUrl).host;
                        url.protocol = 'https';
                        $(el).attr(attr, url.toString());
                   } else if (originalValue.startsWith('/') && canonicalOrigin && !originalValue.startsWith('//')) {
                        const url = new URL(originalValue, canonicalOrigin);
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
              }
          }
      });
  });
   console.log("[INFO] Rewrote internal URLs in various attributes.");


  let processedHtml = '';
  try {
    processedHtml = $.html();
  } catch (e) {
    console.error("[ERROR] Failed to serialize HTML with Cheerio:", e);
    return html;
  }

  if (!/^<!DOCTYPE\s+/i.test(processedHtml)) {
    processedHtml = "<!DOCTYPE html>\n" + processedHtml;
    console.log("[INFO] Added missing DOCTYPE.");
  }

  console.log("[INFO] HTML transformation finished.");
  return processedHtml;
}

/**
 * Handler untuk Vercel Serverless Function.
 * Menerima request dan response object Node.js.
 */
export default async function handler(req, res) {
  // Di Vercel, host dan URL bisa diambil dari objek request
  const host = req.headers.host;
  // URL request lengkap bisa direkonstruksi
  const requestUrl = new URL(req.url, `https://${host}`);
  const canonicalUrl = requestUrl.href;

   console.log(`[INFO] Vercel Function received request: ${req.method} ${req.url} from host ${host}`);
   // console.log("[INFO] Request headers:", req.headers);


  // Tangani preflight CORS (OPTIONS)
  if (req.method === "OPTIONS") {
    console.log("[INFO] Handling CORS preflight request.");
    res.writeHead(204, corsHeaders); // 204 No Content untuk preflight
    res.end();
    return; // Penting untuk menghentikan eksekusi
  }

  // Bentuk URL target berdasarkan path & query dari request Vercel
  const targetUrl = new URL(target + requestUrl.pathname + requestUrl.search);
   console.log(`[INFO] Fetching target URL: ${targetUrl.toString()}`);

  try {
    // Filter header dari request Vercel (objek headers mungkin bukan instance Headers)
    const filteredHeaders = filterRequestHeaders(req.headers);

    // Opsi fetch untuk request target
    const fetchOptions = {
        method: req.method,
        headers: filteredHeaders,
        // Untuk body request POST/PUT, perlu membaca stream request
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined, // req objek adalah stream Readable
        redirect: 'manual' // Tangani redirect manual
    };

     // Jika body adalah stream, pastikan tidak di set untuk GET/HEAD
     if (fetchOptions.body === req && (req.method === 'GET' || req.method === 'HEAD')) {
         delete fetchOptions.body;
     }


    const targetResponse = await fetch(targetUrl.toString(), fetchOptions);

    console.log(`[INFO] Received response from target: Status ${targetResponse.status}`);


    // Tangani redirect 3xx jika target merespons dengan redirect
    if (targetResponse.status >= 300 && targetResponse.status < 400 && targetResponse.headers.has('location')) {
        const location = targetResponse.headers.get('location');
         if (!location) {
             console.error("[ERROR] Redirect response missing Location header.");
              // Fallback ke error 500 jika redirect invalid
             res.writeHead(500, corsHeaders);
             res.end("Internal Server Error: Invalid redirect response");
             return;
         }
        console.log(`[INFO] Target responded with redirect to: ${location}`);
        try {
            // Resolve location relatif terhadap URL request Vercel (canonicalUrl)
            const redirectedUrl = new URL(location, canonicalUrl);

            let proxiedRedirectUrl = redirectedUrl.toString();
            // Periksa apakah URL redirect mengarah kembali ke targetOrigin
             if (targetOrigin && (redirectedUrl.origin === targetOrigin || (redirectedUrl.host.endsWith('.' + new URL(target).hostname) && redirectedUrl.origin.startsWith('http')))) {
                 // Ganti host dari URL redirect jika mengarah kembali ke targetOrigin
                 proxiedRedirectUrl = redirectedUrl.toString().replace(targetOrigin, canonicalOrigin);
                 proxiedRedirectUrl = proxiedRedirectUrl.replace('http://', 'https://'); // Pastikan HTTPS
                 console.log(`[INFO] Rewrote redirect URL to proxy host: ${proxiedRedirectUrl}`);
            } else {
                 console.log("[INFO] Redirecting to non-target domain or already relative path, passing through location.");
            }


            // Set status redirect dan header Location
            res.writeHead(targetResponse.status, {
                ...corsHeaders, // Gabungkan dengan CORS headers
                 'Location': proxiedRedirectUrl,
                 // Salin header lain yang relevan dari targetResponse jika perlu
                 // for (const [key, value] of targetResponse.headers) { ... }
            });
            res.end(); // Akhiri response
            return; // Penting untuk menghentikan eksekusi

        } catch (e) {
            console.error("[ERROR] Failed to process redirect location:", location, e);
             // Fallback: return original redirect response
             res.writeHead(targetResponse.status, {
                 ...corsHeaders,
                 'Location': location // Gunakan lokasi asli
                 // Salin header lain jika perlu
             });
             res.end();
             return;
        }
    }


    const contentType = targetResponse.headers.get("content-type") || "";
    console.log(`[INFO] Target response Content-Type: ${contentType}`);

    // Salin header dari targetResponse ke Vercel response
    const responseHeaders = { ...corsHeaders }; // Mulai dengan CORS
     targetResponse.headers.forEach((value, key) => {
         const lowerKey = key.toLowerCase();
         // Salin semua header kecuali yang dikelola Vercel atau CORS, dan content-specific
         if (lowerKey !== "content-encoding" && lowerKey !== "content-length" && lowerKey !== "content-type" && !corsHeaders.hasOwnProperty(lowerKey)) {
             responseHeaders[key] = value;
         }
     });


    if (contentType.includes("text/html")) {
      const htmlContent = await targetResponse.text();
      console.log("[INFO] Processing HTML content.");
      const modifiedHtml = transformHTML(htmlContent, canonicalUrl);

      responseHeaders['Content-Type'] = "text/html; charset=utf-8";

      res.writeHead(targetResponse.status, responseHeaders);
      res.end(modifiedHtml); // Kirim HTML yang sudah dimodifikasi
      console.log("[INFO] Sent modified HTML response.");

    } else {
      // Untuk aset non-HTML, teruskan body sebagai stream atau buffer
      console.log("[INFO] Proxying non-HTML content.");

       responseHeaders['Content-Type'] = contentType; // Tetapkan Content-Type asli

      res.writeHead(targetResponse.status, responseHeaders);
      // Pipe stream body dari targetResponse ke response Vercel
      if (targetResponse.body) {
           targetResponse.body.pipe(res); // Mengalirkan body response
           console.log("[INFO] Piped non-HTML response body.");
      } else {
           res.end(); // Kirim response kosong jika tidak ada body
           console.log("[INFO] Sent non-HTML response with no body.");
      }
    }
  } catch (error) {
    console.error("[ERROR] Error fetching or processing target:", error);
     // Pastikan response error juga memiliki header CORS
    res.writeHead(500, corsHeaders);
    res.end("Internal Server Error");
     console.log("[INFO] Sent 500 error response.");
  }
}
