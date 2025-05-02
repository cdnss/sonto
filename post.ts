// Import tipe Response dan Request jika Anda ingin anotasi tipe
import type { Request, Response } from "https://deno.land/std@0.224.0/http/server.ts";

// Definisikan interface untuk konfigurasi logika proksi
export interface ProxyConfig {
    // Path di server Anda yang akan memicu logika proksi ini
    // Contoh: '/api/data-proxy'
    triggerPath: string;
    // URL target tujuan proksi
    targetUrl: string;
}

/**
 * Fungsi untuk menerapkan logika proksi CORS untuk permintaan tertentu.
 * Jika request.url.pathname cocok dengan triggerPath, fungsi ini akan
 * melakukan proxy request ke targetUrl dan mengembalikan Response dengan header CORS.
 * Jika tidak cocok, fungsi akan mengembalikan null.
 *
 * @param request - Objek Request masuk dari klien.
 * @param config - Konfigurasi proxy, termasuk triggerPath dan targetUrl.
 * @returns Promise yang me-resolve dengan Response yang diproksi (dengan CORS) atau null.
 */
export async function getvid(
    request: Request,
    config: ProxyConfig
): Promise<Response | null> {
    const url = new URL(request.url);

    // Cek apakah path permintaan cocok dengan triggerPath yang ditentukan
    if (url.pathname !== config.triggerPath) {
        // Path tidak cocok, logika proksi tidak diterapkan untuk permintaan ini
        // console.log(`[ProxyLogic] Path "${url.pathname}" tidak cocok dengan triggerPath "${config.triggerPath}". Melewati.`); // Opsional
        return null;
    }

    console.log(`[ProxyLogic] Permintaan ke "${url.pathname}" cocok. Menerapkan logika proksi ke "${config.targetUrl}"`);

    // --- Logika proksi CORS yang sama seperti sebelumnya ---

    // Tangani permintaan pre-flight OPTIONS untuk CORS hanya jika path cocok
    if (request.method === "OPTIONS") {
        // console.log("[ProxyLogic] Menangani permintaan OPTIONS (pre-flight CORS)"); // Opsional
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*", // Izinkan dari asal manapun
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", // Metode yang diizinkan
                "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "*", // Izinkan header yang diminta atau semua
                "Access-Control-Max-Age": "86400", // Cache pre-flight request selama 24 jam
            },
        });
    }

    // Tangani permintaan lainnya (GET, POST, dll.) jika path cocok
    try {
        // console.log(`[ProxyLogic] Meneruskan ${request.method} request ke: ${config.targetUrl}`); // Opsional
        const targetRequest = new Request(config.targetUrl, {
            method: request.method,
            headers: request.headers,
            body: request.body, // Body akan null untuk GET/HEAD
            redirect: 'follow',
        });

        const targetResponse = await fetch(targetRequest);
        // console.log(`[ProxyLogic] Menerima respons dari target dengan status: ${targetResponse.status}`); // Opsional

        const clientResponse = new Response(targetResponse.body, {
            status: targetResponse.status,
            statusText: targetResponse.statusText,
            headers: new Headers(targetResponse.headers),
        });

        // Tambahkan/timpa header CORS penting ke respons klien
        clientResponse.headers.set("Access-Control-Allow-Origin", "*");

        const vary = clientResponse.headers.get('Vary');
        if (vary) {
            if (!vary.toLowerCase().includes('origin')) {
                 clientResponse.headers.set('Vary', `${vary}, Origin`);
            }
        } else {
            clientResponse.headers.set('Vary', 'Origin');
        }

         const hopByHopHeaders = [
            'Connection', 'Keep-Alive', 'Proxy-Authenticate', 'Proxy-Authorization',
            'Te', 'Trailers', 'Transfer-Encoding', 'Upgrade'
        ];
         hopByHopHeaders.forEach(header => {
            if (clientResponse.headers.has(header)) {
               clientResponse.headers.delete(header);
            }
        });


        // Mengembalikan respons yang sudah dimodifikasi dengan header CORS
        console.log(`[ProxyLogic] Mengembalikan respons yang diproksi untuk "${url.pathname}"`);
        return clientResponse;

    } catch (error) {
        console.error("[ProxyLogic] Terjadi kesalahan saat permintaan proksi:", error);
        // Mengembalikan respons error jika terjadi masalah pada proksi
        return new Response(`Proxy error: ${error.message}`, { status: 500 });
    }
}
