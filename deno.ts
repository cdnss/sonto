// File: server.ts

// Import dependencies
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12"; // Import cheerio for HTML processing
import { filterRequestHeaders, transformHTML } from './main.ts'; // Import transformation functions

// Konfigurasi target URL dari Environment Variable atau nilai default
// Gunakan URL yang diminta
const defaultTarget = Deno.env.get("DEFAULT_TARGET_URL") || "https://www.example.com";
const animeTarget = Deno.env.get("ANIME_TARGET_URL") || "https://ww1.anoboy.app";
const moviesTarget = Deno.env.get("MOVIES_TARGET_URL") || "https://tv4.lk21official.cc";

// Header CORS
const corsHeaders = new Headers({
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Origin, X-Requested-With, Content-Type, Accept, Range, Authorization", // Tambahkan Authorization jika mungkin diperlukan oleh klien ke proxy
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS" // Tambahkan metode yang diizinkan
});

// Handler untuk Deno Deploy (Request Listener)
Deno.serve({ port: 8080 }, async (request: Request) => {
    const requestUrl = new URL(request.url);
    const canonicalUrl = requestUrl.href; // URL proxy Anda sendiri

    console.log(`[INFO] Deno Deploy received request: ${request.method} ${requestUrl.pathname}`);

    // --- Log permintaan POST untuk debugging (opsional, bisa dihapus nanti) ---
    if (request.method === 'POST' && requestUrl.pathname.includes('api.php')) {
        console.log(`[DEBUG] Handling POST request to potential API endpoint: ${requestUrl.pathname}${requestUrl.search}`);
        console.log("[DEBUG] Original Request Headers:");
        for (const [key, value] of request.headers) {
            console.log(`[DEBUG]   ${key}: ${value}`);
        }
    }
    // --- Akhir Log Debugging ---


    // Tangani preflight CORS (OPTIONS)
    if (request.method === "OPTIONS") {
        console.log("[INFO] Handling CORS preflight request.");
        return new Response(null, { status: 204, headers: corsHeaders }); // 204 No Content for OPTIONS
    }

    let selectedTargetUrl: string | undefined;
    let targetPathname: string = requestUrl.pathname;
    let targetType: 'anime' | 'movies' | 'default' | 'proxy' | 'static' = 'default';

    // --- Logika Routing Berdasarkan Pathname ---
    if (requestUrl.pathname === '/') {
        console.log("[INFO] Serving default homepage.");
        targetType = 'static'; // Tipe statis
        // Hasilkan HTML statis untuk halaman default
        const homepageHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Selamat Datang di Proxy Content</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <style>
        body {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background-color: #f8f9fa;
            text-align: center;
        }
        .container {
            background-color: #ffffff;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
    </style>
</head>
<body>
    <div class="container">
        <h1 class="mb-4">Selamat Datang!</h1>
        <p class="lead mb-4">Pilih konten yang ingin Anda akses:</p>
        <div class="d-grid gap-3 col-md-6 mx-auto">
            <a href="/anime" class="btn btn-primary btn-lg">Akses Konten Anime</a>
            <a href="/movies" class="btn btn-secondary btn-lg">Akses Konten Movies</a>
             <p class="mt-4">Atau coba endpoint proxy:</p>
             <p><code>/proxy?url=https://example.com/some/path</code></p>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
        `;
        const responseHeaders = new Headers(corsHeaders);
        responseHeaders.set("Content-Type", "text/html; charset=utf-8");
        return new Response(homepageHtml, { status: 200, headers: responseHeaders });

    } else if (requestUrl.pathname === '/proxy') { // <-- TANGANI RUTE /proxy
        console.log("[INFO] Handling /proxy request.");
        targetType = 'proxy'; // Set tipe target

        const targetUrlParam = requestUrl.searchParams.get('url');
        const responseTypeParam = requestUrl.searchParams.get('type');
        const returnAsHtml = responseTypeParam === 'html';

        if (!targetUrlParam) {
            console.log("[WARN] /proxy request missing 'url' parameter.");
            const errorResponse = { error: "Missing 'url' query parameter." };
            const responseHeaders = new Headers(corsHeaders);
            responseHeaders.set("Content-Type", "application/json");
            return new Response(JSON.stringify(errorResponse), { status: 400, headers: responseHeaders });
        }

        let fetchTargetUrl: URL;
        try {
            fetchTargetUrl = new URL(targetUrlParam);
            console.log(`[INFO] Proxying URL from parameter: ${fetchTargetUrl.toString()}`);
        } catch (e) {
            console.log(`[WARN] Invalid URL parameter: ${targetUrlParam}`, e);
            const errorResponse = { error: "Invalid URL provided." };
            const responseHeaders = new Headers(corsHeaders);
            responseHeaders.set("Content-Type", "application/json");
            return new Response(JSON.stringify(errorResponse), { status: 400, headers: responseHeaders });
        }

        try {
            const filteredHeaders = filterRequestHeaders(request.headers);

            // --- Setel Origin dan Referer ke domain target UNTUK RUTE /proxy ---
            try {
                const targetOrigin = fetchTargetUrl.origin;
                 // Pastikan header Origin/Referer asli dihapus sebelum diset nilai spoofing
                 filteredHeaders.delete('Origin');
                 filteredHeaders.delete('Referer');
                 filteredHeaders.set('Origin', targetOrigin);
                 filteredHeaders.set('Referer', fetchTargetUrl.toString());
                 console.log(`[INFO] Spoofing Origin for /proxy: ${targetOrigin}`);
                 console.log(`[INFO] Spoofing Referer for /proxy: ${fetchTargetUrl.toString()}`);

            } catch (e) {
                console.warn(`[WARN] Failed to set Origin/Referer headers for /proxy ${fetchTargetUrl.toString()}:`, e);
            }
            // --- AKHIR Setel Origin dan Referer untuk /proxy ---


            console.log(`[INFO] Headers being sent to target (${fetchTargetUrl.toString()}):`);
            for (const [key, value] of filteredHeaders) {
                console.log(`[INFO]   ${key}: ${value}`);
            }


            const proxyResponse = await fetch(fetchTargetUrl.toString(), {
                method: request.method,
                headers: filteredHeaders,
                body: request.body,
                redirect: 'manual'
            });

            console.log(`[INFO] Received response from proxied URL: Status ${proxyResponse.status}`);

            // --- Penanganan Redirect untuk /proxy ---
             if (proxyResponse.status >= 300 && proxyResponse.status < 400 && proxyResponse.headers.has('location')) {
                 const location = proxyResponse.headers.get('location');
                 if (location) {
                      console.log(`[INFO] Proxy target responded with redirect to: ${location}`);
                      try {
                          // Resolve URL redirect relatif terhadap URL target yang di-fetch
                          const redirectedUrl = new URL(location, fetchTargetUrl);
                          const canonicalOrigin = new URL(canonicalUrl).origin;

                          // Tulis ulang URL redirect agar mengarah kembali ke endpoint /proxy?type=html&url=...
                          // Pastikan redirect ini hanya dilakukan jika type=html diminta
                          const proxiedRedirectUrl = returnAsHtml ?
                            `${canonicalOrigin}/proxy?type=html&url=${encodeURIComponent(redirectedUrl.toString())}` :
                            redirectedUrl.toString(); // Jika tidak type=html, biarkan redirect asli (setelah resolved)

                          console.log(`[INFO] Rewrote /proxy redirect URL to: ${proxiedRedirectUrl}`);

                          const redirectHeaders = new Headers(corsHeaders);
                           for (const [key, value] of proxyResponse.headers) {
                             const lowerKey = key.toLowerCase();
                             if (lowerKey !== "content-encoding" && lowerKey !== "content-length" && lowerKey !== "location") {
                                 redirectHeaders.set(key, value);
                             }
                           }
                           if (proxiedRedirectUrl) {
                                redirectHeaders.set('Location', proxiedRedirectUrl); // Set header Location yang sudah ditulis ulang
                           }


                          return new Response(null, {
                             status: proxyResponse.status,
                             statusText: proxyResponse.statusText,
                             headers: redirectHeaders,
                          });

                      } catch (e) {
                         console.error(`[ERROR] Failed to process /proxy redirect location (${location}):`, e);
                         // Fallback: kembalikan respons redirect asli dengan header aslinya (kecuali Location dihapus di filterRequestHeaders jika perlu)
                         const responseHeaders = new Headers(corsHeaders);
                          for (const [key, value] of proxyResponse.headers) {
                             const lowerKey = key.toLowerCase();
                             if (lowerKey !== "content-encoding" && lowerKey !== "content-length") {
                                 // Jangan hapus Location di sini, biarkan yang asli jika proses rewrite gagal
                                  responseHeaders.set(key, value);
                             }
                           }
                          return new Response(proxyResponse.body, {
                             status: proxyResponse.status,
                             statusText: proxyResponse.statusText,
                             headers: responseHeaders,
                          });
                      }
                 } else {
                     console.warn("[WARN] /proxy redirect response missing Location header.");
                      // Kembalikan respons asli jika header Location hilang
                      const responseHeaders = new Headers(corsHeaders);
                       for (const [key, value] of proxyResponse.headers) {
                          const lowerKey = key.toLowerCase();
                          if (lowerKey !== "content-encoding" && lowerKey !== "content-length") {
                               responseHeaders.set(key, value);
                          }
                        }
                       return new Response(proxyResponse.body, {
                          status: proxyResponse.status,
                          statusText: proxyResponse.statusText,
                          headers: responseHeaders,
                       });
                 }
             }
            // --- Akhir Penanganan Redirect untuk /proxy ---


            const contentType = proxyResponse.headers.get("content-type") || "";
            console.log(`[INFO] Proxied response Content-Type: ${contentType}`);


            if (returnAsHtml) { // Jika klien meminta HTML (type=html)
                // Hanya proses sebagai HTML jika Content-Type respons target adalah HTML
                if (contentType.includes("text/html")) {
                    const htmlContent = await proxyResponse.text();
                    console.log("[INFO] Processing proxied HTML content with transformHTML (type='proxy').");

                    // Panggil transformHTML dengan targetType 'proxy'
                    const modifiedHtml = transformHTML(htmlContent, canonicalUrl, new URL(fetchTargetUrl).origin, fetchTargetUrl.toString(), 'proxy');

                    const responseHeaders = new Headers(corsHeaders);
                    // Salin header dari respons target, kecuali beberapa
                    for (const [key, value] of proxyResponse.headers) {
                        const lowerKey = key.toLowerCase();
                        // Lewati content-encoding, content-length, content-type, dan location
                        if (lowerKey !== "content-encoding" && lowerKey !== "content-length" && lowerKey !== "content-type" && lowerKey !== "location") {
                            responseHeaders.set(key, value);
                        }
                    }
                    responseHeaders.set("Content-Type", "text/html; charset=utf-8"); // Set Content-Type ke HTML
                    return new Response(modifiedHtml, {
                        status: proxyResponse.status,
                        statusText: proxyResponse.statusText,
                        headers: responseHeaders,
                    });
                } else {
                    // Jika type=html tapi respons target bukan HTML, kembalikan apa adanya (atau error?)
                    console.warn(`[WARN] Requested type=html for ${targetUrlParam}, but target responded with Content-Type: ${contentType}. Returning raw response.`);
                     // Salin header dari respons target, kecuali beberapa
                     const responseHeaders = new Headers(corsHeaders);
                    for (const [key, value] of proxyResponse.headers) {
                        const lowerKey = key.toLowerCase();
                        // Lewati content-encoding, content-length, dan location
                        if (lowerKey !== "content-encoding" && lowerKey !== "content-length" && lowerKey !== "location") {
                            responseHeaders.set(key, value);
                        }
                    }
                    return new Response(proxyResponse.body, { // Kembalikan body stream asli
                        status: proxyResponse.status,
                        statusText: proxyResponse.statusText,
                        headers: responseHeaders, // Gunakan header asli (kecuali yang difilter)
                    });
                }

            } else { // Jika klien tidak meminta HTML (default: JSON)
                const content = await proxyResponse.text(); // Baca body sebagai teks untuk dimasukkan ke JSON
                // Bentuk respons JSON
                const jsonResponse = { contents: content };

                // Siapkan header untuk respons JSON
                const responseHeaders = new Headers(corsHeaders);
                // Tambahkan header lain dari respons proxy kecuali content-encoding/length dan location
                for (const [key, value] of proxyResponse.headers) {
                    const lowerKey = key.toLowerCase();
                    if (lowerKey !== 'content-encoding' && lowerKey !== 'content-length' && lowerKey !== 'location') {
                         responseHeaders.set(key, value);
                    }
                }
                responseHeaders.set("Content-Type", "application/json");

                console.log(`[INFO] Successfully fetched content from ${targetUrlParam}, returning JSON.`);

                // Kembalikan respons JSON
                return new Response(JSON.stringify(jsonResponse), {
                    status: 200, // Status 200 OK jika fetch berhasil
                    statusText: proxyResponse.statusText,
                    headers: responseHeaders,
                });
            }

        } catch (error) {
            console.error(`[ERROR] Failed to fetch URL ${targetUrlParam}:`, error);
            const errorResponse = { error: `Failed to fetch URL: ${error.message || error}` };
            const responseHeaders = new Headers(corsHeaders);
            responseHeaders.set("Content-Type", "application/json");
            return new Response(JSON.stringify(errorResponse), { status: 500, headers: responseHeaders });
        }


    } else if (requestUrl.pathname.startsWith('/anime')) {
        selectedTargetUrl = animeTarget;
        targetType = 'anime';
        const targetPathnameRaw = requestUrl.pathname.substring('/anime'.length);
        targetPathname = targetPathnameRaw === '' ? '/' : targetPathnameRaw;
        console.log(`[INFO] Routing to ANIME target (${selectedTargetUrl}) for path: ${requestUrl.pathname}`);

    } else if (requestUrl.pathname.startsWith('/movies')) {
        selectedTargetUrl = moviesTarget;
        targetType = 'movies';
        const targetPathnameRaw = requestUrl.pathname.substring('/movies'.length);
        targetPathname = targetPathnameRaw === '' ? '/' : targetPathnameRaw;
        console.log(`[INFO] Routing to MOVIES target (${selectedTargetUrl}) for path: ${requestUrl.pathname}`);

    } else {
        selectedTargetUrl = defaultTarget;
        targetType = 'default';
        targetPathname = requestUrl.pathname;
        console.log(`[INFO] Routing to DEFAULT target (${selectedTargetUrl}) for path: ${requestUrl.pathname}`);
    }
    // --- Akhir Logika Routing ---

    // Jika bukan homepage statis atau rute /proxy, lanjutkan proses proxying normal
    // Blok ini menangani 'anime', 'movies', 'default'
    if (targetType !== 'static' && targetType !== 'proxy') {
        try {
            if (!selectedTargetUrl) {
                console.error("[ERROR] selectedTargetUrl is undefined for non-static/proxy type.");
                return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
            }

            const targetOrigin = new URL(selectedTargetUrl).origin; // Gunakan selectedTargetUrl untuk origin

            // Bentuk URL target untuk fetch
            const targetUrl = new URL(selectedTargetUrl + targetPathname + requestUrl.search);
            console.log(`[INFO] Fetching target URL: ${targetUrl.toString()} for type ${targetType}`);

            const filteredHeaders = filterRequestHeaders(request.headers);

            // --- Setel Origin dan Referer ke domain target UNTUK RUTE LAIN ---
            try {
                 const currentTargetOrigin = new URL(selectedTargetUrl).origin;
                 // Pastikan header Origin/Referer asli dihapus sebelum diset nilai spoofing
                 filteredHeaders.delete('Origin');
                 filteredHeaders.delete('Referer');
                 filteredHeaders.set('Origin', currentTargetOrigin);
                 filteredHeaders.set('Referer', targetUrl.toString()); // Set Referer ke URL target yang di-fetch
                 console.log(`[INFO] Spoofing Origin for ${targetType}: ${currentTargetOrigin}`);
                 console.log(`[INFO] Spoofing Referer for ${targetType}: ${targetUrl.toString()}`);

            } catch (e) {
                 console.warn(`[WARN] Failed to set Origin/Referer headers for ${targetType} ${targetUrl.toString()}:`, e);
                 // Lanjutkan tanpa set header jika ada error
            }
            // --- AKHIR Setel Origin dan Referer untuk RUTE LAIN ---


            console.log(`[INFO] Headers being sent to target (${targetUrl.toString()}):`);
            for (const [key, value] of filteredHeaders) {
                console.log(`[INFO]   ${key}: ${value}`);
            }


            const targetResponse = await fetch(targetUrl.toString(), {
                method: request.method,
                headers: filteredHeaders,
                body: request.body,
                redirect: 'manual'
            });

            console.log(`[INFO] Received response from target: Status ${targetResponse.status} for type ${targetType}`);


            // --- Logika Penanganan Redirect 3xx (untuk anime, movies, default) ---
             if (targetResponse.status >= 300 && targetResponse.status < 400 && targetResponse.headers.has('location')) {
                 const location = targetResponse.headers.get('location');
                 if (!location) {
                     console.error("[ERROR] Redirect response missing Location header.");
                     const errorHeaders = new Headers(corsHeaders);
                     return new Response("Internal Server Error: Invalid redirect response", { status: 500, headers: errorHeaders });
                 }
                 console.log(`[INFO] Target responded with redirect to: ${location}`);
                 let proxiedRedirectUrl: string | null = null;

                 try {
                      // Resolve location relatif terhadap URL target saat ini
                     const redirectedUrl = new URL(location, targetUrl); // <-- resolve terhadap targetUrl yg sedang di-fetch
                     const currentTargetOrigin = new URL(selectedTargetUrl).origin;
                     const canonicalOrigin = new URL(canonicalUrl).origin;


                      // Logika rewrite URL redirect untuk anime, movies, default
                      // Periksa apakah redirect mengarah ke origin dari target yang sedang diproses atau subdomainnya
                      // serta pastikan hanya rewrite jika targetType BUKAN 'movies' (sesuai permintaan sebelumnya)
                      if (targetType !== 'movies' && currentTargetOrigin && (redirectedUrl.origin === currentTargetOrigin || (redirectedUrl.host.endsWith('.' + new URL(selectedTargetUrl).hostname) && redirectedUrl.origin.startsWith('http')))) {

                         let newPath = redirectedUrl.pathname;

                         if (targetType === 'anime') {
                             newPath = '/anime' + (redirectedUrl.pathname.startsWith('/') ? redirectedUrl.pathname : '/' + redirectedUrl.pathname);
                         } else if (targetType === 'default') {
                             if (new URL(defaultTarget).pathname === '/') {
                                 newPath = redirectedUrl.pathname;
                            } else {
                                 const defaultTargetPathname = new URL(defaultTarget).pathname;
                                 newPath = (defaultTargetPathname.endsWith('/') ? defaultTargetPathname.slice(0, -1) : defaultTargetPathname) + (redirectedUrl.pathname.startsWith('/') ? redirectedUrl.pathname : '/' + redirectedUrl.pathname);
                            }
                         }
                         // Note: targetType === 'movies' tidak akan masuk blok rewrite ini karena kondisinya


                        // Buat URL baru dengan origin proxy dan path yang disesuaikan
                        proxiedRedirectUrl = new URL(newPath + redirectedUrl.search + redirectedUrl.hash, canonicalOrigin).toString();
                        proxiedRedirectUrl = proxiedRedirectUrl.replace('http://', 'https://'); // Pastikan HTTPS
                        console.log(`[INFO] Rewrote redirect URL to proxy host (${canonicalOrigin}) with path adjustment for ${targetType}: ${proxiedRedirectUrl}`);

                    } else if (targetType !== 'movies') {
                         console.log(`[INFO] Redirecting for ${targetType} to non-target domain or already relative path, passing through location.`);
                         // Jika redirect ke domain lain ATAU targetType BUKAN 'movies', biarkan URL-nya apa adanya (kecuali jika relatif)
                         // Pastikan URL absolut jika awalnya relatif
                         if (!redirectedUrl.protocol.startsWith('http')) {
                            // Jika masih relatif (misal /path), buat absolut dengan origin proxy
                            proxiedRedirectUrl = new URL(location, canonicalOrigin).toString();
                         } else {
                            // Jika sudah absolut ke domain lain, gunakan URL asli
                            proxiedRedirectUrl = location;
                         }
                     } else if (targetType === 'movies') {
                         console.log("[INFO] Location header will be removed for /movies redirect response.");
                         // proxiedRedirectUrl tetap null
                    }


                      const redirectHeaders = new Headers(corsHeaders);
                      for (const [key, value] of targetResponse.headers) {
                           const lowerKey = key.toLowerCase();
                           // Salin semua header kecuali content-encoding, content-length, dan location
                             if (lowerKey !== "content-encoding" && lowerKey !== "content-length" && lowerKey !== "location") {
                                redirectHeaders.set(key, value);
                           }
                      }

                    // Set header Location HANYA jika targetType BUKAN 'movies' dan proxiedRedirectUrl ada
                    if (targetType !== 'movies' && proxiedRedirectUrl) {
                        redirectHeaders.set('Location', proxiedRedirectUrl);
                    } else if (targetType === 'movies') {
                         console.log("[INFO] Location header explicitly not set for /movies redirect.");
                    }


                      return new Response(null, {
                           status: targetResponse.status,
                           statusText: targetResponse.statusText,
                           headers: redirectHeaders,
                      });

                 } catch (e) {
                      console.error(`[ERROR] Failed to process redirect location (${location}) for ${targetType}:`, e);
                      // Fallback response redirect jika proses gagal
                      const responseHeaders = new Headers(corsHeaders);
                      for (const [key, value] of targetResponse.headers) {
                         const lowerKey = key.toLowerCase();
                         // Salin semua header kecuali content-encoding, content-length, dan location (jika targetType 'movies')
                         if (lowerKey !== "content-encoding" && lowerKey !== "content-length") {
                             if (lowerKey === 'location' && targetType === 'movies') {
                                console.log("[INFO] Location header removed for /movies redirect fallback.");
                                continue;
                             }
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
             // --- Akhir Logika Penanganan Redirect (untuk anime, movies, default) ---


            const contentType = targetResponse.headers.get("content-type") || "";
            console.log(`[INFO] Target response Content-Type: ${contentType} for type ${targetType}`);


            if (contentType.includes("text/html")) {
                const htmlContent = await targetResponse.text();
                console.log(`[INFO] Processing HTML content with transformHTML for ${targetType} target.`);

                // Panggil transformHTML dengan targetType yang sudah ditentukan
                const modifiedHtml = transformHTML(htmlContent, canonicalUrl, targetOrigin, selectedTargetUrl!, targetType); // selectedTargetUrl! is safe here

                const responseHeaders = new Headers(corsHeaders);
                for (const [key, value] of targetResponse.headers) {
                    const lowerKey = key.toLowerCase();
                    // Skip content-encoding, content-length, content-type (set manually later)
                    // Serta lewati header Location jika targetType adalah 'movies' (sesuai permintaan sebelumnya)
                    if (lowerKey !== "content-encoding" && lowerKey !== "content-length" && lowerKey !== "content-type") {
                        if (lowerKey === 'location' && targetType === 'movies') {
                            console.log("[INFO] Location header removed for /movies HTML response.");
                            continue;
                        }
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
                // Proxy non-HTML aset
                console.log(`[INFO] Proxying non-HTML content for ${targetType}.`);
                const responseHeaders = new Headers(corsHeaders);
                for (const [key, value] of targetResponse.headers) {
                    const lowerKey = key.toLowerCase();
                    // Skip content-encoding, content-length
                    // Serta lewati header Location jika targetType adalah 'movies'
                    if (lowerKey === "content-encoding" || lowerKey === "content-length") {
                        // console.log(`[INFO] Skipping content header: ${key}`); // Verbose log
                        continue;
                    }
                    if (lowerKey === 'location' && targetType === 'movies') {
                        console.log("[INFO] Location header removed for /movies non-HTML response.");
                        continue; // Lewati header ini
                    }
                    responseHeaders.set(key, value);
                }
                return new Response(targetResponse.body, { // Stream body
                    status: targetResponse.status,
                    statusText: targetResponse.statusText,
                    headers: responseHeaders,
                });
            }
        } catch (error) {
            console.error(`[ERROR] Error fetching or processing target ${selectedTargetUrl}:`, error);
            return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
        }
    } // Akhir dari if (targetType !== 'static' && targetType !== 'proxy')

    // Jika sampai sini, artinya respons sudah dikembalikan di blok if di atas (static homepage atau /proxy)
});

console.log(`[INFO] Deno server started with routing.`);
console.log(`[INFO] Root path serves a static homepage.`);
console.log(`[INFO] Anime target: ${animeTarget} at path /anime`);
console.log(`[INFO] Movies target: ${moviesTarget} at path /movies`);
console.log(`[INFO] Endpoint /proxy?url=... available for fetching content.`);
console.log(`[INFO] Other paths fallback to default target: ${defaultTarget}`);
