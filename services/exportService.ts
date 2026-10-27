import { ZoningResult, StepReportData } from '../types';
import { jsPDF } from 'jspdf';
import tokml from 'tokml';
import JSZip from 'jszip';
import { download } from 'shp-write';

export const exportStepReport = (data: StepReportData) => {
    const doc = new jsPDF();
    
    // --- HEADER ---
    doc.setFillColor(0, 0, 0); // Black Header
    doc.rect(0, 0, 210, 35, 'F');
    
    doc.setTextColor(255, 255, 106); // Yellow text
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text('GEOIDEAS', 15, 15);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text('Informe Geoestadístico de Análisis Territorial', 15, 25);
    doc.text(data.timestamp, 195, 25, { align: 'right' });

    // --- TITLE ---
    doc.setTextColor(0, 0, 0); // Black text
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(data.stepTitle, 15, 50);

    doc.setFontSize(11);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(80, 80, 80);
    const descLines = doc.splitTextToSize(data.description, 180);
    doc.text(descLines, 15, 60);

    let yPos = 60 + (descLines.length * 5) + 10;

    // --- QUANTITATIVE STATS ---
    doc.setFillColor(254, 131, 48); // Orange
    doc.rect(15, yPos, 180, 8, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("ANÁLISIS CUANTITATIVO", 20, yPos + 6);
    
    yPos += 15;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    data.stats.forEach((stat) => {
        doc.setFont("helvetica", "bold");
        doc.text(`${stat.label}:`, 20, yPos);
        doc.setFont("helvetica", "normal");
        doc.text(`${stat.value}`, 130, yPos);
        doc.setDrawColor(200, 200, 200);
        doc.line(20, yPos + 2, 195, yPos + 2);
        yPos += 8;
    });

    yPos += 10;

    // --- QUALITATIVE ANALYSIS ---
    doc.setFillColor(254, 131, 48); // Orange
    doc.rect(15, yPos, 180, 8, 'F');
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("ANÁLISIS CUALITATIVO Y CONCLUSIONES", 20, yPos + 6);

    yPos += 15;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);

    data.qualitativeAnalysis.forEach((point) => {
        const pointLines = doc.splitTextToSize(`• ${point}`, 175);
        doc.text(pointLines, 20, yPos);
        yPos += (pointLines.length * 5) + 3;
    });
    
    // AI Analysis Block if exists
    if (data.aiAnalysis) {
        yPos += 10;
        doc.setFillColor(100, 100, 100);
        doc.rect(15, yPos, 180, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.text("INTERPRETACIÓN IA", 20, yPos + 6);
        yPos += 12;
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "italic");
        const aiLines = doc.splitTextToSize(data.aiAnalysis, 175);
        doc.text(aiLines, 20, yPos);
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("Generado por GeoIdeas Pro - Sistema de Zonificación Inteligente", 105, 290, { align: 'center' });

    doc.save(`Reporte_${data.stepTitle.replace(/\s+/g, '_')}.pdf`);
};

export const exportFeatureCollection = async (features: any[], fileName: string, format: 'kml' | 'kmz' | 'shp') => {
    if (features.length === 0) return;
    
    const fc = {
        type: 'FeatureCollection',
        features: features
    };

    if (format === 'kml') {
        const kmlStr = tokml(fc);
        downloadFile(kmlStr, `${fileName}.kml`, 'application/vnd.google-earth.kml+xml');
    } else if (format === 'kmz') {
        const kmlStr = tokml(fc);
        const zip = new JSZip();
        zip.file("doc.kml", kmlStr);
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `${fileName}.kmz`;
        a.click();
        URL.revokeObjectURL(a.href);
    } else if (format === 'shp') {
        // Use shp-write
        // shp-write expects a slightly different structure or FeatureCollection
        // We configure options for a folder containing points, lines, polygons
        const options = {
            folder: fileName,
            types: {
                point: fileName + '_points',
                polygon: fileName + '_polygons',
                line: fileName + '_lines'
            }
        };
        // shp-write download function handles browser download
        download(fc, options);
    }
};

export const exportZoningData = async (data: ZoningResult, format: 'kml' | 'kmz' | 'geojson' | 'pdf' | 'stat') => {
    const filename = data.zoneName.replace(/\s+/g, '_');

    try {
        if (format === 'geojson') {
            const jsonStr = JSON.stringify(data.features, null, 2);
            downloadFile(jsonStr, `${filename}.geojson`, 'application/json');
        } 
        else if (format === 'kml') {
            const kmlStr = tokml(data.features, {
                name: 'name',
                description: 'description'
            });
            downloadFile(kmlStr, `${filename}.kml`, 'application/vnd.google-earth.kml+xml');
        }
        else if (format === 'kmz') {
            const kmlStr = tokml(data.features, {
                name: 'name',
                description: 'description'
            });
            const zip = new JSZip();
            zip.file("doc.kml", kmlStr);
            const content = await zip.generateAsync({ type: "blob" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(content);
            a.download = `${filename}.kmz`;
            a.click();
            URL.revokeObjectURL(a.href);
        }
        else if (format === 'pdf' || format === 'stat') {
            const doc = new jsPDF();
            const isStat = format === 'stat';
            
            // --- HEADER ---
            doc.setFillColor(0, 0, 0); // Black Header
            doc.rect(0, 0, 210, 40, 'F');
            
            doc.setTextColor(255, 255, 106); // Yellow text
            doc.setFontSize(22);
            doc.setFont("helvetica", "bold");
            doc.text('GEOIDEAS', 20, 20);
            
            doc.setFontSize(12);
            doc.setFont("helvetica", "normal");
            doc.text('Plano de Zonificación - Reporte Oficial', 20, 30);

            // --- INFO BLOCK ---
            doc.setTextColor(0, 0, 0); // Black text
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.text(`Zona: ${data.zoneName}`, 20, 60);
            
            doc.setFontSize(11);
            doc.setFont("helvetica", "italic");
            doc.text(data.description, 20, 68);

            // --- STATISTICS ---
            const featureCount = data.features.features.length;
            let totalScore = 0;
            let maxScore = 0;
            let minScore = 1000;

            data.features.features.forEach((f: any) => {
                const s = f.properties?.zoning_score || 0;
                totalScore += s;
                if (s > maxScore) maxScore = s;
                if (s < minScore) minScore = s;
            });

            const avgScore = featureCount > 0 ? (totalScore / featureCount).toFixed(2) : '0';

            doc.setDrawColor(0);
            doc.setFillColor(240, 240, 240);
            doc.rect(20, 80, 170, 40, 'FD');

            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text("Resumen Estadístico", 25, 90);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            
            doc.text(`Total de Manzanas (Polígonos):`, 25, 100);
            doc.text(`${featureCount}`, 150, 100, { align: 'right' });

            doc.text(`Puntuación Promedio de Consolidación:`, 25, 108);
            doc.text(`${avgScore} pts`, 150, 108, { align: 'right' });

            doc.text(`Rango de Puntuación (Min - Max):`, 25, 116);
            doc.text(`${minScore} - ${maxScore}`, 150, 116, { align: 'right' });

            if (isStat) {
                // Extended Stats Report
                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.text("Distribución de Datos", 20, 140);
                
                let y = 150;
                doc.setFontSize(10);
                doc.setFont("helvetica", "normal");
                
                // List features in a clearer table format
                doc.text("ID / Nombre", 20, y);
                doc.text("Puntuación", 130, y);
                doc.text("Categoría", 170, y);
                doc.line(20, y + 2, 190, y + 2);
                y += 8;

                data.features.features.slice(0, 30).forEach((f: any, i) => {
                    const props = f.properties || {};
                    const name = (props.name || props.NAME || props.Nombre || props.id || `Manzana ${i+1}`).toString().substring(0, 40);
                    const score = props.zoning_score || 0;
                    
                    doc.text(`${i+1}. ${name}`, 20, y);
                    doc.text(`${score}`, 130, y);
                    doc.text(data.zoneName, 170, y);
                    y += 6;
                    
                    if (y > 270) {
                        doc.addPage();
                        y = 20;
                    }
                });

                if (featureCount > 30) {
                    doc.setFont("helvetica", "italic");
                    doc.text(`... y ${featureCount - 30} elementos más. (Ver archivo digital para lista completa)`, 20, y + 5);
                }

                doc.save(`${filename}_Reporte_Estadistico.pdf`);
            } else {
                // Simple list export (standard PDF)
                doc.text('Lista preliminar de elementos:', 20, 140);
                let y = 150;
                data.features.features.slice(0, 20).forEach((f: any, i) => {
                    const props = f.properties || {};
                    const name = props.name || props.NAME || props.Nombre || props.id || `Manzana ${i+1}`;
                    doc.text(`${i+1}. ${name} - Score: ${props.zoning_score}`, 25, y);
                    y += 7;
                });
                doc.save(`${filename}_Plano.pdf`);
            }
        }
    } catch (e) {
        console.error("Export Error:", e);
        alert("Error al exportar archivo.");
    }
};

const downloadFile = (content: string, fileName: string, contentType: string) => {
    const a = document.createElement("a");
    const file = new Blob([content], { type: contentType });
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
};