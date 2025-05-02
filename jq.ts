export function jq(nama: string): string {
  return `

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
                            var apiUrl = '/api.php?id=' + videoId;

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

}
