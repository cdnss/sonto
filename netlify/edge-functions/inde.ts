import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

// Konfigurasi melalui environment variable
// Di Netlify Edge Functions, environment variables bisa diakses via Deno.env.get()
const target = Deno.env.get("TARGET_URL") || "https://ww1.anoboy.app";

// Header CORS standar
const corsHeaders = new Headers({
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Origin, X-Requested-With, Content-Type, Accept",
});

/**
 * Fungsi untuk menyaring header request agar tidak mengirimkan header sensitif.
 */
function filterRequestHeaders(headers: Headers): Headers {
  const newHeaders = new Headers();
  const forbidden = [
    "host",
    "connection",
    "x-forwarded-for",
    "cf-connecting-ip",
    "cf-ipcountry",
    "x-real-ip",
    // Tambahkan header lain yang mungkin sensitif
    "cookie", // Hati-hati dengan ini, mungkin diperlukan untuk beberapa situs
    "authorization",
    // "user-agent", // Mungkin perlu di-spoof atau dihapus tergantung target - biarkan jika ingin meneruskan UA asli
  ];
  for (const [key, value] of headers) {
    if (!forbidden.includes(key.toLowerCase())) {
      newHeaders.append(key, value);
    } else {
        console.log(`[INFO] Filtering out header: ${key}`);
    }
  }
   // Opsional: Atur User-Agent default jika dihapus atau ingin menggantinya
   // if (!newHeaders.has('user-agent') || newHeaders.get('user-agent') === '') {
   //    newHeaders.set('user-agent', 'Netlify Edge Function Proxy SEO/1.0');
   // }
  return newHeaders;
}

/**
 * Fungsi transformHTML menerapkan perbaikan SEO:
 *
 * • Memastikan canonicalUrl selalu menggunakan protokol HTTPS.
 * • Menghapus elemen-elemen yang tidak diinginkan (iklan, banner, dsb.).
 * • Menambahkan meta tag (charset, viewport, keywords, description) jika belum ada.
 * • Menambahkan tag canonical dengan canonical URL yang diambil dari request (canonicalUrl).
 * • Menyisipkan structured data JSON‑LD (schema.org) dan memodifikasi yang sudah ada.
 * • Menambahkan atribut lazy loading ke semua tag <img> dan <iframe>.
 * • Mengganti URL yang mengarah ke target site agar menggunakan host proxy (canonicalUrl) pada berbagai atribut (href, src, data-*).
 *
 * @param html - Konten HTML asli.
 * @param canonicalUrl - Canonical URL yang diambil dari request (requestUrl.href).
 * @returns HTML yang telah dimodifikasi.
 */
function transformHTML(html: string, canonicalUrl: string): string {
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
      // Lanjutkan dengan best effort jika target URL tidak valid
      targetOrigin = null;
  }


  // Hapus elemen yang tidak diinginkan
  const unwantedSelectors = [
    ".ads",
    ".advertisement",
    ".banner",
    "#coloma",
    ".iklan",
    ".sidebar a", // Menghapus link di sidebar, mungkin terlalu agresif?
    "#ad_box",
    "#ad_bawah",
    "#judi",
    "#judi2",
    // Tambahan berdasarkan inspeksi HTML anon.txt dan praktik umum:
    'script[src*="ad"], script[src*="analytics"], script[src*="googletagmanager"], script[src*="doubleclick"]',
    'iframe[src*="ad"]',
    'div[class*="ad"], div[id*="ad"]',
    'div[class*="banner"], div[id*="banner"]',
    'link[rel="dns-prefetch"]', // Opsional: mencegah prefetching ke domain iklan/tracking
    'link[rel="shortlink"]', // Opsional: link pendek internal
    'script:contains("adsbygoogle")', // Hapus script yang mengandung teks ini
    'div[data-ad-client], div[data-ad-slot]' // Hapus div elemen Google AdSense
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
      // Opsional: Periksa dan perbaiki deskripsi jika perlu
      const currentDescription = $("meta[name='description']").attr("content");
      if (currentDescription && currentDescription.length < 50) { // Contoh: deskripsi terlalu pendek
           $("head meta[name='description']").attr("content", "Akses konten anime terbaru dengan subtitle Indonesia."); // Ganti dengan default yang lebih baik
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
          // Hapus schema Article yang mungkin dibuat oleh Yoast atau plugin lain
          if (json['@type'] === 'Article' || (json['@graph'] && Array.isArray(json['@graph']) && json['@graph'].some(item => item['@type'] === 'Article'))) {
               $(el).remove();
               console.log("[INFO] Removed existing Article schema.org script.");
          }
      } catch (e) {
          // Abaikan error parsing, biarkan script asli jika tidak bisa diparse
          console.warn("[WARN] Could not parse JSON-LD script for removal:", e);
      }
  });


  // Ganti URL di semua script application/ld+json yang mengarah ke targetOrigin
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const jsonContent = $(el).html();
      if (jsonContent) {
        let json = JSON.parse(jsonContent);
        const originalJsonString = JSON.stringify(json); // Untuk deteksi perubahan

        // Fungsi rekursif untuk mengganti string URL
        function replaceUrlsInJson(obj: any) {
          for (const key in obj) {
            if (typeof obj[key] === 'string') {
              let modified = false;
              // Coba parse string sebagai URL
               try {
                   const url = new URL(obj[key], target); // Coba resolve relatif terhadap target
                   // Periksa apakah host URL adalah target host atau subdomainnya
                   if (targetOrigin && (url.origin === targetOrigin || (url.host.endsWith('.' + new URL(target).hostname) && url.origin.startsWith('http')))) {
                        url.host = new URL(canonicalUrl).host; // Ganti host dengan host proxy
                        url.protocol = 'https'; // Pastikan menggunakan https
                        obj[key] = url.toString();
                        modified = true;
                        //console.log(`[DEBUG] Replaced URL in JSON-LD: ${originalValue} -> ${obj[key]}`);
                   } else if (obj[key].startsWith('/') && canonicalOrigin && !obj[key].startsWith('//')) {
                        // Tangani path relatif jika bukan URL absolut ke targetOrigin
                         const url = new URL(obj[key], canonicalOrigin); // Buat URL absolut dengan origin proxy
                         obj[key] = url.toString();
                         modified = true;
                         //console.log(`[DEBUG] Replaced relative path in JSON-LD: ${originalValue} -> ${obj[key]}`);
                   } else if (obj[key].startsWith('//') && canonicalOrigin) {
                       // Tangani URL protokol-agnostik
                       const url = new URL(`https:${obj[key]}`); // Buat URL absolut dengan https
                       if (targetOrigin && (url.origin === targetOrigin || (url.host.endsWith('.' + new URL(target).hostname)))) {
                            url.host = new URL(canonicalUrl).host;
                            url.protocol = 'https';
                            obj[key] = url.toString();
                            modified = true;
                            // console.log(`[DEBUG] Rewrote protocol-agnostic URL in <${el.tagName} ${attr}>: ${originalValue} -> ${$(el).attr(attr)}`);
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
                    // Penanganan string primitif dalam array sudah dijelaskan sebelumnya, diabaikan untuk kompleksitas
                });
            }
          }
        }

        replaceUrlsInJson(json);

        // Hanya update jika JSON berubah untuk menghindari parsing/stringifying yang tidak perlu
        if (JSON.stringify(json) !== originalJsonString) {
             $(el).html(JSON.stringify(json, null, 2)); // Gunakan null, 2 untuk format yang rapi (opsional)
             console.log("[INFO] Modified URLs in JSON-LD script.");
        }

      }
    } catch (e) {
      console.error("[ERROR] Error parsing or modifying JSON-LD script:", e);
      // Biarkan script aslinya jika ada error
    }
  });

   // Tambahkan structured data JSON‑LD untuk schema.org (Article) oleh proxy
   // Ini ditambahkan terpisah agar selalu ada jika halaman adalah "artikel"
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "Article", // Asumsi halaman adalah artikel. Bisa diperbaiki untuk jenis halaman lain.
        "mainEntityOfPage": {
          "@type": "WebPage",
          "@id": canonicalUrl, // Menggunakan canonicalUrl
        },
        "headline": $("title").text() || "Halaman Artikel", // Judul dari tag <title>
        "description": $("meta[name='description']").attr("content") || "Akses konten terbaru.", // Deskripsi dari meta tag
        // Ambil author jika ada di meta tag atau default
        "author": {
          "@type": "Organization", // Asumsi organisasi, bisa Person jika ada data spesifik
          "name": $("meta[name='author']").attr("content") || "Sumber Konten",
        },
        "publisher": {
          "@type": "Organization",
          "name": "Proxy SEO", // Nama proxy Anda atau situs
          "logo": {
            "@type": "ImageObject",
            // Gunakan logo default atau coba temukan logo di halaman
            "url": `${canonicalOrigin}/default-logo.png`, // Ganti dengan path logo default Anda jika ada
            // Coba ambil ukuran dari atribut atau default
             "width": 60,
             "height": 60
          },
        },
        // Coba ambil tanggal dari meta tag atau gunakan tanggal saat ini
        "datePublished": $("meta[property='article:published_time']").attr("content") || new Date().toISOString(),
        "dateModified": $("meta[property='article:modified_time']").attr("content") || new Date().toISOString(),
      };
     // Coba cari logo publisher yang lebih baik
     const publisherLogo = $('link[rel="apple-touch-icon"]').attr('href') || $('link[rel="icon"]').attr('href');
     if (publisherLogo) {
         try {
              const logoUrl = new URL(publisherLogo, target).toString(); // Resolve relatif terhadap target
               // Ganti host logo jika mengarah ke targetOrigin
              if (targetOrigin && logoUrl.startsWith(targetOrigin)) {
                   structuredData.publisher.logo.url = logoUrl.replace(targetOrigin, canonicalOrigin);
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
                    // Default size jika tidak ditemukan di img tag
                     structuredData.publisher.logo.width = 192;
                     structuredData.publisher.logo.height = 192;
               }

         } catch (e) {
             console.warn("[WARN] Could not resolve publisher logo URL:", publisherLogo, e);
         }
     } else if ($('meta[property="og:image"]').length > 0) {
        // Coba pakai og:image sebagai fallback logo
         const ogImage = $('meta[property="og:image"]').attr('content');
         if (ogImage) {
             try {
                 const ogImageUrl = new URL(ogImage, target).toString();
                  if (targetOrigin && ogImageUrl.startsWith(targetOrigin)) {
                      structuredData.publisher.logo.url = ogImageUrl.replace(targetOrigin, canonicalOrigin);
                  } else {
                       structuredData.publisher.logo.url = ogImageUrl;
                  }
                  // Ukuran og:image biasanya tidak tersedia di meta tag
                  structuredData.publisher.logo.width = 200; // Default size
                  structuredData.publisher.logo.height = 200; // Default size

             } catch (e) {
                 console.warn("[WARN] Could not resolve og:image URL for publisher logo:", ogImage, e);
             }
         }
     }


    // Tambahkan script structured data baru oleh proxy
   $("head").append(`<script type="application/ld+json">${JSON.stringify(structuredData, null, 2)}</script>`);
   console.log("[INFO] Added new Article schema.org script by proxy.");


  // Tambahkan lazy loading ke semua tag <img> dan <iframe>
  $("img, iframe").each((_, el) => {
    if (!$(el).attr("loading")) {
      $(el).attr("loading", "lazy");
      // console.log(`[DEBUG] Added loading="lazy" to ${el.tagName}.`);
    }
  });
   console.log("[INFO] Added lazy loading to images and iframes.");


  // Ubah setiap tag yang memiliki atribut href atau src yang mengarah ke target,
  // sehingga host-nya diganti dengan host dari canonicalUrl.
  // Juga periksa data-* attributes
  const attributesToRewrite = ['href', 'src', 'data-src', 'data-href', 'data-url'];
  $('*').each((_, el) => {
      attributesToRewrite.forEach(attr => {
          const originalValue = $(el).attr(attr);
          if (originalValue) {
              try {
                   // Coba parse nilai atribut sebagai URL, relatif terhadap target base
                   const url = new URL(originalValue, target);

                   // Periksa apakah URL ini mengarah ke targetOrigin atau subdomainnya
                   // Juga pastikan itu bukan link fragmen (#) atau link mailto:
                   if (targetOrigin && (url.origin === targetOrigin || (url.host.endsWith('.' + new URL(target).hostname) && url.origin.startsWith('http'))) && !originalValue.startsWith('#') && !originalValue.startsWith('mailto:')) {
                        // Ganti host dengan host proxy
                        url.host = new URL(canonicalUrl).host;
                        url.protocol = 'https'; // Pastikan menggunakan https
                        $(el).attr(attr, url.toString());
                        // console.log(`[DEBUG] Rewrote URL in <${el.tagName} ${attr}>: ${originalValue} -> ${$(el).attr(attr)}`);
                   } else if (originalValue.startsWith('/') && canonicalOrigin && !originalValue.startsWith('//')) {
                       // Tangani path relatif yang dimulai dengan '/', pastikan bukan URL protokol-agnostik //
                        const url = new URL(originalValue, canonicalOrigin); // Buat URL absolut dengan origin proxy
                         $(el).attr(attr, url.toString());
                         // console.log(`[DEBUG] Rewrote relative path in <${el.tagName} ${attr}>: ${originalValue} -> ${$(el).attr(attr)}`);
                   } else if (originalValue.startsWith('//') && canonicalOrigin) {
                       // Tangani URL protokol-agnostik
                       const url = new URL(`https:${originalValue}`); // Buat URL absolut dengan https
                       if (targetOrigin && (url.origin === targetOrigin || (url.host.endsWith('.' + new URL(target).hostname)))) {
                            url.host = new URL(canonicalUrl).host;
                            url.protocol = 'https';
                             $(el).attr(attr, url.toString());
                            // console.log(`[DEBUG] Rewrote protocol-agnostic URL in <${el.tagName} ${attr}>: ${originalValue} -> ${$(el).attr(attr)}`);
                       }
                   }

              } catch (e) {
                  // Abaikan atribut yang nilainya bukan URL yang valid
                  // console.warn(`[WARN] Could not parse or rewrite attribute "${attr}" with value "${originalValue}":`, e);
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
    // Kembalikan HTML asli jika serialisasi gagal
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
 * Handler untuk Netlify Edge Function.
 * Menerima Request dan Context, mengembalikan Response.
 */
export default async function handler(request: Request, context: any): Promise<Response> {
  // Di Edge Function, URL request sudah mencerminkan domain Edge Function
  const requestUrl = new URL(request.url);
  const canonicalUrl = requestUrl.href; // Gunakan URL request sebagai canonical

   console.log(`[INFO] Edge Function received request: ${request.method} ${request.url}`);
   // console.log("[INFO] Request headers:", request.headers);
   // console.log("[INFO] Context:", context);


  // Tangani preflight CORS (OPTIONS)
  if (request.method === "OPTIONS") {
    console.log("[INFO] Handling CORS preflight request.");
    return new Response(null, { headers: corsHeaders });
  }

  // Bentuk URL target berdasarkan path & query dari request Edge Function
  const targetUrl = new URL(target + requestUrl.pathname + requestUrl.search);
   console.log(`[INFO] Fetching target URL: ${targetUrl.toString()}`);

  try {
    const filteredHeaders = filterRequestHeaders(request.headers);

    // Edge Functions memiliki 'fetch' global yang mirip dengan Deno dan Browser
    const targetResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: filteredHeaders,
      body: request.body, // Teruskan body untuk POST, PUT, dll.
      redirect: 'manual' // Jangan ikuti redirect otomatis, tangani secara manual
    });

    console.log(`[INFO] Received response from target: Status ${targetResponse.status}`);


    // Tangani redirect 3xx jika target merespons dengan redirect
    if (targetResponse.status >= 300 && targetResponse.status < 400 && targetResponse.headers.has('location')) {
        const location = targetResponse.headers.get('location')!;
        console.log(`[INFO] Target responded with redirect to: ${location}`);
        try {
            // Resolve location relatif terhadap URL respons target *atau* request Edge Function
            // Menggunakan request.url sebagai base lebih aman untuk memastikan redirect ke domain proxy
            const redirectedUrl = new URL(location, request.url); // Resolve location relatif terhadap Edge Function URL

            // Periksa apakah URL redirect mengarah kembali ke targetOrigin
            let proxiedRedirectUrl = redirectedUrl.toString();
            if (targetOrigin && (redirectedUrl.origin === targetOrigin || (redirectedUrl.host.endsWith('.' + new URL(target).hostname) && redirectedUrl.origin.startsWith('http')))) {
                 // Ganti host dari URL redirect jika mengarah kembali ke targetOrigin
                 proxiedRedirectUrl = redirectedUrl.toString().replace(targetOrigin, canonicalOrigin);
                 proxiedRedirectUrl = proxiedRedirectUrl.replace('http://', 'https://'); // Pastikan HTTPS
                 console.log(`[INFO] Rewrote redirect URL to proxy host: ${proxiedRedirectUrl}`);
            } else {
                 // Jika redirect ke domain lain atau path relatif yang sudah benar, biarkan apa adanya
                 console.log("[INFO] Redirecting to non-target domain or already relative path, passing through location.");
            }


            const redirectHeaders = new Headers(corsHeaders);
            // Copy relevant headers from target response
            for (const [key, value] of targetResponse.headers) {
                if (key.toLowerCase() === 'location') {
                    redirectHeaders.set(key, proxiedRedirectUrl); // Set location yang sudah dimodifikasi
                } else if (key.toLowerCase() !== "content-encoding" && key.toLowerCase() !== "content-length") {
                     redirectHeaders.set(key, value);
                }
            }

            return new Response(null, {
                status: targetResponse.status,
                statusText: targetResponse.statusText,
                headers: redirectHeaders,
            });

        } catch (e) {
            console.error("[ERROR] Failed to process redirect location:", location, e);
             // Fallback: return original redirect response
             const responseHeaders = new Headers(corsHeaders);
             for (const [key, value] of targetResponse.headers) {
                 if (key.toLowerCase() !== "content-encoding" && key.toLowerCase() !== "content-length") {
                    responseHeaders.set(key, value);
                 }
             }
            return new Response(targetResponse.body, {
                status: targetResponse.status,
                statusText: targetResponse.statusText,
                headers: responseHeaders,
            });
        }
    }


    const contentType = targetResponse.headers.get("content-type") || "";
    console.log(`[INFO] Target response Content-Type: ${contentType}`);

    if (contentType.includes("text/html")) {
      const htmlContent = await targetResponse.text();
      console.log("[INFO] Processing HTML content.");
      const modifiedHtml = transformHTML(htmlContent, canonicalUrl);
      const responseHeaders = new Headers(corsHeaders);
      // Copy relevant headers from target response, excluding content-specific ones
       for (const [key, value] of targetResponse.headers) {
           if (key.toLowerCase() !== "content-encoding" && key.toLowerCase() !== "content-length" && key.toLowerCase() !== "content-type") {
               responseHeaders.set(key, value);
           }
       }
      responseHeaders.set("Content-Type", "text/html; charset=utf-8");
      return new Response(modifiedHtml, {
        status: targetResponse.status,
        statusText: targetResponse.statusText,
        headers: responseHeaders,
      });
    } else {
      // Untuk aset non-HTML, teruskan body dan sebagian besar header
      console.log("[INFO] Proxying non-HTML content.");
      const responseHeaders = new Headers(corsHeaders);
      for (const [key, value] of targetResponse.headers) {
        // Hindari content-encoding dan content-length karena body mungkin diubah (misal kompresi)
        if (key.toLowerCase() === "content-encoding" || key.toLowerCase() === "content-length") {
            console.log(`[INFO] Skipping content header: ${key}`);
            continue;
        }
         // Jika ini aset CSS/JS, kita bisa pertimbangkan untuk memodifikasinya di sini
         // Namun, itu akan menambah kompleksitas yang signifikan (parsing CSS/JS)
         // Untuk saat ini, teruskan apa adanya. URL di HTML/JSON-LD sudah ditangani.
        responseHeaders.set(key, value);
      }

      // Edge Functions memerlukan Response body sebagai ReadableStream, ArrayBuffer, Blob, FormData, string, atau URLSearchParams
      // targetResponse.body adalah ReadableStream, jadi bisa langsung digunakan
      return new Response(targetResponse.body, {
        status: targetResponse.status,
        statusText: targetResponse.statusText,
        headers: responseHeaders,
      });
    }
  } catch (error) {
    console.error("[ERROR] Error fetching or processing target:", error);
    // Pastikan response error juga memiliki header CORS
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
}
