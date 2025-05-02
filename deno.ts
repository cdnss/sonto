// script_proxy_iframe.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import * as cheerio from 'npm:cheerio'; // Impor Cheerio dari npm
import { jq } from "./jq.ts";
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

/**
 * Fungsi untuk memproses HTML menggunakan Cheerio dan mengubah link.
 * Mengubah link internal (mengarah ke targetBaseUrl) agar mengarah kembali ke proxy
 * dengan prefix yang sesuai. Juga menyuntikkan script iframe untuk prefix /movie.
 * @param htmlContent String konten HTML.
 * @param prefix Prefix path proxy ('/movie' atau '/anime').
 * @param targetBaseUrl Base URL dari situs target (misal 'https://tv4.lk21official.cc').
 * @param currentTargetUrl URL lengkap halaman target yang sedang diproses (untuk resolusi link relatif).
 * @returns String HTML yang sudah dimodifikasi.
 */
function processHtml(htmlContent: string, prefix: "/movie" | "/anime", targetBaseUrl: string, currentTargetUrl: string): string {
    const $ = cheerio.load(htmlContent);
    const targetOrigin = new URL(targetBaseUrl).origin; // Ambil origin dari target

    // Elemen dan atribut yang mungkin berisi URL
    const elementsToProcess = [
        { selector: 'a[href]', attribute: 'href' },
        { selector: 'link[href]', attribute: 'href' },
        { selector: 'img[src]', attribute: 'src' },
        { selector: 'script[src]', attribute: 'src' },
        { selector: 'source[src]', attribute: 'src' }, // untuk <picture> atau <video>
        // { selector: 'iframe[src]', attribute: 'src' }, // IFRAME akan ditangani oleh script yang disuntikkan di klien
        { selector: 'form[action]', attribute: 'action' }, // Form submission
    ];

    elementsToProcess.forEach(({ selector, attribute }) => {
        $(selector).each((i, elem) => {
            const originalValue = $(elem).attr(attribute);

            if (originalValue) {
                // Lewati jika anchor, mailto, tel, js, atau path kosong/hanya query string
                if (originalValue.startsWith('#') || originalValue.startsWith('mailto:') || originalValue.startsWith('tel:') || originalValue.startsWith('javascript:')) {
                    return;
                }

                try {
                    // Resolusi URL relatif terhadap halaman target yang sedang diproses
                    const resolvedUrl = new URL(originalValue, currentTargetUrl);

                    // Cek apakah URL yang diresolusi berasal dari domain target
                    if (resolvedUrl.origin === targetOrigin) {
                        // Bangun URL baru yang mengarah ke proxy Deno ini
                        const newUrl = `${prefix}${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
                        $(elem).attr(attribute, newUrl);
                         // console.log(`Transformed: ${originalValue} -> ${newUrl}`);
                    } else {
                        // Jika URL mengarah ke domain lain, biarkan saja
                        // console.log(`Skipping external URL: ${originalValue}`);
                    }
                } catch (e) {
                    // Tangani error jika nilai atribut bukan URL valid
                     console.warn(`Skipping invalid URL "${originalValue}" relative to "${currentTargetUrl}": ${e}`);
                }
            }
        });
    });

    // --- Logika penyuntikan script iframe ---
    if (prefix === "/movie") {
        console.log(`Menyuntikkan script manipulasi iframe untuk ${prefix}`);
        // Buat tag script dan tambahkan konten JavaScript
        const scriptTag = `<script>${iframeManipulationScript}</script>`;
        // Suntikkan di akhir body
        $('body').append(scriptTag);
    }
    // --- Akhir logika penyuntikan script iframe ---


    return $.html(); // Kembalikan HTML yang sudah dimodifikasi
}


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

    // Gabungkan penanganan /movie dan /anime dalam satu blok
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
        // 404 Not Found for other paths (yang tidak diawali /movie atau /anime)
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
await serve(handler, { port: 8000 });
