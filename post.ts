// post.ts

/**
 * Melakukan permintaan POST ke API target dengan ID yang diberikan.
 * Secara otomatis mengikuti pengalihan (redirect) HTTP.
 *
 * @param id ID yang akan digunakan dalam parameter query URL.
 * @returns Promise yang mengembalikan respons JSON dari API target (dari URL akhir setelah pengalihan).
 * @throws Error jika parameter ID tidak valid, permintaan fetch gagal, atau API target mengembalikan status non-OK (baik dari URL awal maupun URL setelah pengalihan).
 */
export async function postDataToApi(id: string): Promise<any> {
  // Memeriksa apakah ID valid
  if (!id || typeof id !== 'string') {
    throw new Error("Parameter ID tidak valid.");
  }

  // Membangun URL target awal dengan ID yang diberikan
  const initialTargetUrl = `https://cloud.hownetwork.xyz/api.php?id=${encodeURIComponent(id)}`;

  // Payload untuk permintaan POST
  const payload = { r: '', d: 'cors.ctrlc.workers.dev' };

  console.log(`Melakukan permintaan POST ke: ${initialTargetUrl}`); // Log URL awal

  try {
    // Melakukan permintaan POST dengan mengikuti redirect
    const fetchResponse = await fetch(initialTargetUrl, {
      method: 'POST',
      redirect: 'manual', // Ini saya ganti manualb
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload)
    });

    // Memeriksa apakah pengalihan terjadi
    if (fetchResponse.redirected) {
      console.log(`Permintaan dialihkan ke: ${fetchResponse.url}`); // Log URL akhir setelah pengalihan
    } else {
       console.log(`Permintaan tidak dialihkan. URL respons: ${fetchResponse.url}`); // Log URL respons jika tidak ada pengalihan
    }


    // Memeriksa apakah respons dari URL akhir OK (status 2xx)
    if (!fetchResponse.ok) {
       let errorBody: any;
       const responseUrl = fetchResponse.url; // Ambil URL respons (setelah pengalihan jika ada)
       try {
           // Coba baca body respons (mungkin berisi detail error dalam JSON)
           errorBody = await fetchResponse.json();
       } catch (jsonError) {
            // Jika bukan JSON, coba baca sebagai teks
             try {
               errorBody = await fetchResponse.text();
             } catch (textError) {
               errorBody = `Tidak dapat membaca body respons. Status: ${fetchResponse.status} dari URL: ${responseUrl}`;
             }
       }
      // Melemparkan Error jika status non-OK, termasuk status, URL akhir, dan body (jika ada)
      throw new Error(`Server target merespons dengan status ${fetchResponse.status} dari URL: ${responseUrl}. Body: ${JSON.stringify(errorBody).substring(0, 200) + (typeof errorBody === 'string' && errorBody.length > 200 ? '...' : '')}`);
    }

    // Mengurai body respons sebagai JSON
    // Penting: Ini akan mencoba mengurai JSON dari respons URL akhir setelah pengalihan.
    // Jika URL akhir mengembalikan sesuatu yang BUKAN JSON (seperti halaman 404),
    // await fetchResponse.json() akan gagal dan ditangkap oleh block catch di bawah.
    const responseBody = await fetchResponse.json();

    // Mengembalikan data JSON dari respons akhir
    return responseBody;

  } catch (error: any) {
    // Menangani error jaringan, error parsing JSON dari respons, atau error lain selama proses fetch
    console.error(`Error saat melakukan fetch untuk ID '${id}' (setelah potensi pengalihan):`, error);
    // Melemparkan error baru dengan pesan yang jelas
    throw new Error(`Gagal mengambil data untuk ID '${id}' (setelah potensi pengalihan): ${error.message}`);
  }
}

// File ini tidak menjalankan server, hanya mengekspor fungsi.
