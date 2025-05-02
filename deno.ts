// deno.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import * as cheerio  from "https://esm.sh/cheerio@1.0.0-rc.12";
import { postDataToApi } from "./post.ts"; // Import fungsi postDataToApi dari post.ts
import { processHtml } from "./xhtml.ts";
// HTML sederhana untuk halaman home dengan Bootstrap 5 dari CDN
const homeHtml = await Deno.readTextFile('./index.html');

// Atur header CORS (kecuali Origin)
const corsHeaders = {
    // "Access-Control-Allow-Origin": "*", // <--- DIHAPUS DARI SINI
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};


// Handler untuk setiap request
async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Handle OPTIONS requests (preflight CORS)
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            // Gunakan corsHeaders yang sudah dimodifikasi (tanpa Origin *)
            headers: corsHeaders,
        });
    }

    // --- MULAI PENANGANAN API BARU: /?url= ---
    // Cek jika path adalah / dan ada query parameter 'url'
    if (url.pathname === "/" && url.searchParams.has("url")) {
        const targetUrl = url.searchParams.get("url");
        console.log(`Menerima permintaan fetch untuk URL: ${targetUrl}`);

        // Validasi dasar: pastikan URL ada
        if (!targetUrl) {
             return new Response(JSON.stringify({ error: "Parameter 'url' tidak boleh kosong" }), {
                headers: {
                    "Content-Type": "application/json",
                    ...corsHeaders, // Tambahkan header CORS (tanpa Origin *)
                    "Access-Control-Allow-Origin": "*", // <--- TAMBAHKAN KHUSUS DI SINI
                },
                status: 400, // Bad Request
            });
        }

        try {
            // Lakukan fetch ke URL target
            const response = await fetch(targetUrl, {
                 method: 'GET', // Biasanya GET untuk mengambil konten
                 // Untuk kasus ini, kita hanya mengambil konten, tidak perlu meneruskan header/body asli
                 redirect: 'follow' // Ikuti redirect jika ada
             });

            // Cek jika fetch berhasil (status 2xx)
            if (!response.ok) {
                // Jika status bukan 2xx, kembalikan error dengan status dan pesan dari target
                return new Response(JSON.stringify({ error: `Gagal mengambil URL: ${response.status} ${response.statusText}` }), {
                    headers: {
                        "Content-Type": "application/json",
                         ...corsHeaders, // Tambahkan header CORS (tanpa Origin *)
                         "Access-Control-Allow-Origin": "*", // <--- TAMBAHKAN KHUSUS DI SINI
                     },
                     status: response.status, // Gunakan status dari fetch jika error
                 });
             }

            // Baca body respons sebagai teks
            const fetchedContent = await response.text();

            // Buat objek JSON dengan kunci 'contents'
            const jsonResponse = { contents: fetchedContent };

            // Kembalikan respons dalam format JSON
            return new Response(JSON.stringify(jsonResponse), {
                headers: {
                    "Content-Type": "application/json", // Set Content-Type ke JSON
                    ...corsHeaders, // Tambahkan header CORS (tanpa Origin *)
                    "Access-Control-Allow-Origin": "*", // <--- TAMBAHKAN KHUSUS DI SINI
                },
                status: 200, // Status OK
            });

        } catch (error: any) { // Gunakan 'any' atau tipe Error yang lebih spesifik jika perlu
            console.error("Error saat melakukan fetch URL:", error);
            // Tangani error saat proses fetch (misalnya, URL tidak valid, masalah jaringan)
            return new Response(JSON.stringify({ error: "Internal Server Error saat fetch URL", details: error.message }), {
                headers: {
                    "Content-Type": "application/json",
                    ...corsHeaders, // Tambahkan header CORS (tanpa Origin *)
                    "Access-Control-Allow-Origin": "*", // <--- TAMBAHKAN KHUSUS DI SINI
                },
                status: 500, // Status Internal Server Error
            });
        }
    }
    // --- AKHIR PENANGANAN API BARU: /?url= ---


    // Handle home page (Ini akan dijalankan hanya jika path adalah '/' dan TIDAK ada parameter 'url')
    if (url.pathname === "/") {
        return new Response(homeHtml, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                ...corsHeaders, // Menggunakan corsHeaders tanpa Origin *
            },
        });
    }

    // --- MULAI PENANGANAN API BARU /api.php?id=... (Dengan Penanganan Redirect Manual) ---
    if (url.pathname === "/api.php" && url.searchParams.has("id")) {
        const id = url.searchParams.get("id"); // Ambil nilai parameter 'id'
        const targetType = 'api'; // Definisikan tipe target untuk logging/penanganan
        const canonicalUrl = req.url; // URL proxy yang diminta klien
        // URL target awal, perlu disesuaikan jika postDataToApi fetch ke URL yang berbeda dari ini
        const initialTargetUrl = `https://cloud.hownetwork.xyz/api.php?id=${encodeURIComponent(id as string)}`; // Pastikan id adalah string


        console.log(`[Proxy Handler /api.php] Menerima permintaan API untuk ID: ${id}`);

        let targetResponse: Response;
        try {
            // Panggil fungsi postDataToApi yang dimodifikasi (dengan redirect: 'manual')
            // postDataToApi sekarang mengembalikan objek Response!
            targetResponse = await postDataToApi(id as string); // Cast id ke string

        } catch (fetchError: any) {
            // Tangani error jika fetch gagal total (misalnya, masalah jaringan)
            console.error(`[Proxy Handler /api.php ERROR] Gagal melakukan fetch untuk ID '${id}':`, fetchError);
            const errorHeaders = new Headers(corsHeaders);
            // Tambahkan CORS Origin * hanya untuk respons error API ini jika perlu
            errorHeaders.set("Access-Control-Allow-Origin", "*");
            return new Response(JSON.stringify({ error: "Internal Server Error: Could not reach target.", details: fetchError.message }), {
                status: 500, // Status Internal Server Error
                headers: errorHeaders,
            });
        }

        console.log(`[Proxy Handler /api.php] Menerima respons target dengan status: ${targetResponse.status}`);

        // --- Penanganan Redirect 3xx (Gabungan dengan snippet Anda) ---
        // Kita perlu nilai selectedTargetUrl untuk logika rewrite URL Anda
        // Karena postDataToApi fetch ke https://cloud.hownetwork.xyz/api.php?id=...,
        // origin targetnya adalah https://cloud.hownetwork.xyz
        const selectedTargetUrl = 'https://cloud.hownetwork.xyz/api.php'; // Asumsi base URL target sebelum query
        const currentTargetOrigin = new URL(selectedTargetUrl).origin;
        const canonicalOrigin = new URL(canonicalUrl).origin;


        if (targetResponse.status >= 300 && targetResponse.status < 400 && targetResponse.headers.has('location')) {
            const location = targetResponse.headers.get('location');
            if (!location) {
                console.error(`[Proxy Handler /api.php ERROR] Target redirect response missing Location header.`);
                const errorHeaders = new Headers(corsHeaders);
                // Tambahkan CORS Origin * untuk respons error API ini jika perlu
                errorHeaders.set("Access-Control-Allow-Origin", "*");
                return new Response(JSON.stringify({ error: "Internal Server Error: Invalid redirect response from target" }), { status: 500, headers: errorHeaders });
            }
            console.log(`[Proxy Handler /api.php INFO] Target responded with redirect to: ${location}`);

            try {
                // Resolving URL location relative to the targetUrl being fetched
                // Menggunakan initialTargetUrl sebagai base URL untuk resolving location relatif
                const redirectedUrl = new URL(location, initialTargetUrl);
                let proxiedRedirectUrl = redirectedUrl.toString();
                // const currentTargetOrigin = new URL(selectedTargetUrl).origin; // Sudah didefinisikan di atas
                // const canonicalOrigin = new URL(canonicalUrl).origin; // Sudah didefinisikan di atas

                // Logic to rewrite redirect URL to point back to the proxy host
                // Perhatikan bahwa logika rewrite ini mungkin perlu disesuaikan
                 // untuk rute /api.php karena tidak ada prefix /movie atau /anime.
                 // Jika Anda ingin redirect api tetap di /api.php?id=... tapi dengan path/query baru,
                 // logika ini perlu diadaptasi.
                 // UNTUK CONTOH INI, SAYA AKAN MENGASUMSIKAN REDIRECT KE DOMAIN LAIN
                 // (seperti log curl Anda yang ke video.hownetwork.xyz) tidak perlu di-rewrite
                 // ke proxy, tetapi dikembalikan langsung ke klien.
                 // Jika Anda ingin rewrite ke proxy untuk redirect API, beritahu saya.

                 // Jika redirect mengarah ke domain target yang sama (cloud.hownetwork.xyz)
                 // atau subdomainnya atau path relatif, maka mungkin perlu di-rewrite.
                 // Logika di snippet Anda tampak kompleks untuk kasus API ini.
                 // Mari kita coba yang lebih sederhana berdasarkan log curl (redirect ke domain berbeda).

                 // Jika redirect *tidak* ke domain proxy (canonicalOrigin) DAN *tidak* ke origin target awal (currentTargetOrigin)
                 // Maka kemungkinan ini redirect ke domain lain yang mungkin perlu dikembalikan langsung
                 if (redirectedUrl.origin !== canonicalOrigin && redirectedUrl.origin !== currentTargetOrigin) {
                     console.log(`[Proxy Handler /api.php INFO] Redirecting API to external domain: ${location}. Returning 302 response to client.`);
                     proxiedRedirectUrl = location; // Gunakan URL asli dari Location header
                 } else {
                     // Jika redirect ke domain proxy atau origin target, Anda mungkin ingin rewrite.
                     // Logika rewrite spesifik untuk /api.php perlu ditentukan.
                     // Untuk saat ini, mari kita kembalikan 302 dengan URL asli jika bukan external.
                     console.log(`[Proxy Handler /api.php INFO] Redirecting API within target domain or to proxy domain. Returning 302 response to client with original Location: ${location}.`);
                     proxiedRedirectUrl = location; // Mengembalikan location asli dari target
                 }

                const redirectHeaders = new Headers(corsHeaders);
                // Tambahkan CORS Origin * untuk respons redirect API ini jika perlu
                redirectHeaders.set("Access-Control-Allow-Origin", "*");

                // Copy headers dari targetResponse kecuali Location, Content-Encoding, Content-Length
                for (const [key, value] of targetResponse.headers) {
                     if (key.toLowerCase() !== 'location' && key.toLowerCase() !== "content-encoding" && key.toLowerCase() !== "content-length") {
                          redirectHeaders.set(key, value);
                     }
                }
                // Set Location header dengan URL tujuan redirect (baik asli atau di-rewrite jika ada logika itu)
                // Di sini, kita menggunakan proxiedRedirectUrl yang bisa jadi location asli atau di-rewrite
                redirectHeaders.set('Location', proxiedRedirectUrl);

                // Mengembalikan respons pengalihan (302) ke klien awal
                return new Response(null, { // Body biasanya null untuk 3xx
                     status: targetResponse.status, // Menggunakan status asli dari target (misalnya, 302)
                     statusText: targetResponse.statusText,
                     headers: redirectHeaders,
                });

            } catch (e: any) { // Tangkap error saat memproses redirect
                console.error(`[Proxy Handler /api.php ERROR] Failed to process redirect location (${location}):`, e);
                // Fallback: Kembalikan error server jika penanganan redirect gagal
                const errorHeaders = new Headers(corsHeaders);
                // Tambahkan CORS Origin * untuk respons error API ini jika perlu
                errorHeaders.set("Access-Control-Allow-Origin", "*");
                return new Response(JSON.stringify({ error: "Internal Server Error: Failed to process target redirect.", details: e.message }), {
                    status: 500,
                    headers: errorHeaders,
                });
            }
        }
        // --- Akhir Penanganan Redirect ---


        // --- Penanganan Respons OK (2xx) dari Target ---
        if (targetResponse.ok) {
            console.log("[Proxy Handler /api.php INFO] Target responded with OK status (2xx).");
            // Kode di sini untuk memproses respons 2xx
            // Misalnya, mengurai JSON, memodifikasi header, dan mengembalikan respons 200 ke klien
            try {
                // Harap dicatat: Jika respons 2xx tapi bukan JSON, ini akan gagal.
                 // Berdasarkan log curl awal, target API memang mengembalikan 302,
                 // jadi mungkin skenario 2xx JSON tidak terjadi dari URL ini.
                 // Tapi kode tetap disiapkan jika suatu saat merespons 2xx.
                const responseBody = await targetResponse.json(); // Coba parse JSON

                const finalHeaders = new Headers(corsHeaders);
                // Tambahkan CORS Origin * untuk respons OK API ini jika perlu
                finalHeaders.set("Access-Control-Allow-Origin", "*");

                // Salin header non-Content-Type dari respons asli jika perlu
                 // Hati-hati dengan header seperti Set-Cookie, Autentikasi, dll.
                 for (const [key, value] of targetResponse.headers.entries()) {
                    if (key.toLowerCase() !== 'content-type' && key.toLowerCase() !== 'access-control-allow-origin' && key.toLowerCase() !== 'access-control-allow-methods' && key.toLowerCase() !== 'access-control-allow-headers') {
                        finalHeaders.set(key, value);
                    }
                 }
                finalHeaders.set("Content-Type", "application/json"); // Pastikan Content-Type JSON

                return new Response(JSON.stringify(responseBody), { // Kembalikan JSON sebagai body
                    status: targetResponse.status, // Status OK dari target (biasanya 200)
                    statusText: targetResponse.statusText,
                    headers: finalHeaders,
                });
            } catch (jsonError: any) { // Tangani error parsing JSON
                console.error("[Proxy Handler /api.php ERROR] Failed to parse target response body as JSON:", jsonError);
                // Coba baca body sebagai teks untuk error message jika memungkinkan
                let errorBodyText = await targetResponse.text().catch(() => "Could not read response body for error details.");
                const errorHeaders = new Headers(corsHeaders);
                // Tambahkan CORS Origin * untuk respons error API ini jika perlu
                errorHeaders.set("Access-Control-Allow-Origin", "*");
                return new Response(JSON.stringify({
                    error: "Internal Server Error: Invalid response format from target API.",
                    details: jsonError.message,
                    responseBodySnippet: errorBodyText.substring(0, 200) + (errorBodyText.length > 200 ? '...' : '') // Sertakan cuplikan body
                }), {
                    status: 500, // Status Internal Server Error
                    headers: errorHeaders,
                });
            }
        }


        // --- Penanganan Status Lain (4xx, 5xx, dll.) dari Target ---
        // Jika status bukan 2xx dan bukan 3xx, ini adalah 4xx, 5xx, atau lainnya.
        console.log(`[Proxy Handler /api.php INFO] Target responded with status ${targetResponse.status}. Passing through.`);
        // Kode di sini untuk menangani status 4xx atau 5xx dari target
        // Misalnya, meneruskan status error asli ke klien, mungkin dengan body error dari target
        const errorHeaders = new Headers(corsHeaders);
        // Tambahkan CORS Origin * untuk respons error API ini jika perlu
        errorHeaders.set("Access-Control-Allow-Origin", "*");

        // Salin header non-Content-Type dari respons asli jika perlu
         // Hati-hati dengan header Set-Cookie, Autentikasi, dll.
         for (const [key, value] of targetResponse.headers.entries()) {
            if (key.toLowerCase() !== 'content-type' && key.toLowerCase() !== 'access-control-allow-origin' && key.toLowerCase() !== 'access-control-allow-methods' && key.toLowerCase() !== 'access-control-allow-headers') {
                errorHeaders.set(key, value);
            }
         }
        // Set Content-Type dari respons target jika ada, default ke plain
        const targetContentType = targetResponse.headers.get("Content-Type") || "text/plain";
        errorHeaders.set("Content-Type", targetContentType);


        // Coba baca body error dari target jika ada
        // Kita mengembalikan body asli dari target apa adanya
        return new Response(targetResponse.body, { // Mengembalikan body asli dari target
            status: targetResponse.status, // Menggunakan status asli (4xx, 5xx)
            statusText: targetResponse.statusText,
            headers: errorHeaders,
        });
    }
    // --- AKHIR PENANGANAN API BARU /api.php?id=... ---


    // Gabungkan penanganan /movie dan /anime dalam satu blok (kode yang sudah ada)
    let prefix: "/movie" | "/anime" | null = null;
    let targetBaseUrl: string | null = null;
    let targetType = 'unknown'; // Tambahkan targetType untuk penanganan redirect di bawah

    if (url.pathname.startsWith("/movie")) {
        prefix = "/movie";
        targetBaseUrl = "https://lk21.film";
        targetType = 'movies';
    } else if (url.pathname.startsWith("/anime")) {
        prefix = "/anime";
        targetBaseUrl = "https://ww1.anoboy.app";
        targetType = 'anime';
    }

    // Jika prefix dikenali (path dimulai dengan /movie atau /anime)
    if (prefix && targetBaseUrl) {
        // Ambil sisa path setelah prefix
        let remainingPath = url.pathname.substring(prefix.length);
        // Pastikan path dimulai dengan '/' jika tidak kosong, atau jadi '/' jika kosong
         if (remainingPath === "") {
             remainingPath = "/";
        } else if (!remainingPath.startsWith("/")) {
             remainingPath = "/" + remainingPath;
        }

        // Gabungkan base URL target, sisa path, dan query string dari request asli
         // currentTargetUrl adalah URL lengkap yang akan difetch
        const currentTargetUrl = `${targetBaseUrl}${remainingPath}${url.search}`;
         const canonicalUrl = req.url; // URL proxy yang diminta klien


        console.log(`[Proxy Handler ${prefix}] Proxying request to: ${currentTargetUrl} (from ${req.url})`);

        try {
            // Fetch konten dari URL tujuan
            // Gunakan redirect: 'manual' di sini juga jika Anda ingin menangani redirect
             // untuk rute /movie dan /anime secara manual dengan logika rewrite URL Anda
            const response = await fetch(currentTargetUrl, {
                 method: req.method, // Lewatkan method request asli
                 headers: req.headers, // Hati-hati saat meneruskan header klien, mungkin tidak selalu diinginkan
                 body: req.body, // Lewatkan body request asli (jika ada)
                 redirect: 'follow' // <-- Jika ingin manual redirect handling, ubah ini jadi 'manual'
            });

            // --- Penanganan Redirect 3xx untuk /movie dan /anime (jika redirect: 'manual') ---
            // Jika Anda mengubah redirect di atas menjadi 'manual', maka logika penanganan redirect
            // dari snippet Anda perlu disisipkan di sini, serupa dengan blok /api.php di atas.
            // Logika rewrite URL yang spesifik untuk /movie dan /anime ada di snippet Anda.
            // ... (Sisipkan logika redirect manual di sini jika redirect: 'manual') ...

            // Jika tidak ada redirect yang ditangani (atau redirect: 'follow' berhasil)
            // Lanjutkan dengan memproses respons 2xx, 4xx, 5xx, dll.

            console.log(`[Proxy Handler ${prefix}] Menerima respons target dengan status: ${response.status}`);

            // Cek Content-Type
            const contentType = response.headers.get("Content-Type");
            const isHtml = contentType && contentType.includes("text/html");

            let responseBody;
            let finalHeaders = new Headers(corsHeaders); // Gunakan Headers object

            // Salin header dari respons target kecuali yang tidak diinginkan
            for (const [key, value] of response.headers.entries()) {
                // Jangan salin header CORS Access-Control jika sudah ditangani secara terpusat
                // Juga hindari Content-Encoding dan Content-Length jika membaca body stream
                if (!key.toLowerCase().startsWith('access-control-') && key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'content-length') {
                    finalHeaders.set(key, value);
                }
            }

             // Set atau timpa Content-Type terakhir
             finalHeaders.set("Content-Type", contentType || "application/octet-stream");

            if (isHtml) {
                const htmlContent = await response.text(); // Baca body sebagai teks (HTML)
                // Proses HTML, termasuk potensi penyuntikan script iframe
                responseBody = processHtml(htmlContent, prefix, targetBaseUrl, currentTargetUrl, canonicalUrl); // Kirim canonicalUrl
                 finalHeaders.set("Content-Type", "text/html; charset=utf-8"); // Pastikan Content-Type benar setelah dimodifikasi
            } else {
                responseBody = response.body; // Untuk non-HTML, gunakan body stream langsung
                // Header disalin di atas
            }

             // Tambahkan header CORS Origin * jika permintaan dari browser dan perlu diizinkan
             // Anda sudah punya logic di atas untuk CORS Options dan header corsHeaders
             // Pertimbangkan kapan Access-Control-Allow-Origin: * benar-benar perlu ditambahkan
             // Misalnya, hanya untuk permintaan tertentu atau domain tertentu.
             // Jika semua rute memerlukan CORS *, bisa ditambahkan di satu tempat.
             // Untuk contoh ini, saya akan tambahkan di respons akhir jika tidak ada redirect manual yang mengembalikan respons sendiri.
             finalHeaders.set("Access-Control-Allow-Origin", "*");


            // Buat response baru
            const proxyResponse = new Response(responseBody, {
                status: response.status,
                statusText: response.statusText,
                headers: finalHeaders,
            });

            console.log(`[Proxy Handler ${prefix}] Proxy response status: ${response.status}`);
            return proxyResponse;

        } catch (error: any) { // Gunakan 'any' atau tipe Error yang lebih spesifik jika perlu
            console.error(`[Proxy Handler ${prefix} ERROR] Error fetching or processing:`, error);
            const errorHeaders = new Headers(corsHeaders);
            // Tambahkan CORS Origin * untuk respons error ini jika perlu
            errorHeaders.set("Access-Control-Allow-Origin", "*");
            return new Response(JSON.stringify({ error: `Error fetching or processing content for ${prefix}.`, details: error.message }), {
                status: 500,
                headers: errorHeaders,
            });
        }

    } else {
        // 404 Not Found for other paths (yang tidak diawali /movie, /anime, /api.php dengan id, atau /?url=)
        console.log(`[Proxy Handler] Path not found: ${url.pathname}`);
        const notFoundHeaders = new Headers(corsHeaders);
         // Tambahkan CORS Origin * untuk respons 404 ini jika perlu
        notFoundHeaders.set("Access-Control-Allow-Origin", "*");
        return new Response("Not Found", {
            status: 404,
            headers: notFoundHeaders,
        });
     }
}

console.log("Server running on http://localhost:8080/"); // Port 8080 sesuai serve
console.log("Access home at: http://localhost:8080/ (tanpa parameter url)");
console.log("Access fetch URL API via: http://localhost:8080/?url=... (Origin * diizinkan)"); // Info CORS diperbarui
console.log("Access movie proxy via: http://localhost:8080/movie/...");
console.log("Access anime proxy via: http://localhost:8080/anime/...");
console.log("Access API via: http://localhost:8080/api.php?id=...");


await serve(handler, { port: 8080 }); // Sesuaikan port jika perlu
