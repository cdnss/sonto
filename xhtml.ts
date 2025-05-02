import * as cheerio from 'npm:cheerio'; // Impor Cheerio dari npm

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
export function processHtml(htmlContent: string, prefix: "/movie" | "/anime", targetBaseUrl: string, currentTargetUrl: string): string {
    const $ = cheerio.load(htmlContent);
    const targetOrigin = new URL(targetBaseUrl).origin; // Ambil origin dari target

    // Elemen dan atribut yang mungkin berisi URL
    const elementsToProcess = [
        { selector: 'a[href]', attribute: 'href' },
        { selector: 'link[href]', attribute: 'href' },
        { selector: 'img[src]', attribute: 'src' },
        { selector: 'script[src]', attribute: 'src' },
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
