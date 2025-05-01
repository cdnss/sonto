// script_proxy_iframe.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import * as cheerio from 'npm:cheerio'; // Impor Cheerio dari npm

// HTML sederhana untuk halaman home dengan Bootstrap 5 dari CDN
const homeHtml = `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CORS Proxy Deno</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
    <style>
        body {
            background-color: #f8f9fa;
        }
        .container {
            margin-top: 50px;
        }
        .link-section a {
            display: block;
            margin-bottom: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="p-5 mb-4 bg-light rounded-3">
            <div class="container-fluid py-5">
                <h1 class="display-5 fw-bold text-center">Selamat Datang di CORS Proxy</h1>
                <p class="col-md-8 fs-4 mx-auto text-center">Script Deno sederhana untuk mengatasi masalah CORS, mengubah link internal, dan memanipulasi iframe.</p>
                
                <div class="text-center link-section mt-4">
                    <h2>Proxy Routes:</h2>
                    <p>Akses path proxy diikuti dengan path dan query dari situs target.</p>
                    <p class="text-danger"><small>Catatan: Proxy /movie menyuntikkan script tambahan untuk memanipulasi iframe.</small></p>
                    
                    <a href="/movie/" class="btn btn-primary btn-lg">Akses Proxy LK21 (/movie)</a>
                    <p class="mt-2">Contoh: <code>/movie/?action=view</code> akan mem-proxy <code>https://tv4.lk21official.cc/?action=view</code></p>

                    <a href="/anime/" class="btn btn-success btn-lg mt-3">Akses Proxy Anoboy (/anime)</a>
                     <p class="mt-2">Contoh: <code>/anime/page/2/</code> akan mem-proxy <code>https://ww1.anoboy.app/page/2/</code></p>
                </div>
            </div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz" crossorigin="anonymous"></script>
</body>
</html>
`;

// Atur header CORS agar bisa diakses dari mana saja
const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // Ganti '*' dengan origin spesifik jika diperlukan
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Script JavaScript yang akan disuntikkan untuk memanipulasi iframe
// Menggunakan backticks (`) untuk memudahkan penulisan multi-line
const iframeManipulationScript = `
// Kode untuk memuat jQuery jika belum ada (tetap sama)
if (typeof jQuery == 'undefined') {
    var script = document.createElement('script');
    script.src = 'https://code.jquery.com/jquery-3.6.0.min.js';
    script.onload = function() {
        // Lakukan pekerjaan setelah jQuery dimuat
        runIframeManipulation();
    };
    document.head.appendChild(script);
} else {
    // jQuery sudah ada, jalankan langsung
    runIframeManipulation();
}

// Fungsi utama untuk memanipulasi iframe
function runIframeManipulation() {
    $(document).ready(function() {
        $('iframe').each(function() {
            var $iframe = $(this); // Simpan referensi ke iframe saat ini
            var src = $iframe.attr('src');

            if (!src) {
                // Lewati jika src kosong
                return;
            }

            try {
                // Gunakan objek URL untuk mempermudah parsing src
                var srcUrl = new URL(src);

                // Dapatkan nilai parameter 'url' dari query string src iframe
                var encodedVideoUrl = srcUrl.searchParams.get('url');

                if (encodedVideoUrl) {
                    // Decode URL yang didapat dari parameter 'url'
                    var decodedVideoUrl = decodeURIComponent(encodedVideoUrl);

                    try {
                         // Parse URL yang sudah didecode untuk mendapatkan parameter 'id'
                        var videoUrlObj = new URL(decodedVideoUrl);
                        var videoId = videoUrlObj.searchParams.get('id');

                        if (videoId) {
                            // Buat URL API menggunakan id yang didapat
                            // Menggunakan '?id=' sesuai standar parameter URL
                            var apiUrl = 'https://cloud.hownetwork.xyz/api.php?id=' + videoId;

                            // Lakukan panggilan AJAX ke API
                            $.ajax({
                                url: apiUrl,
                                method: 'GET', // Biasanya API seperti ini menggunakan method GET
                                dataType: 'json', // Harapkan respons dalam format JSON
                                success: function(response) {
                                    // Periksa apakah panggilan berhasil dan data tersedia
                                    if (response.success && response.data && response.data.length > 0 && response.data[0].file) {
                                        var videoFileUrl = response.data[0].file;

                                        // Set src iframe dengan URL file video dari respons API
                                        $iframe.attr('src', videoFileUrl);
                                        console.log('Iframe src berhasil diperbarui untuk ID:', videoId, 'menjadi', videoFileUrl);
                                    } else {
                                        console.warn('Respons API tidak berhasil atau data file tidak ditemukan untuk ID:', videoId, response);
                                        // Anda bisa menambahkan logika lain di sini jika API gagal atau tidak memberikan data yang diharapkan
                                    }
                                },
                                error: function(jqXHR, textStatus, errorThrown) {
                                    console.error('Gagal melakukan panggilan API untuk ID:', videoId, textStatus, errorThrown);
                                    // Anda bisa menambahkan logika lain di sini untuk menangani kesalahan AJAX
                                }
                            });
                        } else {
                            console.warn('Parameter "id" tidak ditemukan dalam URL yang didecode:', decodedVideoUrl);
                        }
                    } catch (innerUrlError) {
                         console.error('Error parsing decoded URL:', decodedVideoUrl, innerUrlError);
                    }

                } else {
                    console.warn('Parameter "url" tidak ditemukan dalam src iframe:', src);
                }

            } catch (e) {
                console.error('Error memproses src iframe:', src, e);
                // Tangani error parsing URL jika src tidak valid
            }
        });
    });
}

`;


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
