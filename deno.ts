// script_proxy_dynamic.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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
    </style>
</head>
<body>
    <div class="container">
        <div class="p-5 mb-4 bg-light rounded-3">
            <div class="container-fluid py-5">
                <h1 class="display-5 fw-bold text-center">Selamat Datang di CORS Proxy</h1>
                <p class="col-md-8 fs-4 mx-auto text-center">Script Deno sederhana untuk mengatasi masalah CORS.</p>
                <div class="text-center">
                    <p>Akses path <code>/movie</code> diikuti dengan path dan query yang kamu inginkan dari situs target.</p>
                    <p>Contoh: <a href="/movie/?action=view&id=123">/movie/?action=view&id=123</a> akan mem-proxy <code>https://tv4.lk21official.cc/?action=view&id=123</code></p>
                    <a href="/movie/" class="btn btn-primary btn-lg mt-3">Coba Akses /movie/</a>
                </div>
            </div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" integrity="sha384-YvpcrYf0tY3lHB60NNkmXc5s9fDVZLESaAA55NDzOxhy9GkcIdslK1eN7N6jIeHz" crossorigin="anonymous"></script>
</body>
</html>
`;

// Handler untuk setiap request
async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Atur header CORS agar bisa diakses dari mana saja
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*", // Ganti '*' dengan origin spesifik jika diperlukan
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle OPTIONS requests (preflight CORS)
    if (req.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    }

    if (url.pathname === "/") {
        // Serve home page
        return new Response(homeHtml, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                ...corsHeaders, // Tambahkan CORS headers juga ke home page
            },
        });
    } else if (url.pathname.startsWith("/movie")) { // Tangani path yang diawali dengan /movie
        const targetBaseUrl = "https://tv4.lk21official.cc";
        
        // Ambil sisa path setelah '/movie'
        let remainingPath = url.pathname.substring("/movie".length);
        // Pastikan path dimulai dengan '/' jika tidak kosong
        if (remainingPath !== "" && !remainingPath.startsWith("/")) {
             remainingPath = "/" + remainingPath;
        } else if (remainingPath === "") {
            // Jika path hanya '/movie', arahkan ke root '/' target
             remainingPath = "/";
        }
        
        // Gabungkan base URL target, sisa path, dan query string dari request asli
        const targetUrl = `${targetBaseUrl}${remainingPath}${url.search}`;

        console.log(`Proxying request to: ${targetUrl} (from ${req.url})`);

        try {
            // Fetch konten dari URL tujuan
            const response = await fetch(targetUrl, {
                 method: req.method, // Lewatkan method request asli (GET, POST, dll)
                 headers: req.headers, // Lewatkan header request asli (opsional, hati-hati dengan header sensitif)
                 body: req.body, // Lewatkan body request asli (jika ada, misalnya untuk POST)
                 redirect: 'follow' // Ikuti redirect jika ada
            });

            // Buat response baru dengan body dari response target dan tambahkan CORS headers
            const proxyResponse = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: {
                    ...corsHeaders, // Tambahkan CORS headers
                    // Salin Content-Type dan header relevan lainnya dari target
                    "Content-Type": response.headers.get("Content-Type") || "application/octet-stream", 
                    // Tambahkan header lain yang ingin disalin, contoh:
                    // "Cache-Control": response.headers.get("Cache-Control") || "",
                },
            });

            console.log(`Proxy response status: ${response.status}`);
            return proxyResponse;

        } catch (error) {
            console.error("Error fetching target URL:", error);
            return new Response("Error fetching external content.", {
                status: 500,
                headers: corsHeaders, // Tambahkan CORS headers ke response error
            });
        }

    } else {
        // 404 Not Found for other paths
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
await serve(handler, { port: 8000 });
