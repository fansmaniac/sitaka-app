import ExcelJS from 'exceljs';

/**
 * Fungsi untuk membaca file Excel (.xlsx) dan mengubahnya menjadi JSON.
 * Dioptimalkan untuk kompatibilitas dengan Firebase Firestore.
 */
export const readExcel = async (file) => {
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = await file.arrayBuffer();
  await workbook.xlsx.load(arrayBuffer);

  const worksheet = workbook.worksheets[0]; // Mengambil sheet pertama
  const jsonData = [];
  
  // Baris pertama dianggap sebagai Header (Nama Kolom)
  const headers = [];
  worksheet.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = cell.value?.toString() || `column_${colNumber}`;
  });

  // Iterasi baris mulai dari baris ke-2 (Data)
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Lewati header

    const rowData = {};
    row.eachCell((cell, colNumber) => {
      const header = headers[colNumber];
      // Pastikan data bersih (menangani link atau objek kompleks dari Excel)
      rowData[header] = cell.value && typeof cell.value === 'object' 
        ? cell.value.result || cell.value.text || JSON.stringify(cell.value)
        : cell.value;
    });
    
    // Hanya masukkan jika baris tidak kosong
    if (Object.keys(rowData).length > 0) {
      jsonData.push(rowData);
    }
  });

  return jsonData;
};