import { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';

export type TabType = 'CAPAS' | 'ANALISIS' | 'ZONAS' | 'PLANOS' | 'DESC_LIT' | 'PREDIOS' | 'ENCUESTA';

export type AnalysisMode = 'MANZANA' | 'PREDIO';

export type StepStatus = 'pending' | 'completed' | 'error';

export type StepIdentifier = 'PRELIMINARY' | 'STEP1' | 'STEP2' | 'STEP3';

export interface StepReportData {
  stepTitle: string;
  description: string;
  stats: { label: string; value: string | number }[];
  qualitativeAnalysis: string[];
  aiAnalysis?: string; // New field for AI insights
  timestamp: string;
}

export interface AnalysisReport {
    id: string;
    step: StepIdentifier;
    data: StepReportData;
}

export interface LayerData {
  id: string;
  name: string;
  fileName: string; // Base filename (or concatenated)
  type: 'kml' | 'kmz' | 'geojson' | 'shapefile' | 'csv' | 'dxf' | 'topojson';
  data: FeatureCollection<Geometry, GeoJsonProperties>;
  visible: boolean; // Global visibility
  color: string;
  fileSize: string; // Global size
  geometryType: string;
  slot: string; // The name of the slot this layer occupies (e.g., "Manzanas")
  opacity: number; // 0 to 1
  pointSize: number; // For point markers

  // Granular Geometry Controls
  hasPoint: boolean;
  hasLine: boolean;
  hasPolygon: boolean;

  visiblePoint: boolean;
  visibleLine: boolean;
  visiblePolygon: boolean;

  fileSizePoint: string;
  fileSizeLine: string;
  fileSizePolygon: string;

  // Feature Counts
  featureCountPoint: number;
  featureCountLine: number;
  featureCountPolygon: number;

  // Analysis Data
  bufferData?: FeatureCollection<Geometry, GeoJsonProperties>;
  bufferDistance?: number;
  bufferVisible: boolean; // New property to toggle buffer visibility

  // Zoning Analysis
  isIncludedInAnalysis: boolean;

  // Preliminary Analysis Specifics
  includeInPreliminary: boolean; // Whether to use this layer for exclusion logic
  preliminaryThreshold: number; // Percentage (0-100) of overlap allowed before exclusion

  // Labeling
  showLabels: boolean; // Toggle to show "CODIGO" labels

  // Sampling Module Specifics
  samplingZoneId?: string;
  samplingType?: 'MANZANAS_TOTAL' | 'MANZANAS_SAMPLE' | 'PREDIOS_TOTAL' | 'PREDIOS_SAMPLE';
}

export interface ZoningResult {
  zoneName: string; // "ZONA A", "ZONA B", etc.
  description: string;
  color: string;
  features: FeatureCollection<Geometry, GeoJsonProperties>;
  visible: boolean; // Control visibility on map
}

// --- SAMPLING MODULE TYPES ---

export interface SamplingZone {
    id: string;
    name: string; // "Zona A", "Zona B"
    layers: {
        manzanasTotalId?: string;
        manzanasSampleId?: string;
        prediosTotalId?: string;
        prediosSampleId?: string;
    };
    results?: {
        blockCoveragePct: number; // % Manzanas Encuestadas / Totales
        isBlockCoverageSufficient: boolean; // >= 50%
        invalidManzanasCount: number;
        totalManzanasSampled: number;
    };
}

export interface SamplingValidationResult {
    manzanaId: string | number; // ID or Index
    isValid: boolean;
    issues: string[]; // "Insuficiente (<20%)", "Falta Esquina", "Falta Centro"
    geometry: Geometry; // For highlighting
    samplePct: number;
}

// --- SURVEY MODULE TYPES (ENCUESTA) ---

export interface SurveySummaryData {
    index: number;
    zona: string;
    manzana: string;
    valorPromedioM2: number;
}

export interface StatisticalMetrics {
    count: number;
    mean: number;
    median: number;
    mode: number | string; // Can be multi-modal or 'N/A'
    min: number;
    max: number;
    variance: number;
    stdDev: number;
    cv: number; // Coefficient of Variation %
    rSquared: number; // Determination coefficient (Linear Trend)
}

export interface SurveyZone {
    id: string;
    name: string; // "Zona A"
    form1File?: File; // The raw uploaded file (PDF/XLSX)
    extractedData?: SurveySummaryData[]; // The processed data
}

// --- GIS PROFESSIONAL ANALYSIS TYPES ---

export interface AttributeStat {
    name: string;
    type: string;
    sample: string;
    missingCount: number;
    uniqueCount: number;
}

export interface GeometryStat {
    type: string;
    count: number;
    totalArea?: string; // Formatted with units
    totalLength?: string; // Formatted with units
    invalidCount: number;
}

export interface AnalysisResult {
  // 1. Validation
  validation: {
      format: string;
      isComplete: boolean;
      isValid: boolean;
      issues: string[];
  };
  // 2. Metadata
  metadata: {
      fileName: string;
      fileSize: string;
      featureCount: number;
      softwareOrigin?: string;
  };
  // 3. SRS
  srs: {
      system: string;
      projection: string;
      zone?: string;
      epsg?: string;
      notes: string;
  };
  // 4. Geometry
  geometry: {
      stats: GeometryStat[];
      bbox: string; // formatted string
      topologyNotes: string[];
  };
  // 5. Attributes
  attributes: {
      fields: AttributeStat[];
      primaryKeySuggestion?: string;
      notes: string;
  };
  // 6. Advanced
  advanced: {
      zoningPotential: string;
      overlapNotes: string;
      outliersDetected: boolean;
      summary: string;
      recommendations: string[];
  };
}