import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

// Style Laporan Eksekutif Master
const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    padding: 40,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#1E3A8A',
    paddingBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E3A8A',
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 9,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 3,
  },
  section: {
    marginBottom: 14,
  },
  heading: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#312E81',
    marginBottom: 6,
    backgroundColor: '#E0E7FF',
    padding: 5,
    borderRadius: 4,
    textTransform: 'uppercase',
  },
  paragraph: {
    fontSize: 9,
    color: '#374151',
    lineHeight: 1.5,
    textAlign: 'justify',
  },
  listContainer: {
    marginTop: 4,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  bulletPoint: {
    width: 12,
    fontSize: 9,
    color: '#EA580C',
    fontWeight: 'bold',
  },
  itemContent: {
    flex: 1,
    fontSize: 9,
    color: '#4B5563',
    lineHeight: 1.4,
  },
  itemLabel: {
    fontWeight: 'bold',
    color: '#111827',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 8,
    color: '#9CA3AF',
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 8,
  }
});

// Style Khusus Untuk Grafik Batang Vektor (Pure Flexbox)
const chartStyles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 6,
    padding: 12,
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: '#F9FAFB',
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#4B5563',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  body: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 90,
    width: '100%',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#9CA3AF',
  },
  columnGroup: {
    alignItems: 'center',
    flex: 1,
  },
  barsArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 70,
    marginBottom: 4,
  },
  bar1: {
    width: 12,
    backgroundColor: '#8B5CF6', 
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  bar2: {
    width: 12,
    backgroundColor: '#4F46E5',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  axisLabel: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#6B7280',
    textAlign: 'center',
  },
  legendArea: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendIndicator1: {
    width: 8,
    height: 8,
    backgroundColor: '#8B5CF6',
    borderRadius: 1,
  },
  legendIndicator2: {
    width: 8,
    height: 8,
    backgroundColor: '#4F46E5',
    borderRadius: 1,
  },
  legendText: {
    fontSize: 8,
    color: '#4B5563',
    fontWeight: 'bold',
  },
});

// Sub-Komponen Grafik Batang Kompatibel PDF
const PDFBarChart = ({ data, label1, label2 }) => {
  if (!data || data.length === 0) return null;

  const maxVal = Math.max(...data.map(d => Math.max(d.v1 || 0, d.v2 || 0)), 1);

  return (
    <View style={chartStyles.container}>
      <Text style={chartStyles.chartTitle}>Grafik Visualisasi Distribusi Rekapitulasi</Text>
      
      <View style={chartStyles.body}>
        {data.map((item, idx) => {
          const heightBar1 = ((item.v1 || 0) / maxVal) * 70;
          const heightBar2 = ((item.v2 || 0) / maxVal) * 70;

          return (
            <View key={idx} style={chartStyles.columnGroup}>
              <View style={chartStyles.barsArea}>
                <View style={[chartStyles.bar1, { height: Math.max(heightBar1, 2) }]} />
                <View style={[chartStyles.bar2, { height: Math.max(heightBar2, 2) }]} />
              </View>
              <Text style={chartStyles.axisLabel}>{item.label}</Text>
            </View>
          );
        })}
      </View>

      <View style={chartStyles.legendArea}>
        <View style={chartStyles.legendItem}>
          <View style={chartStyles.legendIndicator1} />
          <Text style={chartStyles.legendText}>{label1 || 'Sekolah'}</Text>
        </View>
        <View style={chartStyles.legendItem}>
          <View style={chartStyles.legendIndicator2} />
          <Text style={chartStyles.legendText}>{label2 || 'Data Pembanding'}</Text>
        </View>
      </View>
    </View>
  );
};

// Komponen Utama Dokumen PDF
const LaporanEksekutifPDF = ({ dataAI, tahun, wilayah, kategori, judulLaporan, deskripsiLaporan, chartData, label1, label2 }) => {
  if (!dataAI) return null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* KOP LAPORAN */}
        <View style={styles.header}>
          <Text style={styles.title}>{judulLaporan || 'Laporan Eksekutif Analitik'}</Text>
          <Text style={styles.subtitle}>{deskripsiLaporan || `SITAKA - Agregasi Data Tahun ${tahun}`}</Text>
          <Text style={styles.subtitle}>Wilayah Filter: {wilayah} | Kategori: {kategori}</Text>
        </View>

        {/* KESIMPULAN UMUM */}
        {dataAI.kesimpulanUmum && (
          <View style={styles.section}>
            <Text style={styles.heading}>KESIMPULAN UMUM ANALISIS AI</Text>
            <Text style={styles.paragraph}>{dataAI.kesimpulanUmum}</Text>
          </View>
        )}

        {/* GRAFIK VEKTOR DARI PROPS */}
        {chartData && chartData.length > 0 && (
          <PDFBarChart data={chartData} label1={label1} label2={label2} />
        )}

        {/* 1. JENJANG TERTINGGI / OVERLOAD */}
        {dataAI.jenjangTertinggi && dataAI.jenjangTertinggi.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.heading}>JENJANG TERPADAT (Kondisi Overload / Skala Tinggi)</Text>
            <View style={styles.listContainer}>
              {dataAI.jenjangTertinggi.map((item, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.bulletPoint}>•</Text>
                  <Text style={styles.itemContent}>
                    <Text style={styles.itemLabel}>{item.jenjang}: </Text>
                    {item.alasan}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 2. WILAYAH TERTINGGI / TERPADAT */}
        {dataAI.wilayahTertinggi && dataAI.wilayahTertinggi.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.heading}>WILAYAH TERPADAT (Kecamatan Kritis / Overload)</Text>
            <View style={styles.listContainer}>
              {dataAI.wilayahTertinggi.map((item, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.bulletPoint}>•</Text>
                  <Text style={styles.itemContent}>
                    <Text style={styles.itemLabel}>{item.wilayah || item.kecamatan}: </Text>
                    {item.alasan}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 3. JENJANG TERENDAH / IDEAL */}
        {dataAI.jenjangTerendah && dataAI.jenjangTerendah.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.heading}>JENJANG IDEAL (Kondisi Optimal / Skala Rendah)</Text>
            <View style={styles.listContainer}>
              {dataAI.jenjangTerendah.map((item, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.bulletPoint}>•</Text>
                  <Text style={styles.itemContent}>
                    <Text style={styles.itemLabel}>{item.jenjang}: </Text>
                    {item.alasan}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 4. WILAYAH TERENDAH / IDEAL */}
        {dataAI.wilayahTerendah && dataAI.wilayahTerendah.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.heading}>WILAYAH IDEAL (Kecamatan Optimal / Terkendali)</Text>
            <View style={styles.listContainer}>
              {dataAI.wilayahTerendah.map((item, index) => (
                <View key={index} style={styles.listItem}>
                  <Text style={styles.bulletPoint}>•</Text>
                  <Text style={styles.itemContent}>
                    <Text style={styles.itemLabel}>{item.wilayah || item.kecamatan}: </Text>
                    {item.alasan}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* FOOTER STATIS */}
        <Text style={styles.footer} fixed>
          Digenerasi Otomatis oleh: Gemini AI - SITAKA Monitoring Engine | Dicetak pada: {new Date().toLocaleDateString('id-ID')}
        </Text>

      </Page>
    </Document>
  );
};

export default LaporanEksekutifPDF;