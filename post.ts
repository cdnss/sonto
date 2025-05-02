// post.ts

/**
 * Melakukan permintaan POST ke API target dengan ID yang diberikan.
 *
 * @param id ID yang akan digunakan dalam parameter query URL.
 * @returns Promise yang mengembalikan respons JSON dari API target.
 * @throws Error jika permintaan fetch gagal atau API target mengembalikan status non-OK.
 */
export async function postDataToApi(id: string): Promise<any> {
  // Memeriksa apakah ID valid
  if (!id || typeof id !== 'string') {
    throw new Error("Parameter ID tidak valid.");
  }

  // Membangun URL target dengan ID yang diberikan
  const targetUrl = `https://cors.ctrlc.workers.dev/api.php?id=${encodeURIComponent(id)}`;

  // Payload untuk permintaan POST
  const payload = { r: '', d: 'cors.ctrlc.workers.dev' };

  try {
    // Melakukan permintaan POST
    const fetchResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    // Memeriksa apakah respons dari target OK (status 2xx)
    if (!fetchResponse.ok) {
       let errorBody: any;
       try {
           // Coba baca body respons (mungkin berisi detail error dalam JSON)
           errorBody = await fetchResponse.json();
       } catch (jsonError) {
            // Jika bukan JSON, baca sebagai teks
             try {
               errorBody = await fetchResponse.text();
             } catch (textError) {
               errorBody = `Tidak dapat membaca body respons. Status: ${fetchResponse.status}`;
             }
       }
      // Melemparkan Error jika status non-OK, termasuk status dan body (jika ada)
      throw new Error(`Server target merespons dengan status ${fetchResponse.status}. Body: ${JSON.stringify(errorBody).substring(0, 200) + (typeof errorBody === 'string' && errorBody.length > 200 ? '...' : '')}`);
    }

    // Mengurai body respons sebagai JSON
    const responseBody = await fetchResponse.json();

    // Mengembalikan data JSON
    return responseBody;

  } catch (error) {
    // Menangani error jaringan atau error lain selama proses fetch
    console.error(`Error saat melakukan fetch untuk ID '${id}':`, error);
    // Melemparkan error baru dengan pesan yang jelas
    throw new Error(`Gagal mengambil data untuk ID '${id}': ${error.message}`);
  }
}

// File ini tidak menjalankan server, hanya mengekspor fungsi.
