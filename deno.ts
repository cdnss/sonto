// File: server.ts

// Import fungsi dari main.ts (SETELAH main.ts DIADAPTASI UNTUK DENO)
import { filterRequestHeaders, transformHTML } from './main.ts'; // Path relatif dari server.ts ke main.ts
 
// Konfigurasi target URL dari Environment Variable
const target = Deno.env.get("TARGET_URL") || "https://ww1.anoboy.app";

// Header CORS
const corsHeaders = new Headers({
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Origin, X-Requested-With, Content-Type, Accept",
});

// Parse target origin
let targetOrigin: string | null;
try {
  targetOrigin = new URL(target).origin;
} catch (e) {
  console.error("[ERROR] Invalid TARGET_URL configured:", target, e);
  targetOrigin = null;
}

// Handler untuk Deno Deploy (Request Listener)
// Deno Deploy memanggil fungsi handler ini untuk setiap request masuk
Deno.serve(async (request: Request) => {
    const requestUrl = new URL(request.url);
    const canonicalUrl = requestUrl.href; // request.url di Deno Deploy adalah URL lengkap

    console.log(`[INFO] Deno Deploy received request: ${request.method} ${request.url}`);

    // Tangani preflight CORS (OPTIONS)
    if (request.method === "OPTIONS") {
        console.log("[INFO] Handling CORS preflight request.");
        return new Response(null, { headers: corsHeaders });
    }

    // Bentuk URL target
    const targetUrl = new URL(target + requestUrl.pathname + requestUrl.search);
    console.log(`[INFO] Fetching target URL: ${targetUrl.toString()}`);

    try {
        // Gunakan filterRequestHeaders (setelah diadaptasi di main.ts)
        const filteredHeaders = filterRequestHeaders(request.headers); // Pass Request.headers langsung

        // Fetch target
        const targetResponse = await fetch(targetUrl.toString(), {
            method: request.method,
            headers: filteredHeaders, // Gunakan headers yang difilter
            body: request.body, // Teruskan body
            redirect: 'manual' // Tangani redirect manual
        });

        console.log(`[INFO] Received response from target: Status ${targetResponse.status}`);

        // --- Logika Penanganan Redirect 3xx ---
        // Ini mirip dengan kode Vercel Anda, pastikan menggunakan targetResponse.headers.get('location')
         if (targetResponse.status >= 300 && targetResponse.status < 400 && targetResponse.headers.has('location')) {
             const location = targetResponse.headers.get('location');
             if (!location) {
                 console.error("[ERROR] Redirect response missing Location header.");
                 const errorHeaders = new Headers(corsHeaders);
                 return new Response("Internal Server Error: Invalid redirect response", { status: 500, headers: errorHeaders });
             }
             console.log(`[INFO] Target responded with redirect to: ${location}`);
             try {
                  // Resolve location relatif terhadap canonicalUrl
                 const redirectedUrl = new URL(location, canonicalUrl);
                 let proxiedRedirectUrl = redirectedUrl.toString();

                 // Logika rewrite URL redirect (mirip dengan kode Vercel Anda)
                  const canonicalOrigin = new URL(canonicalUrl).origin;
                  if (targetOrigin && (redirectedUrl.origin === targetOrigin || (redirectedUrl.host.endsWith('.' + new URL(target).hostname) && redirectedUrl.origin.startsWith('http')))) {
                     proxiedRedirectUrl = redirectedUrl.toString().replace(targetOrigin, canonicalOrigin);
                     proxiedRedirectUrl = proxiedRedirectUrl.replace('http://', 'https://'); // Pastikan HTTPS
                     console.log(`[INFO] Rewrote redirect URL to proxy host: ${proxiedRedirectUrl}`);
                 } else {
                     console.log("[INFO] Redirecting to non-target domain or already relative path, passing through location.");
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
                  console.error("[ERROR] Failed to process redirect location:", location, e);
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
        }
        // --- Akhir Logika Redirect ---


        const contentType = targetResponse.headers.get("content-type") || "";
        console.log(`[INFO] Target response Content-Type: ${contentType}`);

        if (contentType.includes("text/html")) {
            const htmlContent = await targetResponse.text();
            console.log("[INFO] Processing HTML content.");

            // Panggil transformHTML (SETELAH DIADAPTASI UNTUK DENO)
            // Anda perlu melewatkan target string juga jika transformHTML membutuhkannya
            // const modifiedHtml = transformHTML(htmlContent, canonicalUrl, targetOrigin, target);

            // Untuk saat ini, gunakan HTML asli jika transformHTML belum diadaptasi
            console.warn("[WARN] Using original HTML because transformHTML is not adapted for Deno.");
            const modifiedHtml = htmlContent;


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
        console.error("[ERROR] Error fetching or processing target:", error);
        return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
    }
});

console.log(`[INFO] Deno server started, targeting: ${target}`); // Log ini hanya muncul sekali saat instance pertama dijalankan
