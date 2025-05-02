// deno.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import * as cheerio from 'npm:cheerio'; // Impor Cheerio dari npm
import { jq } from "./jq.ts";
import { postDataToApi } from "./post.ts"; // Import fungsi postDataToApi dari post.ts
import { processHtml } from "./xhtml.ts";
// HTML sederhana untuk halaman home dengan Bootstrap 5 dari CDN
const homeHtml = await Deno.readTextFile('./index.html');

// Atur header CORS agar bisa diakses dari mana saja
const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // Ganti '*' dengan origin spesifik jika diperlukan
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Script JavaScript yang akan disuntikkan untuk memanipulasi iframe
// Menggunakan backticks (`) untuk memudahkan penulisan multi-line
const iframeManipulationScript = jq("crot");



// Handler untuk setiap request
async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Handle OPTIONS requests (preflight CORS)
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    }

    // Handle home page
    if (url.pathname === "/") {
        return new Response(homeHtml, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                ...corsHeaders,
            },
        });
    }

    // --- MULAI PENANGANAN API BARU ---
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
                    ...corsHeaders, // Tambahkan header CORS
                },
                status: 200, // Status OK
            });

        } catch (error) {
            console.error("Error saat memproses permintaan API:", error);
            // Tangani error dan kirim respons error JSON
            return new Response(JSON.stringify({ error: "Internal Server Error", details: error.message }), {
                headers: {
                     "Content-Type": "application/json",
                    ...corsHeaders, // Tambahkan header CORS
                },
                status: 500, // Status Internal Server Error
            });
        }
    }
    // --- AKHIR PENANGANAN API BARU ---


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
                 // headers: req.headers, // Hati-hati saat meneruskan header klien
                 body: req.body, // Lewatkan body request asli (jika ada)
                 redirect: 'follow' // Ikuti redirect jika ada
            });

            // Cek Content-Type
            const contentType = response.headers.get("Content-Type");
            const isHtml = contentType && contentType.includes("text/html");

            let responseBody;
             let finalHeaders = {
                 ...corsHeaders,
                 "Content-Type": contentType || "application/octet-stream" // Salin Content-Type
             };
             // Tambahkan header relevan lainnya jika perlu disalin
             // "Cache-Control": response.headers.get("Cache-Control") || "",


            if (isHtml) {
                const htmlContent = await response.text(); // Baca body sebagai teks (HTML)
                // Proses HTML, termasuk potensi penyuntikan script iframe
                responseBody = processHtml(htmlContent, prefix, targetBaseUrl, currentTargetUrl);
                 finalHeaders["Content-Type"] = "text/html; charset=utf-8"; // Pastikan Content-Type benar setelah dimodifikasi
            } else {
                responseBody = response.body; // Untuk non-HTML, gunakan body stream langsung
                 // Salin header non-Content-Type dari respons asli jika perlu
                 // for (const [key, value] of response.headers.entries()) {
                 //     if (key.toLowerCase() !== 'content-type' && key.toLowerCase() !== 'access-control-allow-origin' && key.toLowerCase() !== 'access-control-allow-methods' && key.toLowerCase() !== 'access-control-allow-headers') {
                 //          finalHeaders[key] = value;
                 //     }
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
                 headers: corsHeaders, // Tambahkan CORS headers ke response error
            });
        }

    } else {
        // 404 Not Found for other paths (yang tidak diawali /movie, /anime, atau /api.php dengan id)
        return new Response("Not Found", {
            status: 404,
            headers: {
                 "Content-Type": "text/plain",
                 ...corsHeaders, // Tambahkan CORS headers juga ke 404
            },
        });
    }
}

console.log("Server running on http://localhost:8000/");
console.log("Access home at: http://localhost:8000/");
console.log("Access movie proxy via: http://localhost:8000/movie/...");
console.log("Access anime proxy via: http://localhost:8000/anime/...");
console.log("Access API via: http://localhost:8000/api.php?id=...");
await serve(handler, { port: 8000 });
