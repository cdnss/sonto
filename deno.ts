// File: server.ts

// Import fungsi dari main.ts
import { filterRequestHeaders, transformHTML } from './main.ts'; // Path relatif dari server.ts ke main.ts

// Konfigurasi target URL dari Environment Variable atau nilai default
const defaultTarget = Deno.env.get("DEFAULT_TARGET_URL") || "https://www.example.com"; // Ganti dengan target default jika perlu
const animeTarget = Deno.env.get("ANIME_TARGET_URL") || "https://ww1.anoboy.app"; // Menggunakan URL yang diminta
const moviesTarget = Deno.env.get("MOVIES_TARGET_URL") || "https://lk21.film/"; // Menggunakan URL yang diminta

// Header CORS
const corsHeaders = new Headers({
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Origin, X-Requested-With, Content-Type, Accept",
});

// Handler untuk Deno Deploy (Request Listener)
Deno.serve(async (request: Request) => {
    const requestUrl = new URL(request.url);
    const canonicalUrl = requestUrl.href; // request.url di Deno Deploy adalah URL lengkap

    console.log(`[INFO] Deno Deploy received request: ${request.method} ${requestUrl.pathname}`); // Log path saja

    // Tangani preflight CORS (OPTIONS)
    if (request.method === "OPTIONS") {
        console.log("[INFO] Handling CORS preflight request.");
        return new Response(null, { headers: corsHeaders });
    }

    let selectedTargetUrl: string; // Menggunakan nama variabel ini untuk konsistensi
    let targetPathname: string;
    let targetType: 'anime' | 'movies' | 'default'; // Variabel untuk tipe target

    // --- Logika Routing Berdasarkan Pathname (if/else if) ---
    if (requestUrl.pathname === '/') {
        console.log("[INFO] Serving default homepage.");
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
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
        `;
        const responseHeaders = new Headers(corsHeaders);
        responseHeaders.set("Content-Type", "text/html; charset=utf-8");
        return new Response(homepageHtml, { status: 200, headers: responseHeaders });

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
        targetType = 'default';
        targetPathname = requestUrl.pathname; // Gunakan seluruh pathname
        console.log(`[INFO] Routing to DEFAULT target (${selectedTargetUrl}) for path: ${requestUrl.pathname}`);
    }
    // --- Akhir Logika Routing Berdasarkan Pathname (if/else if) ---


    // Jika bukan homepage statis, lanjutkan proses proxying
    try {
        const targetOrigin = new URL(selectedTargetUrl).origin; // Gunakan selectedTargetUrl untuk origin

        // Bentuk URL target untuk fetch
        const targetUrl = new URL(selectedTargetUrl + targetPathname + requestUrl.search);
        console.log(`[INFO] Fetching target URL: ${targetUrl.toString()}`);

        const filteredHeaders = filterRequestHeaders(request.headers);

        const targetResponse = await fetch(targetUrl.toString(), {
            method: request.method,
            headers: filteredHeaders,
            body: request.body,
            redirect: 'manual'
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
             try {
                  // Resolve location relatif terhadap URL target saat ini (targetUrl)
                 const redirectedUrl = new URL(location, targetUrl); // <-- resolve terhadap targetUrl yg sedang di-fetch
                 let proxiedRedirectUrl = redirectedUrl.toString();
                 const currentTargetOrigin = new URL(selectedTargetUrl).origin; // Origin dari target yang redirect

                 // Logika rewrite URL redirect
                  const canonicalOrigin = new URL(canonicalUrl).origin;
                  // Periksa apakah redirect mengarah ke origin dari target yang sedang diproses atau subdomainnya
                  if (currentTargetOrigin && (redirectedUrl.origin === currentTargetOrigin || (redirectedUrl.host.endsWith('.' + new URL(selectedTargetUrl).hostname) && redirectedUrl.origin.startsWith('http')))) {

                        // Tentukan prefix proxy berdasarkan request URL awal (canonicalUrl)
                         // Ini agak kurang ideal karena tidak langsung tahu targetType dari sini,
                         // tapi kita bisa coba ambil dari path awal request.
                        let prefix = '';
                        if (canonicalUrl.startsWith(canonicalOrigin + '/anime')) {
                            prefix = '/anime';
                        } else if (canonicalUrl.startsWith(canonicalOrigin + '/movies')) {
                            prefix = '/movies';
                        } // Jika tidak cocok, prefix tetap kosong (untuk defaultTarget)


                        const targetRedirectPath = redirectedUrl.pathname;
                        // Gabungkan prefix rute awal dengan path redirect dari target
                        // Pastikan prefix tidak kosong jika ditambahkan
                        let newPath = targetRedirectPath;
                        if (prefix !== '' && prefix !== '/') { // Jangan tambahkan prefix jika prefixnya '/'
                            newPath = prefix + (targetRedirectPath.startsWith('/') ? targetRedirectPath : '/' + targetRedirectPath);
                        } else if (prefix === '/' && targetRedirectPath === '/') {
                              // Jika prefix '/', dan redirect ke root target, path baru tetap '/'
                                newPath = '/';
                           } else if (prefix === '/' && targetRedirectPath !== '/') {
                              // Jika prefix '/', dan redirect ke sub-path target, path baru adalah sub-path target
                                newPath = targetRedirectPath;
                           }


                        // Buat URL baru dengan origin proxy dan path yang disesuaikan
                        proxiedRedirectUrl = new URL(newPath + redirectedUrl.search + redirectedUrl.hash, canonicalUrl).toString(); // <-- resolve terhadap canonicalUrl (origin proxy)
                        proxiedRedirectUrl = proxiedRedirectUrl.replace('http://', 'https://'); // Pastikan HTTPS
                        console.log(`[INFO] Rewrote redirect URL to proxy host (${new URL(canonicalUrl).origin}) with path adjustment for ${targetType}: ${proxiedRedirectUrl}`); // targetType di sini mungkin kurang akurat, harusnya targetType dari *request* awal.

                    } else {
                        // Jika redirect ke domain lain, biarkan URL-nya apa adanya (kecuali jika relatif)
                        // Pastikan URL absolut jika awalnya relatif
                        if (!redirectedUrl.protocol.startsWith('http')) {
                            // Jika masih relatif (misal /path), buat absolut dengan origin proxy
                            proxiedRedirectUrl = new URL(location, canonicalUrl).toString(); // <-- resolve terhadap canonicalUrl
                        } else {
                            // Jika sudah absolut ke domain lain, gunakan URL asli
                            proxiedRedirectUrl = location;
                        }
                    }


                    const redirectHeaders = new Headers(corsHeaders);
                    for (const [key, value] of targetResponse.headers) {
                        if (key.toLowerCase() === 'location') {
                            redirectHeaders.set(key, proxiedRedirectUrl);
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
                    console.error(`[ERROR] Failed to process redirect location (${location}) for ${targetType}:`, e);
                    // Fallback response redirect jika proses gagal
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
            // --- Akhir Logika Redirect ---


            const contentType = targetResponse.headers.get("content-type") || "";
            console.log(`[INFO] Target response Content-Type: ${contentType}`);

            if (contentType.includes("text/html")) {
                const htmlContent = await targetResponse.text();
                console.log("[INFO] Processing HTML content.");

                // Panggil transformHTML dan teruskan targetType serta selectedTargetUrl
                const modifiedHtml = transformHTML(htmlContent, canonicalUrl, targetOrigin, selectedTargetUrl, targetType);

                const responseHeaders = new Headers(corsHeaders);
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
                // Proxy non-HTML aset
                console.log("[INFO] Proxying non-HTML content.");
                const responseHeaders = new Headers(corsHeaders);
                for (const [key, value] of targetResponse.headers) {
                    if (key.toLowerCase() === "content-encoding" || key.toLowerCase() === "content-length") {
                        console.log(`[INFO] Skipping content header: ${key}`);
                        continue;
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
            console.error(`[ERROR] Error fetching or processing target ${selectedTargetUrl} for type ${targetType}:`, error);
            return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
        }
    } // <-- Ini menutup blok `else` besar yang menangani routing non-root
}); // <-- Ini menutup pemanggilan Deno.serve

console.log(`[INFO] Deno server started with routing.`);
console.log(`[INFO] Root path serves a static homepage.`);
console.log(`[INFO] Anime target: ${animeTarget} at path /anime`);
console.log(`[INFO] Movies target: ${moviesTarget} at path /movies`);
console.log(`[INFO] Other paths fallback to default target: ${defaultTarget}`);
