import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { SurveySummaryData, StatisticalMetrics } from '../types';

// Extend jsPDF for autotable
// Use intersection type to preserve all jsPDF methods
type jsPDFWithAutoTable = jsPDF & {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
};

export const processSurveyFile = async (file: File): Promise<SurveySummaryData[]> => {
    const fileName = file.name.toLowerCase();
    
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        return await processExcel(file);
    } else if (fileName.endsWith('.pdf')) {
        // PDF Processing is significantly more complex in browser without backend
        // We will implement a text-based heuristic if possible, but prioritize Excel
        // For this MVP, we warn the user or try a basic text extraction if supported
        throw new Error("El procesamiento de PDF requiere conversión previa a Excel para mayor precisión en esta versión. Por favor use formato .xlsx");
    } else {
        throw new Error("Formato no soportado. Use .xlsx");
    }
};

const processExcel = async (file: File): Promise<SurveySummaryData[]> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                
                // Convert to array of arrays to scan row by row
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                
                const extractedData: SurveySummaryData[] = [];
                let currentIndex = 1;
                
                let currentZona = "";
                let currentManzana = "";
                let blockStarted = false;

                // Heuristic Parsing of "Formulario 1"
                for (let i = 0; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    // const rowString = row.join(' ').toUpperCase();

                    // 1. Detect Block Header (Zona and Manzana)
                    // Look for patterns like "A. ENCUESTA", "ZONA", "MANZANA" in the same or adjacent rows
                    // Based on screenshot, "ZONA" and "Manzana" are often in the same row
                    
                    const zonaIndex = row.findIndex(cell => cell && String(cell).toUpperCase().includes('ZONA'));
                    const manzanaIndex = row.findIndex(cell => cell && String(cell).toUpperCase().includes('MANZANA'));

                    if (zonaIndex !== -1 || manzanaIndex !== -1) {
                        // Extract values. Usually value is next to the label
                        // Simple approach: grab the next non-empty cell value
                        
                        if (zonaIndex !== -1 && row.length > zonaIndex + 1) {
                            // Try to find the value in next cells
                            for(let k = zonaIndex+1; k < row.length; k++) {
                                if(row[k]) {
                                    currentZona = String(row[k]).trim();
                                    break;
                                }
                            }
                        }
                        
                        if (manzanaIndex !== -1 && row.length > manzanaIndex + 1) {
                             for(let k = manzanaIndex+1; k < row.length; k++) {
                                if(row[k]) {
                                    currentManzana = String(row[k]).trim();
                                    break;
                                }
                            }
                        }
                        
                        if (currentZona && currentManzana) {
                            blockStarted = true;
                        }
                    }

                    // 2. Detect Block Footer (TOTAL)
                    // The total is usually at the bottom right of the block
                    const totalIndex = row.findIndex(cell => cell && String(cell).toUpperCase() === 'TOTAL');
                    
                    if (totalIndex !== -1 && blockStarted) {
                        // The value we want is usually the last column or specific column
                        // In the screenshot, it's column 8 or the last one.
                        // Let's assume it's the last non-empty numeric value in the row
                        
                        let totalVal = 0;
                        for (let k = row.length - 1; k > totalIndex; k--) {
                            const val = row[k];
                            if (typeof val === 'number') {
                                totalVal = val;
                                break;
                            } else if (typeof val === 'string') {
                                // Clean string "1.200,00" -> 1200.00
                                const cleanVal = val.replace(/\./g, '').replace(',', '.');
                                const parsed = parseFloat(cleanVal);
                                if (!isNaN(parsed)) {
                                    totalVal = parsed;
                                    break;
                                }
                            }
                        }

                        if (totalVal > 0) {
                            extractedData.push({
                                index: currentIndex++,
                                zona: currentZona,
                                manzana: currentManzana,
                                valorPromedioM2: totalVal
                            });
                            // Reset for next block
                            currentManzana = ""; 
                            blockStarted = false; 
                        }
                    }
                }

                resolve(extractedData);

            } catch (err) {
                reject(err);
            }
        };
        
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
};

export const calculateStatistics = (data: SurveySummaryData[]): StatisticalMetrics => {
    const values = data.map(d => d.valorPromedioM2);
    const n = values.length;
    
    if (n === 0) {
        return { count: 0, mean: 0, median: 0, mode: 0, min: 0, max: 0, variance: 0, stdDev: 0, cv: 0, rSquared: 0 };
    }

    // 1. Mean
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;

    // 2. Median & Min/Max
    const sorted = [...values].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[n - 1];
    let median = 0;
    if (n % 2 === 0) {
        median = (sorted[n/2 - 1] + sorted[n/2]) / 2;
    } else {
        median = sorted[Math.floor(n/2)];
    }

    // 3. Mode
    const frequency: Record<number, number> = {};
    let maxFreq = 0;
    values.forEach(v => {
        frequency[v] = (frequency[v] || 0) + 1;
        if (frequency[v] > maxFreq) maxFreq = frequency[v];
    });
    const modes = Object.keys(frequency).filter(k => frequency[parseFloat(k)] === maxFreq).map(Number);
    const mode = modes.length === n ? 'N/A' : (modes.length > 1 ? modes[0] : modes[0]); // Simple mode logic

    // 4. Variance & StdDev
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    // 5. Coefficient of Variation
    const cv = mean > 0 ? (stdDev / mean) * 100 : 0;

    // 6. R Squared (Trend vs Index)
    // Assuming X = index (1..n), Y = value
    // R2 = 1 - (SSres / SStot)
    // Simple Linear Regression slope (b) and intercept (a)
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        const x = i + 1;
        const y = values[i];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumX2 += x * x;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // SSres & SStot
    let ssRes = 0;
    let ssTot = 0;
    for (let i = 0; i < n; i++) {
        const x = i + 1;
        const y = values[i];
        const yPred = slope * x + intercept;
        ssRes += Math.pow(y - yPred, 2);
        ssTot += Math.pow(y - mean, 2);
    }
    
    const rSquared = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);

    return {
        count: n,
        mean,
        median,
        mode,
        min,
        max,
        variance,
        stdDev,
        cv,
        rSquared: Math.max(0, rSquared) // Clamp to 0 if negative
    };
};

export const exportSurveySummaryExcel = (data: SurveySummaryData[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data.map(d => ({
        "No. Recuadro": d.index,
        "ZONA": d.zona,
        "CODIGO MANZANA": d.manzana,
        "VALOR PROMEDIO M2 (Bs)": d.valorPromedioM2
    })));
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumen");
    XLSX.writeFile(wb, `${fileName}_Resumen.xlsx`);
};

export const exportSurveySummaryPDF = (data: SurveySummaryData[], fileName: string) => {
    // Cast to intersection type to access both jsPDF methods and autoTable
    const doc = new jsPDF() as jsPDFWithAutoTable;

    // Header
    doc.setFillColor(6, 182, 212); // Cyan
    doc.rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("RESUMEN DE ENCUESTA - FORMULARIO 1", 14, 13);

    const tableData = data.map(row => [
        row.index,
        row.zona,
        row.manzana,
        row.valorPromedioM2.toLocaleString('es-BO', { style: 'currency', currency: 'BOB' })
    ]);

    doc.autoTable({
        head: [['No.', 'ZONA', 'MANZANA', 'VALOR PROMEDIO (m²)']],
        body: tableData,
        startY: 30,
        headStyles: { fillColor: [6, 182, 212] },
        theme: 'grid'
    });

    doc.save(`${fileName}_Resumen.pdf`);
};

// --- FULL REPORT WITH STATS AND CHART ---
export const exportFullStatisticalReport = (data: SurveySummaryData[], fileName: string, metrics: StatisticalMetrics) => {
    const doc = new jsPDF() as jsPDFWithAutoTable;
    
    // --- 1. HEADER ---
    doc.setFillColor(0, 0, 0); // Black
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(6, 182, 212); // Cyan
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("GEOIDEAS", 14, 18);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text("INFORME DE ANÁLISIS ESTADÍSTICO - VALUACIÓN ZONAL", 14, 25);
    
    let yPos = 40;

    // --- 2. STATISTICAL METRICS TABLE ---
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.text("1. Resumen Estadístico", 14, yPos);
    yPos += 5;

    const statsBody = [
        ['Cantidad de Manzanas', metrics.count.toString(), 'Máximo (Bs)', metrics.max.toLocaleString('es-BO')],
        ['Promedio (Media)', metrics.mean.toLocaleString('es-BO', { minimumFractionDigits: 2 }), 'Mínimo (Bs)', metrics.min.toLocaleString('es-BO')],
        ['Mediana', metrics.median.toLocaleString('es-BO', { minimumFractionDigits: 2 }), 'Rango', (metrics.max - metrics.min).toLocaleString('es-BO')],
        ['Moda', metrics.mode.toString(), 'Varianza', metrics.variance.toLocaleString('es-BO', { maximumFractionDigits: 2 })],
        ['Desviación Estándar', metrics.stdDev.toLocaleString('es-BO', { maximumFractionDigits: 2 }), 'Coef. Variación (CV)', `${metrics.cv.toFixed(2)}%`],
        ['Coef. Determinación (R²)', metrics.rSquared.toFixed(4), '', '']
    ];

    doc.autoTable({
        startY: yPos,
        body: statsBody,
        theme: 'grid',
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [6, 182, 212], textColor: 255 },
        columnStyles: { 0: { fontStyle: 'bold', fillColor: [240, 240, 240] }, 2: { fontStyle: 'bold', fillColor: [240, 240, 240] } }
    });

    yPos = doc.lastAutoTable.finalY + 15;

    // --- 3. VECTOR CHART (Drawn manually in PDF) ---
    doc.setFontSize(14);
    doc.text("2. Gráfico de Variabilidad de Precios", 14, yPos);
    yPos += 10;
    
    // Chart Config
    const chartHeight = 80;
    const chartWidth = 180;
    const startX = 15;
    const startY = yPos;
    const maxVal = metrics.max * 1.1; // Add 10% headroom

    // Draw Axis
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.line(startX, startY, startX, startY + chartHeight); // Y Axis
    doc.line(startX, startY + chartHeight, startX + chartWidth, startY + chartHeight); // X Axis

    // Draw Bars
    const barWidth = (chartWidth / data.length) * 0.8;
    const gap = (chartWidth / data.length) * 0.2;
    
    data.forEach((d, i) => {
        const barHeight = (d.valorPromedioM2 / maxVal) * chartHeight;
        const x = startX + (i * (barWidth + gap)) + (gap/2);
        const y = startY + chartHeight - barHeight;
        
        doc.setFillColor(6, 182, 212); // Cyan
        doc.rect(x, y, barWidth, barHeight, 'F');
    });

    // Draw Average Line
    const avgY = startY + chartHeight - ((metrics.mean / maxVal) * chartHeight);
    doc.setDrawColor(255, 0, 0); // Red
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(startX, avgY, startX + chartWidth, avgY);
    doc.setFontSize(8);
    doc.setTextColor(255, 0, 0);
    doc.text(`Promedio: ${metrics.mean.toFixed(0)}`, startX + chartWidth + 2, avgY);
    doc.setLineDashPattern([], 0); // Reset

    // Axis Labels
    doc.setFontSize(9);
    doc.setTextColor(0);
    // Y Axis Labels
    doc.text("0", startX - 5, startY + chartHeight);
    doc.text(Math.round(maxVal/2).toString(), startX - 10, startY + (chartHeight/2));
    doc.text(Math.round(maxVal).toString(), startX - 10, startY);
    
    // X Axis Label
    doc.text("Manzanas (Secuencia)", startX + (chartWidth/2), startY + chartHeight + 10, { align: 'center' });
    
    yPos += chartHeight + 20;

    // Check if new page needed
    if (yPos > 250) {
        doc.addPage();
        yPos = 20;
    }

    // --- 4. DETAILED DATA TABLE ---
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text("3. Detalle de Datos", 14, yPos);
    yPos += 5;

    const tableData = data.map(row => [
        row.index,
        row.zona,
        row.manzana,
        row.valorPromedioM2.toLocaleString('es-BO', { style: 'currency', currency: 'BOB' })
    ]);

    doc.autoTable({
        head: [['No.', 'ZONA', 'MANZANA', 'VALOR PROMEDIO (m²)']],
        body: tableData,
        startY: yPos,
        headStyles: { fillColor: [50, 50, 50] },
        theme: 'striped'
    });

    doc.save(`${fileName}_Informe_Estadistico.pdf`);
};