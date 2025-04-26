// Import fungsi logika dari main.ts
// Pastikan path import benar relatif terhadap lokasi file ano.ts
import { filterRequestHeaders, transformHTML } from '../../main.ts'; // Sesuaikan path jika main.ts di lokasi berbeda

// Konfigurasi melalui environment variable
// Di Netlify Edge Functions, environment variables bisa diakses via Deno.env.get()
const target = Deno.env.get("TARGET_URL") || "https://ww1.anoboy.app";

// Header CORS standar
const corsHeaders = new Headers({
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "Origin, X-Requested-With, Content-Type, Accept",
});

// Coba parse targetOrigin di awal untuk menghindari parsing berulang
let targetOrigin: string | null;
try {
    targetOrigin = new URL(target).origin;
} catch (e) {
    console.error("[ERROR] Invalid TARGET_URL configured:", target, e);
    targetOrigin = null;
}


/**
 * Handler untuk Netlify Edge Function.
 * Menerima Request dan Context, mengembalikan Response.
 */
export default async function handler(request: Request, context: any): Promise<Response> {
  // Di Edge Function, URL request sudah mencerminkan domain Edge Function
  const requestUrl = new URL(request.url);
  const canonicalUrl = requestUrl.href; // Gunakan URL request sebagai canonical

   console.log(`[INFO] Edge Function received request: ${request.method} ${request.url}`);
   // console.log("[INFO] Request headers:", request.headers);
   // console.log("[INFO] Context:", context);


  // Tangani preflight CORS (OPTIONS)
  if (request.method === "OPTIONS") {
    console.log("[INFO] Handling CORS preflight request.");
    return new Response(null, { headers: corsHeaders });
  }

  // Bentuk URL target berdasarkan path & query dari request Edge Function
  const targetUrl = new URL(target + requestUrl.pathname + requestUrl.search);
   console.log(`[INFO] Fetching target URL: ${targetUrl.toString()}`);

  try {
    const filteredHeaders = filterRequestHeaders(request.headers);

    // Edge Functions memiliki 'fetch' global yang mirip dengan Deno dan Browser
    const targetResponse = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: filteredHeaders,
      body: request.body, // Teruskan body untuk POST, PUT, dll.
      redirect: 'manual' // Jangan ikuti redirect otomatis, tangani secara manual
    });

    console.log(`[INFO] Received response from target: Status ${targetResponse.status}`);


    // Tangani redirect 3xx jika target merespons dengan redirect
    if (targetResponse.status >= 300 && targetResponse.status < 400 && targetResponse.headers.has('location')) {
        const location = targetResponse.headers.get('location');
         if (!location) {
             console.error("[ERROR] Redirect response missing Location header.");
              // Fallback ke error 500 jika redirect invalid
             const errorHeaders = new Headers(corsHeaders);
             return new Response("Internal Server Error: Invalid redirect response", { status: 500, headers: errorHeaders });
         }
        console.log(`[INFO] Target responded with redirect to: ${location}`);
        try {
            // Resolve location relatif terhadap URL request Vercel (canonicalUrl)
            const redirectedUrl = new URL(location, canonicalUrl);

            let proxiedRedirectUrl = redirectedUrl.toString();
            // Periksa apakah URL redirect mengarah kembali ke targetOrigin
             if (targetOrigin && (redirectedUrl.origin === targetOrigin || (redirectedUrl.host.endsWith('.' + new URL(target).hostname) && redirectedUrl.origin.startsWith('http')))) {
                 // Ganti host dari URL redirect jika mengarah kembali ke targetOrigin
                 proxiedRedirectUrl = redirectedUrl.toString().replace(targetOrigin, new URL(canonicalUrl).origin);
                 proxiedRedirectUrl = proxiedRedirectUrl.replace('http://', 'https://'); // Pastikan HTTPS
                 console.log(`[INFO] Rewrote redirect URL to proxy host: ${proxiedRedirectUrl}`);
            } else {
                 console.log("[INFO] Redirecting to non-target domain or already relative path, passing through location.");
            }


            const redirectHeaders = new Headers(corsHeaders);
            // Copy relevant headers from target response
            for (const [key, value] of targetResponse.headers) {
                if (key.toLowerCase() === 'location') {
                    redirectHeaders.set(key, proxiedRedirectUrl); // Set location yang sudah dimodifikasi
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
             // Fallback: return original redirect response
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


    const contentType = targetResponse.headers.get("content-type") || "";
    console.log(`[INFO] Target response Content-Type: ${contentType}`);

    if (contentType.includes("text/html")) {
      const htmlContent = await targetResponse.text();
      console.log("[INFO] Processing HTML content.");
      // Panggil fungsi transformHTML dari main.ts
      const modifiedHtml = transformHTML(
  htmlContent,
  canonicalUrl,
  targetOrigin,
  target,       // selectedTargetUrl, biasanya sama dengan TARGET_URL env
  "default"     // atau "anime"/"movies" jika ingin routing
);
      const responseHeaders = new Headers(corsHeaders);
      // Copy relevant headers from target response, excluding content-specific ones
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
      // Untuk aset non-HTML, teruskan body dan sebagian besar header
      console.log("[INFO] Proxying non-HTML content.");
      const responseHeaders = new Headers(corsHeaders);
      for (const [key, value] of targetResponse.headers) {
        if (key.toLowerCase() === "content-encoding" || key.toLowerCase() === "content-length") {
            console.log(`[INFO] Skipping content header: ${key}`);
            continue;
        }
        responseHeaders.set(key, value);
      }

      // TargetResponse.body adalah ReadableStream, bisa langsung dikembalikan oleh Edge Function
      return new Response(targetResponse.body, {
        status: targetResponse.status,
        statusText: targetResponse.statusText,
        headers: responseHeaders,
      });
    }
  } catch (error) {
    console.error("[ERROR] Error fetching or processing target:", error);
    // Pastikan response error juga memiliki header CORS
    return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
  }
}
