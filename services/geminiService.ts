
import { GoogleGenAI, Type } from "@google/genai";
import { LayerData, AnalysisResult, AttributeStat, GeometryStat } from "../types";
import * as turf from '@turf/turf';
import { Feature, Polygon, MultiPolygon, LineString, MultiLineString } from 'geojson';

// --- CLIENT-SIDE PRE-ANALYSIS (DETERMINISTIC) ---
// We calculate stats locally to send ACCURATE numbers to Gemini, 
// avoiding LLM hallucinations on math/geometry.

const calculateLayerStatistics = (layer: LayerData) => {
    const features = layer.data.features;
    const totalCount = features.length;
    
    // 1. Geometry Stats
    const geomStats: Record<string, { count: number, area: number, length: number, invalid: number }> = {};
    let bbox = [180, 90, -180, -90]; // Init inverted
    
    try {
        const layerBbox = turf.bbox(layer.data);
        bbox = layerBbox;
    } catch (e) {
        bbox = [0,0,0,0];
    }

    features.forEach(f => {
        if (!f.geometry) return;
        const type = f.geometry.type;
        
        if (!geomStats[type]) geomStats[type] = { count: 0, area: 0, length: 0, invalid: 0 };
        geomStats[type].count++;

        // Basic Topology check (simple validity)
        // Note: Full validity check in browser is heavy, we assume parsed GeoJSON is structure-valid
        // but we can check for empty coords.
        const coords = (f.geometry as any).coordinates;
        if (!coords || coords.length === 0) geomStats[type].invalid++;

        // Area & Length
        if (type === 'Polygon' || type === 'MultiPolygon') {
            try { geomStats[type].area += turf.area(f as any); } catch(e){}
        }
        if (type === 'LineString' || type === 'MultiLineString') {
            try { geomStats[type].length += turf.length(f as any, { units: 'meters' }); } catch(e){}
        }
    });

    const geometryReport: GeometryStat[] = Object.entries(geomStats).map(([type, stats]) => ({
        type,
        count: stats.count,
        invalidCount: stats.invalid,
        totalArea: stats.area > 0 ? `${(stats.area / 10000).toFixed(2)} ha` : undefined,
        totalLength: stats.length > 0 ? `${(stats.length / 1000).toFixed(2)} km` : undefined
    }));

    // 2. Attribute Stats
    const fieldMap: Record<string, { types: Set<string>, missing: number, unique: Set<any>, sample: any }> = {};
    
    features.forEach(f => {
        if (!f.properties) return;
        Object.entries(f.properties).forEach(([key, val]) => {
            if (!fieldMap[key]) fieldMap[key] = { types: new Set(), missing: 0, unique: new Set(), sample: null };
            
            if (val === null || val === undefined || val === "") {
                fieldMap[key].missing++;
            } else {
                fieldMap[key].types.add(typeof val);
                if (fieldMap[key].unique.size < 50) fieldMap[key].unique.add(val); // Limit unique tracking for perf
                if (!fieldMap[key].sample) fieldMap[key].sample = val;
            }
        });
    });

    const attributeReport: AttributeStat[] = Object.entries(fieldMap).map(([name, stats]) => ({
        name,
        type: Array.from(stats.types).join('/'),
        missingCount: stats.missing,
        uniqueCount: stats.unique.size >= 50 ? 50 : stats.unique.size, // Cap at 50 for indicator
        sample: String(stats.sample).substring(0, 20)
    }));

    // 3. SRS Inference (Heuristic)
    // GeoJSON in browser is typically WGS84 (4326). 
    // If coords are > 180, it might be raw projected data not reprojected correctly, or intended for local CRS.
    const isProjectedLike = bbox[0] > 180 || bbox[1] > 90 || bbox[0] < -180 || bbox[1] < -90;

    return {
        geometryReport,
        attributeReport,
        bbox: bbox.map(n => n.toFixed(4)).join(', '),
        isProjectedLike
    };
};

export const analyzeGeoData = async (layer: LayerData): Promise<AnalysisResult> => {
  try {
    if (!process.env.API_KEY) {
      throw new Error("API Key not found");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // 1. Run Local Math
    const stats = calculateLayerStatistics(layer);

    // 2. Construct Prompt
    const prompt = `
      Actúa como un ANALISTA SIG PROFESIONAL (Especialista en Geodesia, Catastro y Urbanismo).
      Realiza un "Análisis Inteligente" de la siguiente capa vectorial cargada en la aplicación web "GeoIdeas Pro".
      
      DATOS TÉCNICOS CALCULADOS (Pre-procesados):
      - Nombre Archivo: ${layer.fileName}
      - Formato Original: ${layer.type.toUpperCase()}
      - Tamaño: ${layer.fileSize}
      - Bounding Box (WGS84 aproximado): [${stats.bbox}]
      - Coordenadas parecen proyectadas (UTM/Local): ${stats.isProjectedLike ? "SÍ (Valores > 180/90)" : "NO (Parecen Lat/Lon WGS84)"}
      
      ESTADÍSTICAS GEOMÉTRICAS:
      ${JSON.stringify(stats.geometryReport, null, 2)}
      
      TABLA DE ATRIBUTOS (Muestra):
      ${JSON.stringify(stats.attributeReport.slice(0, 15), null, 2)} 
      (Nota: Si uniqueCount es 50, significa 50 o más).

      INSTRUCCIONES:
      Basado en estos datos, genera un reporte técnico JSON estricto.
      
      1. Validación: Determina si es apto para catastro.
      2. SRS: Si las coordenadas son Lat/Lon, asume WGS84 (EPSG:4326) como display, pero menciona si originalmente podría venir de un UTM (PSAD56/WGS84) basado en el contexto de un plano urbano.
      3. Atributos: Sugiere cuál campo es la "Llave Primaria" (PK) para ligar con bases de datos.
      4. Avanzado: Detecta potencial de uso (Zonificación, Vías, Predios) basado en los nombres de campos y tipos de geometría.
      
      IMPORTANTE:
      - Sé técnico y profesional.
      - Si detectas muchos "missingCount" en atributos, advierte sobre inconsistencias.
      - Si es un archivo "shapefile" (ZIP), menciona que suele contener .shp, .dbf, etc.
    `;

    // FIX: Using gemini-3-flash-preview as recommended for basic text/analysis tasks
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            validation: {
                type: Type.OBJECT,
                properties: {
                    format: { type: Type.STRING },
                    isComplete: { type: Type.BOOLEAN },
                    isValid: { type: Type.BOOLEAN },
                    issues: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
            },
            metadata: {
                type: Type.OBJECT,
                properties: {
                    fileName: { type: Type.STRING },
                    fileSize: { type: Type.STRING },
                    featureCount: { type: Type.NUMBER },
                    softwareOrigin: { type: Type.STRING }
                }
            },
            srs: {
                type: Type.OBJECT,
                properties: {
                    system: { type: Type.STRING },
                    projection: { type: Type.STRING },
                    epsg: { type: Type.STRING },
                    notes: { type: Type.STRING }
                }
            },
            geometry: {
                type: Type.OBJECT,
                properties: {
                    stats: { 
                        type: Type.ARRAY, 
                        items: { 
                            type: Type.OBJECT,
                            properties: {
                                type: { type: Type.STRING },
                                count: { type: Type.NUMBER },
                                totalArea: { type: Type.STRING },
                                totalLength: { type: Type.STRING },
                                invalidCount: { type: Type.NUMBER }
                            }
                        } 
                    },
                    bbox: { type: Type.STRING },
                    topologyNotes: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
            },
            attributes: {
                type: Type.OBJECT,
                properties: {
                    fields: { 
                        type: Type.ARRAY, 
                        items: { 
                             type: Type.OBJECT,
                             properties: {
                                 name: { type: Type.STRING },
                                 type: { type: Type.STRING },
                                 sample: { type: Type.STRING },
                                 missingCount: { type: Type.NUMBER },
                                 uniqueCount: { type: Type.NUMBER }
                             }
                        } 
                    },
                    primaryKeySuggestion: { type: Type.STRING },
                    notes: { type: Type.STRING }
                }
            },
            advanced: {
                type: Type.OBJECT,
                properties: {
                    zoningPotential: { type: Type.STRING },
                    overlapNotes: { type: Type.STRING },
                    outliersDetected: { type: Type.BOOLEAN },
                    summary: { type: Type.STRING },
                    recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
                }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    return JSON.parse(text) as AnalysisResult;

  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    throw error;
  }
};

export const analyzePreliminaryResults = async (
    totalManzanas: number,
    excludedCount: number,
    validCount: number,
    layersUsed: string[]
): Promise<string> => {
    try {
        if (!process.env.API_KEY) throw new Error("API Key required");
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const prompt = `
            Actúa como un URBANISTA EXPERTO.
            Se ha realizado un "Análisis Preliminar" de zonificación urbana.
            
            DATOS:
            - Total de Manzanas analizadas: ${totalManzanas}
            - Manzanas EXCLUIDAS (No aptas): ${excludedCount}
            - Manzanas APTAS: ${validCount}
            - Porcentaje de Exclusión: ${((excludedCount / totalManzanas) * 100).toFixed(2)}%
            - Capas de Restricción utilizadas: ${layersUsed.join(', ')}

            TAREA:
            Genera un párrafo de análisis técnico (máximo 100 palabras) explicando las implicaciones de estos resultados para el desarrollo urbano. 
            Si la exclusión es alta, sugiere revisión de normativas o mitigación. 
            Menciona la importancia de respetar las capas de riesgo/protección en la planificación.
        `;

        // FIX: Using gemini-3-flash-preview
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });

        return response.text || "No se pudo generar el análisis.";
    } catch (e) {
        return "Error al conectar con IA para análisis preliminar.";
    }
};

export const analyzeStepResults = async (
    stepTitle: string,
    description: string,
    stats: { label: string; value: string | number }[]
): Promise<string> => {
    try {
        if (!process.env.API_KEY) throw new Error("API Key required");
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        const statsText = stats.map(s => `- ${s.label}: ${s.value}`).join('\n');

        const prompt = `
            Actúa como un URBANISTA Y PLANIFICADOR TERRITORIAL.
            Analiza los siguientes resultados del paso "${stepTitle}" en un proceso de zonificación.
            
            DESCRIPCIÓN DEL PASO:
            ${description}

            ESTADÍSTICAS OBTENIDAS:
            ${statsText}

            TAREA:
            Redacta un análisis técnico breve (máx. 100 palabras) interpretando estos datos. 
            Enfócate en qué significa el nivel de cobertura o los valores obtenidos para la calidad de vida o aptitud urbana de la zona.
            Usa lenguaje formal y técnico.
        `;

        // FIX: Using gemini-3-flash-preview
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });

        return response.text || "No se pudo generar el análisis.";
    } catch (e) {
        return "Error al conectar con IA para análisis de paso.";
    }
};

// --- LITERAL DESCRIPTION GENERATOR ---

export const generateBoundaryDescription = async (
    zoneName: string,
    zoneFeature: Feature<Polygon | MultiPolygon>, 
    viasLayer?: LayerData,
    locationContext?: string
): Promise<string> => {
    try {
        if (!process.env.API_KEY) throw new Error("API Key required");
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

        let streetDataInfo = "";

        // MODE 1: Use Vector Layer (Math Match)
        if (viasLayer && viasLayer.data.features.length > 0) {
            // 1. Unify Zone Boundary
            // If MultiPolygon, simplistic approach: take the convex hull or the largest polygon
            let polygonToAnalyze = zoneFeature;
            if (zoneFeature.geometry.type === 'MultiPolygon') {
                // Find largest poly in MP
                // Simplify for MVP: Convex Hull of the zone to simulate the perimeter
                
                // turf.convex requires a FeatureCollection in newer versions or Feature
                // wrap in FC if needed
                const fc: any = { type: 'FeatureCollection', features: [zoneFeature] };
                const hull = turf.convex(fc);
                if (hull) polygonToAnalyze = hull as any;
            }

            // 2. Get Coordinates
            const coords = (polygonToAnalyze.geometry as Polygon).coordinates[0]; // Outer ring
            
            // 3. Find NE Corner (Max Lat, Max Lon) roughly
            let neIndex = 0;
            let maxScore = -Infinity;
            
            coords.forEach((coord, i) => {
                // Score = lat + lon (NE is top-right)
                const score = coord[1] + coord[0]; 
                if (score > maxScore) {
                    maxScore = score;
                    neIndex = i;
                }
            });

            // 4. Reorder coordinates to start at NE
            // Standard GeoJSON Polygon is Counter-Clockwise (CCW). We need Clockwise (CW) for description usually?
            // Actually, "Clockwise" traversal means finding the street to the "Right" or following the line.
            // Let's ensure the ring is Clockwise first.
            const lineRing = {
                type: 'Feature',
                properties: {},
                geometry: {
                    type: 'LineString',
                    coordinates: coords
                }
            } as Feature<LineString>;

            const isCW = turf.booleanClockwise(lineRing);
            
            let orderedCoords = [...coords];
            if (!isCW) orderedCoords.reverse(); // Make it Clockwise

            // Rotate array to start at NE Index (needs adjustment after reverse)
            // Re-find NE index in ordered array
            let neIndexNew = 0;
            maxScore = -Infinity;
            orderedCoords.forEach((coord, i) => {
                const score = coord[1] + coord[0]; 
                if (score > maxScore) { maxScore = score; neIndexNew = i; }
            });
            
            const part1 = orderedCoords.slice(neIndexNew);
            const part2 = orderedCoords.slice(0, neIndexNew);
            const finalPath = [...part1, ...part2, part1[0]]; // Close loop

            // 5. Sample segments and find street names
            const streetMatches: string[] = [];
            
            const nameKeys = ['nombre', 'calle', 'avenida', 'name', 'via', 'etiqueta'];
            
            // LET'S SIMPLIFY: Just find nearby streets via BBOX intersection for the prompt context
            const zoneBbox = turf.bbox(zoneFeature);
            const nearbyStreets = new Set<string>();
            const viasFeatures = viasLayer.data.features;

            viasFeatures.forEach((via) => {
                if (via.geometry.type !== 'LineString' && via.geometry.type !== 'MultiLineString') return;
                // Rough check: intersect bbox?
                const viaBbox = turf.bbox(via);
                const overlap = !(zoneBbox[0] > viaBbox[2] || zoneBbox[2] < viaBbox[0] || zoneBbox[1] > viaBbox[3] || zoneBbox[3] < viaBbox[1]);
                
                if (overlap) {
                    // Extract name
                    const props = via.properties || {};
                    const nameKey = Object.keys(props).find(k => nameKeys.some(nk => k.toLowerCase().includes(nk)));
                    if (nameKey && props[nameKey]) {
                        nearbyStreets.add(props[nameKey]);
                    }
                }
            });

            streetDataInfo = `
                Lista de VÍAS (Calles/Avenidas) detectadas geométricamente cerca o dentro de la zona:
                ${Array.from(nearbyStreets).join(', ')}.
            `;
        }

        const prompt = `
            Actúa como un TOPÓGRAFO Y ABOGADO CATASTRAL EXPERTO.
            Redacta la "DESCRIPCIÓN LITERAL DE LÍMITES" para una zona denominada "${zoneName}".
            
            REGLAS DE REDACCIÓN:
            1. Inicia OBLIGATORIAMENTE en la esquina NORESTE (NE) de la zona.
            2. Describe el recorrido en sentido HORARIO (Agujas del reloj: Este -> Sur -> Oeste -> Norte).
            3. Usa terminología técnica: "colinda con", "siguiendo el eje de la vía", "con rumbo sur", "vértice", "tramo".
            4. Si se proporcionaron nombres de calles, ÚSALOS para describir los límites.
            5. Si NO hay nombres de calles claros, usa descripciones cardinales y coordenadas referenciales o menciona "vía sin nombre".
            6. La redacción debe ser fluida, como un párrafo legal para una Ordenanza Municipal.

            CONTEXTO GEOGRÁFICO:
            - Ubicación aproximada: ${locationContext || "Municipio desconocido"} (Usa este dato si ayuda a inferir calles principales de OSM/Esri, pero prioriza los datos proporcionados).
            - Coordenadas del Polígono (Muestra simplificada para orientación):
            ${JSON.stringify((zoneFeature.geometry as any).coordinates[0].slice(0, 10))}... (Total de vértices truncado).

            DATOS DE VÍAS (Fuente Usuario):
            ${streetDataInfo || "No se cargó capa de vías específica. Usa referencias cardinales o inferencia de mapa base si es posible."}

            SALIDA:
            Genera únicamente el texto de la descripción literal. Sin introducciones tipo "Aquí tienes".
            Ejemplo formato: "Partiendo del vértice Noreste, ubicado en la intersección de... con rumbo Sur..."
        `;

        // FIX: Using gemini-3-flash-preview
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt
        });

        return response.text || "No se pudo generar la descripción.";

    } catch (e) {
        console.error("Desc Lit Error", e);
        return "Error al conectar con el servicio de IA para la descripción literal.";
    }
};
