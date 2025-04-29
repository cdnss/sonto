// File: server.ts

// Import fungsi dari main.ts
import { filterRequestHeaders, transformHTML } from './main.ts'; // Pastikan main.ts ada dan mengekspor fungsi ini

// Konfigurasi target URL dari Environment Variable atau nilai default
const defaultTarget = Deno.env.get("DEFAULT_TARGET_URL") || "https://www.example.com"; // Ganti dengan target default jika perlu, atau biarkan example.com
const animeTarget = Deno.env.get("ANIME_TARGET_URL") || "https://ww1.anoboy.app"; // Menggunakan URL yang diminta
const moviesTarget = Deno.env.get("MOVIES_TARGET_URL") || "https://tv4.lk21official.cc"; // Menggunakan URL yang diminta

// Header CORS
const corsHeaders = new Headers({
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Origin, X-Requested-With, Content-Type, Accept",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS" // Tambahkan metode yang diizinkan jika diperlukan
});

// Handler untuk Deno Deploy (Request Listener)
Deno.serve({ port: 8080 }, async (request: Request) => {
    const requestUrl = new URL(request.url);
    const canonicalUrl = requestUrl.href; // URL proxy Anda sendiri

    console.log(`[INFO] Deno Deploy received request: ${request.method} ${requestUrl.pathname}`); // Log path saja

    // Tangani preflight CORS (OPTIONS)
    if (request.method === "OPTIONS") {
        console.log("[INFO] Handling CORS preflight request.");
        return new Response(null, { headers: corsHeaders });
    }

    let selectedTargetUrl: string | undefined; // Bisa undefined untuk rute statis atau proxy khusus
    let targetPathname: string = requestUrl.pathname; // Default ke pathname asli
    let targetType: 'anime' | 'movies' | 'default' | 'proxy' | 'static' = 'default'; // Variabel baru untuk tipe target

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
        const responseTypeParam = requestUrl.searchParams.get('type'); // Get 'type' parameter
        const returnAsHtml = responseTypeParam === 'html'; // Determine if HTML is requested

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
            // Filter header dari request asli sebelum dikirim ke target
            const filteredHeaders = filterRequestHeaders(request.headers);

            // Lakukan fetch ke URL target
            const proxyResponse = await fetch(fetchTargetUrl.toString(), {
                method: request.method, // Gunakan metode dari request asli
                headers: filteredHeaders, // Gunakan header yang sudah difilter
                body: request.body, // Teruskan body dari request asli
                redirect: 'follow' // Ikuti redirect secara otomatis untuk endpoint proxy ini
            });

            console.log(`[INFO] Received response from proxied URL: Status ${proxyResponse.status}`);

            // Baca body respons sebagai teks
            const content = await proxyResponse.text();

            if (returnAsHtml) {
                console.log(`[INFO] Successfully fetched content from ${targetUrlParam}, returning HTML.`);
                const responseHeaders = new Headers(corsHeaders);
                // Preserve original Content-Type if it was HTML, otherwise set to text/html
                const contentType = proxyResponse.headers.get("content-type") || "text/html";
                responseHeaders.set("Content-Type", contentType.includes("text/html") ? contentType : "text/html; charset=utf-8");
                // Remove content-encoding/length as we've already read and potentially modified content
                responseHeaders.delete("content-encoding");
                responseHeaders.delete("content-length");
                // Tambahkan logika hapus header Location untuk /proxy?type=html jika diperlukan,
                // namun biasanya tidak relevan di sini kecuali target mengembalikan redirect sebagai HTML.
                // Untuk saat ini, fokus pada rute /anime dan /movies
                if (responseHeaders.has('location')) {
                    console.log("[INFO] Removed Location header from /proxy?type=html response.");
                    responseHeaders.delete('location');
                }


                // For /proxy route returning HTML, we might not need complex transformations
                // but if transformHTML is generic, we could potentially use it here.
                // Let's return the raw text content for now, assuming minimal/no transformation needed for /proxy?type=html
                return new Response(content, {
                    status: proxyResponse.status,
                    headers: responseHeaders,
                });
            } else {
                // Bentuk respons JSON (default atau jika type=json)
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
        targetType = 'anime'; // Set tipe target
        const targetPathnameRaw = requestUrl.pathname.substring('/anime'.length);
        targetPathname = targetPathnameRaw === '' ? '/' : targetPathnameRaw; // Jika sisa path kosong, jadikan '/'
        console.log(`[INFO] Routing to ANIME target (${selectedTargetUrl}) for path: ${requestUrl.pathname}`);

    } else if (requestUrl.pathname.startsWith('/movies')) {
        selectedTargetUrl = moviesTarget;
        targetType = 'movies'; // Set tipe target
        const targetPathnameRaw = requestUrl.pathname.substring('/movies'.length);
        targetPathname = targetPathnameRaw === '' ? '/' : targetPathnameRaw; // Jika sisa path kosong, jadikan '/'
        console.log(`[INFO] Routing to MOVIES target (${selectedTargetUrl}) for path: ${requestUrl.pathname}`);

    } else {
        // Path default atau path lainnya (fallback)
        selectedTargetUrl = defaultTarget;
        targetType = 'default'; // Set tipe target
        targetPathname = requestUrl.pathname; // Gunakan seluruh pathname
        console.log(`[INFO] Routing to DEFAULT target (${selectedTargetUrl}) for path: ${requestUrl.pathname}`);
    }
    // --- Akhir Logika Routing ---

    // Jika bukan homepage statis atau rute /proxy, lanjutkan proses proxying normal
    if (targetType !== 'static' && targetType !== 'proxy') {
        try {
            // Pastikan selectedTargetUrl terdefinisi untuk tipe ini
            if (!selectedTargetUrl) {
                console.error("[ERROR] selectedTargetUrl is undefined for non-static/proxy type.");
                return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
            }

            const targetOrigin = new URL(selectedTargetUrl).origin; // Gunakan selectedTargetUrl untuk origin

            // Bentuk URL target untuk fetch
            const targetUrl = new URL(selectedTargetUrl + targetPathname + requestUrl.search);
            console.log(`[INFO] Fetching target URL: ${targetUrl.toString()}`);

            const filteredHeaders = filterRequestHeaders(request.headers);

            const targetResponse = await fetch(targetUrl.toString(), {
                method: request.method,
                headers: filteredHeaders,
                body: request.body,
                redirect: 'manual' // Tetap manual redirect untuk rute ini
            });

            console.log(`[INFO] Received response from target: Status ${targetResponse.status}`);

            // --- Logika Penanganan Redirect 3xx ---
             if (targetResponse.status >= 300 && targetResponse.status < 400 && targetResponse.headers.has('location')) {
                 const location = targetResponse.headers.get('location');
                 if (!location) {
                     console.error("[ERROR] Redirect response missing Location header.");
                     const errorHeaders = new Headers(corsHeaders);
                     return new Response("Internal Server Error: Invalid redirect response", { status: 500, headers: errorHeaders });
                 }
                 console.log(`[INFO] Target responded with redirect to: ${location}`);
                 let proxiedRedirectUrl: string | null = null; // Ubah inisialisasi menjadi null

                 try {
                      // Resolve location relatif terhadap URL target saat ini
                     const redirectedUrl = new URL(location, targetUrl); // <-- resolve terhadap targetUrl yg sedang di-fetch
                     const currentTargetOrigin = new URL(selectedTargetUrl).origin; // Origin dari target yang redirect

                     // Logika rewrite URL redirect
                      const canonicalOrigin = new URL(canonicalUrl).origin;
                      // Periksa apakah redirect mengarah ke origin dari target yang sedang diproses atau subdomainnya
                      // Serta pastikan hanya rewrite jika targetType BUKAN 'movies'
                      if (targetType !== 'movies' && currentTargetOrigin && (redirectedUrl.origin === currentTargetOrigin || (redirectedUrl.host.endsWith('.' + new URL(selectedTargetUrl).hostname) && redirectedUrl.origin.startsWith('http')))) {

                            let prefix = '';
                            if (targetType === 'anime') {
                                prefix = '/anime';
                            } else if (targetType === 'default') { // Tambahkan 'default' jika perlu rewrite redirect-nya
                                // prefix tetap kosong atau sesuaikan jika default target butuh prefix
                                prefix = requestUrl.pathname.split('/')[1]; // Ambil bagian pertama path asli
                                if (prefix && redirectedUrl.pathname.startsWith('/' + prefix)) {
                                     // Jika path redirect sudah mengandung prefix, jangan double
                                     newPath = redirectedUrl.pathname;
                                } else {
                                    // Jika tidak, tambahkan prefix
                                     newPath = '/' + prefix + (redirectedUrl.pathname.startsWith('/') ? redirectedUrl.pathname : '/' + redirectedUrl.pathname);
                                }
                            } else { // Untuk anime
                                 prefix = '/anime';
                                 const targetRedirectPath = redirectedUrl.pathname;
                              newPath = prefix + (targetRedirectPath.startsWith('/') ? targetRedirectPath : '/' + targetRedirectPath);
                            }

                            // Gabungkan prefix rute awal dengan path redirect dari target
                            // Letakkan logika penentuan newPath di dalam if (targetType !== 'movies' ...)
                             // Sesuaikan penentuan newPath agar hanya berlaku untuk anime dan default (jika perlu)
                             let newPath = redirectedUrl.pathname;
                             if (targetType === 'anime') {
                                 // Untuk /anime, tambahkan /anime prefix
                                 newPath = '/anime' + (redirectedUrl.pathname.startsWith('/') ? redirectedUrl.pathname : '/' + redirectedUrl.pathname);
                             } else if (targetType === 'default') {
                                // Untuk /default, pertahankan path asli atau sesuaikan jika perlu
                                // Logika ini mungkin perlu disesuaikan lebih lanjut tergantung kebutuhan defaultTarget
                                // Saat ini biarkan path aslinya saja jika defaultTarget bukan root path
                                if (new URL(defaultTarget).pathname === '/') {
                                     newPath = redirectedUrl.pathname; // Jika default target adalah root, gunakan path redirect apa adanya
                                } else {
                                     // Jika default target bukan root, mungkin perlu penyesuaian path yang lebih kompleks
                                     // Untuk saat ini, kita asumsikan redirect ke path relatif terhadap origin target
                                     // Jadi, gabungkan pathname defaultTarget dengan pathname redirect
                                     const defaultTargetPathname = new URL(defaultTarget).pathname;
                                     newPath = (defaultTargetPathname.endsWith('/') ? defaultTargetPathname.slice(0, -1) : defaultTargetPathname) + (redirectedUrl.pathname.startsWith('/') ? redirectedUrl.pathname : '/' + redirectedUrl.pathname);
                                }
                             }


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
                         proxiedRedirectUrl = null; // Tetapkan null secara eksplisit agar tidak diset nanti
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
                                continue; // Skip setting this header
                             }
                            responseHeaders.set(key, value);
                         }
                      }
                      return new Response(targetResponse.body, { // Note: Redirects usually shouldn't have body
                          status: targetResponse.status,
                          statusText: targetResponse.statusText,
                          headers: responseHeaders,
                      });
                 }
             }
             // --- Akhir Logika Redirect ---


            const contentType = targetResponse.headers.get("content-type") || "";
            console.log(`[INFO] Target response Content-Type: ${contentType}`);

            if (contentType.includes("text/html")) {
                const htmlContent = await targetResponse.text();
                console.log("[INFO] Processing HTML content.");

                // Panggil transformHTML dan teruskan targetType
                const modifiedHtml = transformHTML(htmlContent, canonicalUrl, targetOrigin, selectedTargetUrl!, targetType);

                const responseHeaders = new Headers(corsHeaders);
                for (const [key, value] of targetResponse.headers) {
                    const lowerKey = key.toLowerCase();
                    // Skip content-encoding, content-length, content-type (set manually later)
                    // Serta lewati header Location jika targetType adalah 'movies'
                    if (lowerKey !== "content-encoding" && lowerKey !== "content-length" && lowerKey !== "content-type") {
                        if (lowerKey === 'location' && targetType === 'movies') {
                            console.log("[INFO] Location header removed for /movies HTML response.");
                            continue; // Lewati header ini
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
                console.log("[INFO] Proxying non-HTML content.");
                const responseHeaders = new Headers(corsHeaders);
                for (const [key, value] of targetResponse.headers) {
                    const lowerKey = key.toLowerCase();
                    // Skip content-encoding, content-length
                    // Serta lewati header Location jika targetType adalah 'movies'
                    if (lowerKey === "content-encoding" || lowerKey === "content-length") {
                        console.log(`[INFO] Skipping content header: ${key}`);
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
