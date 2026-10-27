import * as toGeoJSON from '@tmcw/togeojson';
import JSZip from 'jszip';
import { FeatureCollection, Feature, Geometry, Point, Position } from 'geojson';
import { LayerData } from '../types';
import shp from 'shpjs';
import Papa from 'papaparse';
import * as topojson from 'topojson-client';
import * as DxfParserModule from 'dxf-parser';
import proj4 from 'proj4';

// Handle DxfParser import which might not have a default export in some bundlers
const DxfParser = (DxfParserModule as any).default || DxfParserModule;

// Ensure proj4 is globally available for shpjs to use for re-projections
if (typeof window !== 'undefined') {
  (window as any).proj4 = proj4;
}

// Helper to generate a random bright color for new layers
const getRandomColor = () => {
  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#e11d48', '#84cc16'];
  return colors[Math.floor(Math.random() * colors.length)];
};

// Helper to format file size
const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Helper to get geometry type in Spanish
const getGeometryTypeSummary = (fc: FeatureCollection, type: string): string => {
    const types = new Set<string>();
    fc.features.forEach(f => {
        if (f.geometry && f.geometry.type) {
            types.add(f.geometry.type);
        }
    });

    if (types.size === 0) return 'Desconocido';
    
    const translate: Record<string, string> = {
        'Point': 'Punto',
        'MultiPoint': 'Multipunto',
        'LineString': 'Línea',
        'MultiLineString': 'Multilínea',
        'Polygon': 'Polígono',
        'MultiPolygon': 'Multipolígono',
        'GeometryCollection': 'Colección'
    };

    const typeArray = Array.from(types).map(t => translate[t] || t);
    if (typeArray.length > 2) return 'Mixto';
    return typeArray.join(', ');
};

// Helper for CSV Parsing
const parseCsvToGeoJSON = (csvText: string): FeatureCollection => {
    const results = Papa.parse(csvText, { header: true, dynamicTyping: true, skipEmptyLines: true });
    const features: Feature[] = [];
    const data = results.data as any[];

    if (!data.length) throw new Error("El archivo CSV está vacío o no se pudo leer.");

    // Detect coordinate columns
    const headers = Object.keys(data[0]).map(h => h.toLowerCase());
    const latKeys = ['lat', 'latitude', 'latitud', 'y', 'northing'];
    const lonKeys = ['lon', 'lng', 'long', 'longitude', 'longitud', 'x', 'easting'];

    let latKey = Object.keys(data[0]).find(k => latKeys.includes(k.toLowerCase()));
    let lonKey = Object.keys(data[0]).find(k => lonKeys.includes(k.toLowerCase()));

    if (!latKey || !lonKey) {
        throw new Error("No se encontraron columnas de coordenadas (Latitud/Longitud o X/Y) en el CSV.");
    }

    data.forEach((row, index) => {
        const lat = parseFloat(row[latKey!]);
        const lon = parseFloat(row[lonKey!]);

        if (!isNaN(lat) && !isNaN(lon)) {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [lon, lat] // GeoJSON is [lon, lat]
                },
                properties: { ...row, id: index }
            });
        }
    });

    return { type: 'FeatureCollection', features };
};

// Helper for DXF Parsing
const parseDxfToGeoJSON = (dxfText: string): FeatureCollection => {
    let parser;
    try {
        parser = new DxfParser();
    } catch (e) {
        throw new Error("Error al inicializar el analizador DXF. Compruebe la compatibilidad del navegador.");
    }
    
    let dxf;
    try {
        dxf = parser.parseSync(dxfText);
    } catch (e) {
        throw new Error("Error al analizar el archivo DXF. Puede que sea una versión binaria no soportada.");
    }

    const features: Feature[] = [];

    if (!dxf || !dxf.entities) return { type: 'FeatureCollection', features: [] };

    dxf.entities.forEach((entity: any) => {
        if (entity.type === 'LINE') {
            features.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [entity.vertices[0].x, entity.vertices[0].y],
                        [entity.vertices[1].x, entity.vertices[1].y]
                    ]
                },
                properties: { layer: entity.layer, handle: entity.handle }
            });
        } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
            const coords = entity.vertices.map((v: any) => [v.x, v.y]);
            if(entity.shape) { // Closed polygon
               coords.push(coords[0]);
               features.push({
                   type: 'Feature',
                   geometry: { type: 'Polygon', coordinates: [coords] },
                   properties: { layer: entity.layer }
               });
            } else {
               features.push({
                   type: 'Feature',
                   geometry: { type: 'LineString', coordinates: coords },
                   properties: { layer: entity.layer }
               });
            }
        } else if (entity.type === 'CIRCLE') {
             features.push({
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [entity.center.x, entity.center.y]
                },
                properties: { layer: entity.layer, radius: entity.radius, type: 'CircleCenter' }
            });
        }
    });

    return { type: 'FeatureCollection', features };
};

export const parseFile = async (file: File): Promise<LayerData> => {
  const fileName = file.name;
  const extension = fileName.split('.').pop()?.toLowerCase();
  const id = crypto.randomUUID();

  let geoJson: FeatureCollection | null = null;
  let detectedType: LayerData['type'] = 'geojson';

  try {
    switch (extension) {
      case 'kml':
        const kmlText = await file.text();
        const kmlDom = new DOMParser().parseFromString(kmlText, 'text/xml');
        geoJson = toGeoJSON.kml(kmlDom);
        detectedType = 'kml';
        break;

      case 'kmz':
        const kmzZip = await JSZip.loadAsync(file);
        const kmlFile = Object.values(kmzZip.files).find((f: any) => f.name.toLowerCase().endsWith('.kml'));
        if (!kmlFile) throw new Error('No se encontró archivo KML dentro del KMZ.');
        const kmlString = await (kmlFile as any).async('string');
        const kmzDom = new DOMParser().parseFromString(kmlString, 'text/xml');
        geoJson = toGeoJSON.kml(kmzDom);
        detectedType = 'kmz';
        break;

      case 'zip':
        // Assume Shapefile inside ZIP
        // shpjs handles .zip files containing .shp, .shx, .dbf, .prj
        const arrayBuffer = await file.arrayBuffer();
        const shpResult = await shp(arrayBuffer);
        
        // shpjs returns either a FeatureCollection or an array of FeatureCollections
        if (Array.isArray(shpResult)) {
           // Merge if multiple files found, or take the first one
           geoJson = {
             type: 'FeatureCollection',
             features: shpResult.flatMap(fc => fc.features)
           };
        } else {
           geoJson = shpResult;
        }
        detectedType = 'shapefile';
        break;

      case 'json':
      case 'geojson':
        const jsonText = await file.text();
        const parsedJson = JSON.parse(jsonText);
        
        if (parsedJson.type === 'Topology') {
           // Handle TopoJSON
           const keys = Object.keys(parsedJson.objects);
           if (keys.length > 0) {
              // Convert first object found
              geoJson = topojson.feature(parsedJson, parsedJson.objects[keys[0]]) as unknown as FeatureCollection;
              detectedType = 'topojson';
           } else {
              throw new Error("TopoJSON inválido: sin objetos.");
           }
        } else {
           geoJson = parsedJson;
           detectedType = 'geojson';
        }
        break;
      
      case 'csv':
      case 'txt':
         const csvText = await file.text();
         geoJson = parseCsvToGeoJSON(csvText);
         detectedType = 'csv';
         break;
      
      case 'dxf':
         const dxfText = await file.text();
         geoJson = parseDxfToGeoJSON(dxfText);
         detectedType = 'dxf';
         break;

      // Complex formats guidance
      case 'dwg':
        throw new Error("El formato DWG es propietario y complejo. Por favor, exporta tu DWG a DXF o Shapefile usando AutoCAD o QGIS antes de subirlo.");
      case 'gpkg':
        throw new Error("GeoPackage (.gpkg) requiere librerías binarias pesadas. Por favor, convierte la capa a GeoJSON o Shapefile (ZIP) usando QGIS.");
      case 'tif':
      case 'tiff':
      case 'asc':
      case 'img':
      case 'gdb':
      case 'tab':
      case 'mif':
      case 'jp2':
      case 'ecw':
      case 'sid':
         throw new Error(`El formato .${extension} no está soportado directamente en el navegador. Por favor conviértelo a GeoJSON, Shapefile o KML/KMZ.`);

      default:
        throw new Error(`Formato .${extension} no soportado. Usa KML, KMZ, GeoJSON, CSV, DXF o Shapefile (ZIP).`);
    }

    if (!geoJson) throw new Error("No se pudieron extraer datos válidos del archivo.");

    // Normalize single Feature to FeatureCollection
    if ((geoJson as any).type === 'Feature') {
        geoJson = {
            type: 'FeatureCollection',
            features: [(geoJson as any)]
        };
    }

    if (geoJson.type !== 'FeatureCollection') {
         throw new Error('El resultado no es una colección de geometrías válida.');
    }

    const fileSize = formatFileSize(file.size);
    const geometryType = getGeometryTypeSummary(geoJson, detectedType);

    return {
      id,
      name: fileName,
      fileName,
      type: detectedType,
      data: geoJson,
      visible: true,
      color: getRandomColor(),
      fileSize,
      geometryType,
      slot: '', // Will be assigned by Sidebar
      opacity: 0.05, // Default opacity set to 5% as requested
      pointSize: 6,
      
      // Initialize flags
      hasPoint: false,
      hasLine: false,
      hasPolygon: false,
      visiblePoint: true,
      visibleLine: true,
      visiblePolygon: true,
      fileSizePoint: '',
      fileSizeLine: '',
      fileSizePolygon: '',
      featureCountPoint: 0,
      featureCountLine: 0,
      featureCountPolygon: 0,

      // Analysis defaults
      bufferVisible: true,
      isIncludedInAnalysis: false,

      // Preliminary defaults
      includeInPreliminary: true,
      preliminaryThreshold: 0,

      // Labeling
      showLabels: false
    };

  } catch (error) {
    console.error("Error parsing file:", error);
    throw new Error(`Error en ${fileName}: ${(error as Error).message}`);
  }
};