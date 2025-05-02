// post.ts

/**
 * Melakukan permintaan POST ke API target dengan ID yang diberikan.
 * Menggunakan redirect: 'manual' untuk mengembalikan objek Response apa adanya,
 * memungkinkan caller untuk menangani redirect dan status lainnya.
 *
 * @param id ID yang akan digunakan dalam parameter query URL.
 * @returns Promise yang mengembalikan objek Response dari server target.
 * @throws Error jika parameter ID tidak valid atau permintaan fetch gagal (error jaringan).
 * Tidak melempar error untuk status HTTP non-OK; caller harus memeriksanya.
 */
export async function postDataToApi(id: string): Promise<Response> { // Mengembalikan Promise<Response>
  // Memeriksa apakah ID valid
  if (!id || typeof id !== 'string') {
    // Melempar Error di sini karena ini adalah masalah input, bukan respons server
    throw new Error("Parameter ID tidak valid.");
  }

  // Membangun URL target awal dengan ID yang diberikan
  const initialTargetUrl = `https://cloud.hownetwork.xyz/api.php?id=${encodeURIComponent(id)}`;

  // Payload untuk permintaan POST
  const payload = { r: '', d: 'cors.ctrlc.workers.dev' };

  console.log(`[postDataToApi] Melakukan permintaan POST ke: ${initialTargetUrl}`); // Log di dalam fungsi fetch

  try {
    // Melakukan permintaan POST TANPA mengikuti redirect secara otomatis
    // Mengembalikan Response object apa adanya
    const targetResponse = await fetch(initialTargetUrl, {
      method: 'POST',
      redirect: 'manual', // PENTING: Jangan ikuti redirect secara otomatis
      headers: {
        "Content-Type": "application/json",
        // Anda mungkin perlu meneruskan header lain dari permintaan klien awal di sini di proxy
      },
      body: JSON.stringify(payload)
    });

    console.log(`[postDataToApi] Menerima respons dengan status: ${targetResponse.status}. Mengembalikan Response.`);

    // Mengembalikan objek Response untuk diproses oleh caller (kode proxy di deno.ts)
    return targetResponse;

  } catch (error: any) {
    // Menangani error jaringan atau error lain yang mencegah fetch berhasil sama sekali
    console.error(`[postDataToApi ERROR] Error saat melakukan fetch ke '${initialTargetUrl}' untuk ID '${id}':`, error);
    // Melemparkan error baru dengan pesan yang jelas jika fetch gagal total
    // Caller (handler Deno) akan menangkap ini dan mengembalikan respons error 500 ke klien
    throw new Error(`[postDataToApi ERROR] Gagal terhubung atau melakukan fetch ke target untuk ID '${id}': ${error.message}`);
  }
}

// File ini tidak menjalankan server, hanya mengekspor fungsi.
