// deno.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import * as cheerio from 'npm:cheerio'; // Impor Cheerio dari npm
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

        } catch (error) {
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

    // --- MULAI PENANGANAN API BARU /api.php?id=... ---
    // Cek apakah path adalah /api.php dan memiliki query parameter 'id'
    if (url.pathname === "/api.php" && url.searchParams.has("id")) {
        const id = url.searchParams.get("id"); // Ambil nilai parameter 'id'
        console.log(`Menerima permintaan API untuk ID: ${id}`);

        try {
            // Panggil fungsi postDataToApi dengan ID yang diambil
            const apiResult = await postDataToApi(id);

            // Buat respons JSON dari hasil apiResult
            return new Response(JSON.stringify(apiResult), {
                headers: {
                    "Content-Type": "application/json", // Set Content-Type ke JSON
                    ...corsHeaders, // Menggunakan corsHeaders tanpa Origin *
                },
                status: 200, // Status OK
            });

        } catch (error) {
            console.error("Error saat memproses permintaan API:", error);
            // Tangani error dan kirim respons error JSON
            return new Response(JSON.stringify({ error: "Internal Server Error", details: error.message }), {
                headers: {
                     "Content-Type": "application/json",
                    ...corsHeaders, // Menggunakan corsHeaders tanpa Origin *
                },
                status: 500, // Status Internal Server Error
            });
        }
    }
    // --- AKHIR PENANGANAN API BARU /api.php?id=... ---


    // Gabungkan penanganan /movie dan /anime dalam satu blok (kode yang sudah ada)
    let prefix: "/movie" | "/anime" | null = null;
    let targetBaseUrl: string | null = null;

    if (url.pathname.startsWith("/movie")) {
        prefix = "/movie";
        targetBaseUrl = "https://tv4.lk21official.cc";
    } else if (url.pathname.startsWith("/anime")) {
        prefix = "/anime";
        targetBaseUrl = "https://ww1.anoboy.app";
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


        console.log(`Proxying request for ${prefix} to: ${currentTargetUrl} (from ${req.url})`);

        try {
            // Fetch konten dari URL tujuan
            const response = await fetch(currentTargetUrl, {
                 method: req.method, // Lewatkan method request asli
                 // headers: req.headers, // Hati-hati saat meneruskan header klien, mungkin tidak selalu diinginkan
                 body: req.body, // Lewatkan body request asli (jika ada)
                 redirect: 'follow' // Ikuti redirect jika ada
            });

            // Cek Content-Type
            const contentType = response.headers.get("Content-Type");
            const isHtml = contentType && contentType.includes("text/html");

            let responseBody;
             let finalHeaders = {
                 ...corsHeaders, // Menggunakan corsHeaders tanpa Origin *
                 "Content-Type": contentType || "application/octet-stream" // Salin Content-Type
             };
             // Header Origin * TIDAK ditambahkan di sini secara otomatis

            if (isHtml) {
                const htmlContent = await response.text(); // Baca body sebagai teks (HTML)
                // Proses HTML, termasuk potensi penyuntikan script iframe
                responseBody = processHtml(htmlContent, prefix, targetBaseUrl, currentTargetUrl);
                 finalHeaders["Content-Type"] = "text/html; charset=utf-8"; // Pastikan Content-Type benar setelah dimodifikasi
            } else {
                responseBody = response.body; // Untuk non-HTML, gunakan body stream langsung
                 // Salin header non-Content-Type dari respons asli jika perlu
                 // for (const [key, value] of response.headers.entries()) {
                 //     if (key.toLowerCase() !== 'content-type' && key.toLowerCase() !== 'access-control-allow-origin' && key.toLowerCase() !== 'access-control-allow-methods' && key.toLowerCase() !== 'access-control-allow-headers') {
                 //          finalHeaders[key] = value;
                 //     }
                 // }
            }

            // Buat response baru
            const proxyResponse = new Response(responseBody, {
                status: response.status,
                statusText: response.statusText,
                headers: finalHeaders,
            });

            console.log(`Proxy response status for ${prefix}: ${response.status}`);
            return proxyResponse;

        } catch (error) {
            console.error(`Error fetching or processing ${prefix}:`, error);
            return new Response(`Error fetching or processing content for ${prefix}.`, {
                status: 500,
                ...corsHeaders, // Menggunakan corsHeaders tanpa Origin * untuk error proxy
            });
        }

    } else {
        // 404 Not Found for other paths (yang tidak diawali /movie, /anime, /api.php dengan id, atau /?url=)
        return new Response("Not Found", {
            status: 404,
            headers: {
                 "Content-Type": "text/plain",
                 ...corsHeaders, // Menggunakan corsHeaders tanpa Origin * untuk 404
            },
        });
     }
}

console.log("Server running on http://localhost:8000/");
console.log("Access home at: http://localhost:8000/ (tanpa parameter url)");
console.log("Access fetch URL API via: http://localhost:8000/?url=... (Origin * diizinkan)"); // Info CORS diperbarui
console.log("Access movie proxy via: http://localhost:8000/movie/...");
console.log("Access anime proxy via: http://localhost:8000/anime/...");
console.log("Access API via: http://localhost:8000/api.php?id=...");


await serve(handler, { port: 8080 });
