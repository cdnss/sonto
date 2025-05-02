# Gunakan image Deno resmi sebagai base image
# Anda bisa mengganti 'latest' dengan versi Deno spesifik (misalnya 1.x.y)
FROM denoland/deno:latest

# Tetapkan direktori kerja di dalam container
WORKDIR /app

# Salin semua file dari direktori lokal saat ini ke direktori kerja di dalam container
# Pastikan file deno.ts Anda ada di direktori yang sama dengan Dockerfile
COPY . .

# Perintah yang akan dijalankan saat container dimulai
# Ini menjalankan script deno.ts dengan flag -A (untuk mengizinkan semua izin)
CMD ["deno", "run", "-A", "deno.ts"]

# Catatan: Menggunakan -A memberikan semua izin (read, write, net, env, run, ffi).
# Untuk keamanan yang lebih baik dalam produksi, disarankan untuk hanya memberikan
# izin yang dibutuhkan saja (misalnya, --allow-net, --allow-read=/path/to/file).
