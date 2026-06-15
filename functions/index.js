const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const axios = require("axios");
const cheerio = require("cheerio");
const cors = require("cors")({ origin: true }); // Pengaman ekstra untuk CORS

if (admin.apps.length === 0) admin.initializeApp();
const db = admin.firestore();

// KODE WILAYAH SUDAH DIPERBARUI
const KODE_KABUPATEN_KALBAR = [
  { kode: "130100", nama: "Kab. Sambas" },
  { kode: "130200", nama: "Kab. Mempawah" },
  { kode: "130300", nama: "Kab. Sanggau" },
  { kode: "130400", nama: "Kab. Sintang" },
  { kode: "130500", nama: "Kab. Kapuas Hulu" },
  { kode: "130600", nama: "Kab. Ketapang" },
  { kode: "130800", nama: "Kab. Bengkayang" },
  { kode: "130900", nama: "Kab. Landak" },
  { kode: "131000", nama: "Kab. Sekadau" },
  { kode: "131100", nama: "Kab. Melawi" },
  { kode: "131200", nama: "Kab. Kayong Utara" },
  { kode: "131300", nama: "Kab. Kubu Raya" },
  { kode: "136000", nama: "Kota Pontianak" },
  { kode: "136100", nama: "Kota Singkawang" }
];

const SCRAPER_API_KEY = "b535b2c2491bcff150a4c5a5785a0e68";

// Fungsi Pembantu Cerdas: Mengekstrak selalu 6 digit KODE TERAKHIR dari URL
const extractKode = (href) => {
  if (!href) return null;
  const matches = href.match(/\d{6}/g);
  return matches ? matches[matches.length - 1] : null;
};

async function runScraper(loggerInstance) {
  const tahunData = "2026";
  const timestampSekarang = admin.firestore.FieldValue.serverTimestamp();
  
  let totalDataTersimpan = 0;
  let failedWilayah = []; // Array untuk menampung kabupaten yang gagal

  for (const kab of KODE_KABUPATEN_KALBAR) {
    let success = false;
    let attempt = 0;
    const maxRetries = 3;

    while (attempt < maxRetries && !success) {
      attempt++;
      try {
        if (attempt > 1) {
          loggerInstance.info(`SITAKA Engine: Mencoba ulang ${kab.nama} (Percobaan ${attempt}/${maxRetries})...`);
        } else {
          loggerInstance.info(`SITAKA Engine: Menarik data ATS & Anak Kembali Sekolah ${kab.nama}...`);
        }
        
        // =====================================================================
        // TAHAP 1: TARIK DATA ATS (TIDAK SEKOLAH)
        // =====================================================================
        const webKemdikbudUrl = `https://ats.data.kemendikdasmen.go.id/index.php/rangkuman/ats-by-wilayah/${kab.kode}?tabulasi=wilayah&status=verifikasi`;
        const targetUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(webKemdikbudUrl)}&country_code=id`;
        
        const response1 = await axios.get(targetUrl, { timeout: 60000 });
        const $1 = cheerio.load(response1.data);
        const kecMap = {}; 

        const cleanNumber = (el, $) => parseInt($(el).text().replace(/\./g, "").trim()) || 0;

        // Validasi Ekstraksi Tahap 1
        if ($1("table#ats_wilayah tr").length < 2) {
           throw new Error("HTML Tahap 1 (ATS) kosong. Terhalang WAF.");
        }

        // 1. Parsing Tabel Utama (ats_wilayah)
        $1("table#ats_wilayah tr").each((index, element) => {
          const row = $1(element);
          const allTds = row.find("td");
          if (allTds.length < 5) return;

          const linkKecamatan = allTds.eq(0).find("a");
          if (linkKecamatan.length === 0) return;

          const kodeKecamatan = extractKode(linkKecamatan.attr("href"));
          if (!kodeKecamatan) return;

          const namaKecamatan = linkKecamatan.text().trim();

          kecMap[kodeKecamatan] = {
            kode_kecamatan: kodeKecamatan,
            nama_kecamatan: namaKecamatan,
            total_ats: parseInt(allTds.last().text().replace(/\./g, "").trim()) || 0,
            jumlah_do: 0, 
            jumlah_ltm: 0, 
            jumlah_bpb: 0,
            jumlah_kembali_do: 0, 
            jumlah_kembali_ltm: 0,
            detail_do: { paud: 0, sd: 0, smp: 0, sma_smk: 0 },
            detail_ltm: { sd: 0, smp: 0 },
            detail_bpb: { u_3_4: 0, u_5_6: 0, u_7_12: 0, u_13_15: 0, u_16_18: 0, u_19_24: 0, u_25_plus: 0 },
            detail_kembali_do: { paud: 0, sd: 0, smp: 0, sma_smk: 0 },
            detail_kembali_ltm: { sd: 0, smp: 0 }
          };
        });

        // 2. Parsing Tabel Drop Out (ats_sp_do)
        $1("table#ats_sp_do tr").each((index, element) => {
          const allTds = $1(element).find("td");
          if (allTds.length < 5) return;
          const kode = extractKode(allTds.eq(0).find("a").attr("href"));
          
          if (kode && kecMap[kode]) {
            kecMap[kode].detail_do = {
              paud: cleanNumber(allTds.eq(1), $1),
              sd: cleanNumber(allTds.eq(2), $1),
              smp: cleanNumber(allTds.eq(3), $1),
              sma_smk: cleanNumber(allTds.eq(4), $1)
            };
            kecMap[kode].jumlah_do = cleanNumber(allTds.eq(5), $1);
          }
        });

        // 3. Parsing Tabel LTM (ats_sp_ltm)
        $1("table#ats_sp_ltm tr").each((index, element) => {
          const allTds = $1(element).find("td");
          if (allTds.length < 3) return;
          const kode = extractKode(allTds.eq(0).find("a").attr("href"));
          
          if (kode && kecMap[kode]) {
            kecMap[kode].detail_ltm = {
              sd: cleanNumber(allTds.eq(1), $1),
              smp: cleanNumber(allTds.eq(2), $1)
            };
            kecMap[kode].jumlah_ltm = cleanNumber(allTds.eq(3), $1);
          }
        });

        // 4. Parsing Tabel BPB (ats_bpb)
        $1("table#ats_bpb tr").each((index, element) => {
          const allTds = $1(element).find("td");
          if (allTds.length < 8) return;
          const kode = extractKode(allTds.eq(0).find("a").attr("href"));
          
          if (kode && kecMap[kode]) {
            kecMap[kode].detail_bpb = {
              u_3_4: cleanNumber(allTds.eq(1), $1),
              u_5_6: cleanNumber(allTds.eq(2), $1),
              u_7_12: cleanNumber(allTds.eq(3), $1),
              u_13_15: cleanNumber(allTds.eq(4), $1),
              u_16_18: cleanNumber(allTds.eq(5), $1),
              u_19_24: cleanNumber(allTds.eq(6), $1),
              u_25_plus: cleanNumber(allTds.eq(7), $1)
            };
            kecMap[kode].jumlah_bpb = cleanNumber(allTds.eq(8), $1);
          }
        });

        // =====================================================================
        // TAHAP 2: TARIK DATA ANAK KEMBALI SEKOLAH (DO & LTM KEMBALI)
        // =====================================================================
        const webKembaliUrl = `https://ats.data.kemendikdasmen.go.id/index.php/rangkuman/ats-aktif-kembali/${kab.kode}`;
        const targetKembaliUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(webKembaliUrl)}&country_code=id`;
        
        const response2 = await axios.get(targetKembaliUrl, { timeout: 60000 });
        const $2 = cheerio.load(response2.data);

        // VALIDASI KETAT TAHAP 2 (ANTI SILENT FAILURE)
        if ($2("table#ats_sp_do").length === 0 && $2("table#ats_sp_ltm").length === 0) {
          throw new Error("HTML Tahap 2 (Anak Kembali Sekolah) tidak memuat tabel data. Terhalang bot kemdikbud.");
        }

        // 5. Parsing Tabel DO KEMBALI
        $2("table#ats_sp_do tr").each((index, element) => {
          const allTds = $2(element).find("td");
          if (allTds.length < 5) return;
          const kode = extractKode(allTds.eq(0).find("a").attr("href"));
          
          if (kode && kecMap[kode]) {
            kecMap[kode].detail_kembali_do = {
              paud: cleanNumber(allTds.eq(1), $2),
              sd: cleanNumber(allTds.eq(2), $2),
              smp: cleanNumber(allTds.eq(3), $2),
              sma_smk: cleanNumber(allTds.eq(4), $2)
            };
            kecMap[kode].jumlah_kembali_do = cleanNumber(allTds.eq(5), $2);
          }
        });

        // 6. Parsing Tabel LTM KEMBALI
        $2("table#ats_sp_ltm tr").each((index, element) => {
          const allTds = $2(element).find("td");
          if (allTds.length < 3) return;
          const kode = extractKode(allTds.eq(0).find("a").attr("href"));
          
          if (kode && kecMap[kode]) {
            kecMap[kode].detail_kembali_ltm = {
              sd: cleanNumber(allTds.eq(1), $2),
              smp: cleanNumber(allTds.eq(2), $2)
            };
            kecMap[kode].jumlah_kembali_ltm = cleanNumber(allTds.eq(3), $2);
          }
        });

        // Konversi Map object kembali menjadi Array Flat
        const listDataKecamatan = Object.values(kecMap);

        // Jika berhasil memilah data, simpan ke Firestore
        await db.collection("data_ats_chunks").doc(`${kab.kode}_${tahunData}`).set({
          kode_kabupaten: kab.kode,
          nama_kabupaten: kab.nama,
          tahun_data: tahunData,
          last_updated: timestampSekarang,
          kecamatan_chunks: listDataKecamatan
        });

        totalDataTersimpan++;
        success = true; // Menghentikan loop While
        loggerInstance.info(`Sukses: ${kab.nama} (${listDataKecamatan.length} Kecamatan ter-mapping)`);

      } catch (error) {
        loggerInstance.warn(`Gagal memproses ${kab.nama} (Percobaan ${attempt}): ${error.message}`);
        
        if (attempt === maxRetries) {
          loggerInstance.error(`SITAKA Engine: Menyerah pada ${kab.nama} setelah ${maxRetries} percobaan.`);
          // CATAT KABUPATEN YANG GAGAL KE ARRAY
          failedWilayah.push(kab.nama);
        } else {
          // Tunggu 5 detik sebelum mencoba lagi
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    } // Akhir dari While
  } // Akhir dari For Loop
  
  // Return sebuah object berisi total dan array yang gagal
  return { totalDataTersimpan, failedWilayah };
}

exports.scheduledAtsScraper = onSchedule({ 
  region: "asia-southeast2", 
  schedule: "0 */12 * * *", 
  timeZone: "Asia/Jakarta", 
  memory: "512MiB", 
  timeoutSeconds: 300 
}, async (event) => {
  const result = await runScraper(logger);
  logger.info(`Scheduled Sync Selesai. Total sukses: ${result.totalDataTersimpan}. Gagal: ${result.failedWilayah.join(", ")}`);
});

exports.manualSyncAts = onRequest({ 
  region: "asia-southeast2", 
  memory: "512MiB", 
  timeoutSeconds: 300 
}, (req, res) => {
  cors(req, res, async () => {
    try {
      // Menerima nilai return berupa object
      const { totalDataTersimpan, failedWilayah } = await runScraper(logger);
      
      if (totalDataTersimpan > 0) {
        if (failedWilayah.length > 0) {
          // Respons jika ada sebagian yang gagal
          res.status(200).json({ 
            success: true, 
            message: `Sinkronisasi selesai. ${totalDataTersimpan} sukses, namun gagal di: ${failedWilayah.join(", ")}.`,
            failed: failedWilayah
          });
        } else {
          // Respons jika sukses 100%
          res.status(200).json({ 
            success: true, 
            message: `Berhasil sinkronisasi penuh ${totalDataTersimpan} Kabupaten/Kota!`,
            failed: []
          });
        }
      } else {
        // Respons jika gagal semua
        res.status(500).json({ 
          success: false, 
          message: "Gagal menarik seluruh data. Kemungkinan terhalang WAF atau limit API habis.",
          failed: failedWilayah
        });
      }
    } catch(e) {
      res.status(500).json({ success: false, message: e.message, failed: [] });
    }
  });
});