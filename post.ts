// post.ts
// Import fungsi serve dari Deno standard library
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
// Import tipe Server jika Anda ingin anotasi tipe untuk nilai kembali
import type { Server } from "https://deno.land/std@0.224.0/http/server.ts";

// Definisikan interface untuk opsi konfigurasi proksi
interface ProxyOptions {
    port: number; // Port tempat proksi akan mendengarkan
    targetUrl: string; // URL target yang akan diproksi
}

/**
 * Memulai server proksi CORS Deno.
 *
 * @param options - Objek konfigurasi yang berisi port dan targetUrl.
 * @returns Promise yang me-resolve dengan instance Server setelah server mulai.
 */
export async function getvid(options: ProxyOptions): Promise<Server> {
    const { port, targetUrl } = options;

    console.log(`[Proxy] Memulai proksi CORS Deno di http://localhost:${port}`);
    console.log(`[Proxy] Memproksi permintaan ke: ${targetUrl}`);

    // Handler untuk setiap permintaan masuk ke server proksi
    const handler = async (request: Request): Promise<Response> => {
        // Tangani permintaan pre-flight OPTIONS untuk CORS
        if (request.method === "OPTIONS") {
            // console.log("[Proxy] Menangani permintaan OPTIONS (pre-flight CORS)"); // Opsional untuk debugging
            return new Response(null, {
                status: 204, // No Content untuk permintaan OPTIONS yang berhasil
                headers: {
                    "Access-Control-Allow-Origin": "*", // Izinkan permintaan dari asal manapun
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", // Metode yang diizinkan
                    "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "*", // Izinkan header yang diminta oleh klien atau semua
                    "Access-Control-Max-Age": "86400", // Cache pre-flight request selama 24 jam
                },
            });
        }

        // Tangani permintaan lainnya (GET, POST, dll.)
        try {
            // console.log(`[Proxy] Meneruskan ${request.method} ${request.url} ke target`); // Opsional untuk debugging
            // Buat permintaan baru untuk URL target
            // Salin metode, header, dan body dari permintaan asli klien
            const targetRequest = new Request(targetUrl, {
                method: request.method,
                headers: request.headers,
                body: request.body, // Body akan null untuk GET/HEAD
                redirect: 'follow', // Secara default Deno akan mengikuti redirect
            });

            // Kirim permintaan ke URL target dan tunggu responsnya
            const targetResponse = await fetch(targetRequest);
            // console.log(`[Proxy] Menerima respons dari target dengan status: ${targetResponse.status}`); // Opsional untuk debugging

            // Buat respons baru untuk dikirim kembali ke klien
            // Salin body, status, dan statusText dari respons target
            const clientResponse = new Response(targetResponse.body, {
                status: targetResponse.status,
                statusText: targetResponse.statusText,
                headers: new Headers(targetResponse.headers), // Salin semua header dari respons target
            });

            // TAMBAHKAN/TIMPA HEADER CORS PENTING
            // Ini adalah bagian kunci yang membuat proksi ini berfungsi sebagai proksi CORS
            clientResponse.headers.set("Access-Control-Allow-Origin", "*"); // Mengizinkan akses dari domain manapun

            // Pastikan header Vary mencakup 'Origin' untuk penanganan cache yang benar pada respons CORS
            const vary = clientResponse.headers.get('Vary');
            if (vary) {
                if (!vary.toLowerCase().includes('origin')) {
                     clientResponse.headers.set('Vary', `${vary}, Origin`);
                }
            } else {
                clientResponse.headers.set('Vary', 'Origin');
            }

            // Hapus header hop-by-hop yang mungkin disalin tapi tidak seharusnya diteruskan (opsional tapi baik)
            // Deno fetch umumnya sudah menangani ini, tapi eksplisit lebih aman.
            const hopByHopHeaders = [
                'Connection', 'Keep-Alive', 'Proxy-Authenticate', 'Proxy-Authorization',
                'Te', 'Trailers', 'Transfer-Encoding', 'Upgrade'
            ];
             hopByHopHeaders.forEach(header => {
                if (clientResponse.headers.has(header)) {
                   clientResponse.headers.delete(header);
                }
            });


            // console.log("[Proxy] Mengirim respons kembali ke klien dengan header CORS"); // Opsional untuk debugging
            return clientResponse;

        } catch (error) {
            console.error("[Proxy] Terjadi kesalahan saat permintaan proksi:", error);
            // Berikan respons error jika terjadi masalah saat mengambil data dari target
            return new Response(`Proxy error: ${error.message}`, { status: 500 });
        }
    };

    // Jalankan server Deno menggunakan handler yang telah dibuat
    // Deno.serve mengembalikan Promise<Server> yang me-resolve saat server siap
    const server = await serve(handler, { port });

    // Mengembalikan instance server agar bisa dikelola oleh pemanggil (misal: dihentikan)
    return server;
}

