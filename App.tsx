
import React, { useState, useCallback } from 'react';
import { MapComponent } from './components/MapComponent';
import { Sidebar } from './components/Sidebar';
import { LayerData, AnalysisResult, ZoningResult, AnalysisMode, StepStatus, StepIdentifier, StepReportData, TabType, SamplingZone, SurveyZone } from './types';
import { analyzeGeoData, generateBoundaryDescription, analyzeStepResults } from './services/geminiService';
import { Feature } from 'geojson';
import * as turf from '@turf/turf';
import { exportZoningData, exportFeatureCollection } from './services/exportService';
import { processSurveyFile, calculateStatistics } from './services/surveyService';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('CAPAS'); 
  const [layers, setLayers] = useState<LayerData[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [zoningResults, setZoningResults] = useState<ZoningResult[]>([]);
  
  // Estados de Análisis Preliminar
  const [validManzanas, setValidManzanas] = useState<Feature[]>([]);
  const [excludedManzanas, setExcludedManzanas] = useState<Feature[]>([]); 
  const [excludedVisible, setExcludedVisible] = useState(true);
  const [excludedOpacity, setExcludedOpacity] = useState(0.4);
  const [validVisible, setValidVisible] = useState(true);
  const [validOpacity, setValidOpacity] = useState(0.3);

  // Estados de Módulos Adicionales
  const [samplingZones, setSamplingZones] = useState<SamplingZone[]>([]);
  const [surveyZones, setSurveyZones] = useState<SurveyZone[]>([]);

  const [stepStatus, setStepStatus] = useState<Record<StepIdentifier, StepStatus>>({
      PRELIMINARY: 'pending', STEP1: 'pending', STEP2: 'pending', STEP3: 'pending'
  });
  const [stepReports, setStepReports] = useState<Record<StepIdentifier, StepReportData | null>>({
      PRELIMINARY: null, STEP1: null, STEP2: null, STEP3: null
  });

  const checkIntersectionPct = (featureA: Feature<any>, featureB: Feature<any>, thresholdPct: number): boolean => {
      try {
          if (!featureA.geometry || !featureB.geometry) return false;
          const intersection = turf.intersect(turf.featureCollection([featureA as any, featureB as any]));
          if (!intersection) return false;
          const areaA = turf.area(featureA);
          const areaInt = turf.area(intersection);
          return areaA > 0 && ((areaInt / areaA) * 100) >= thresholdPct;
      } catch (e) { return false; }
  };

  const handleAddLayer = useCallback((newLayer: LayerData) => { setLayers(prev => [...prev, newLayer]); }, []);
  const handleRemoveLayer = useCallback((id: string) => { setLayers(prev => prev.filter(l => l.id !== id)); }, []);
  const handleUpdateLayer = useCallback((id: string, updates: Partial<LayerData>) => { setLayers(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l)); }, []);
  const handleToggleVisibility = useCallback((id: string) => { setLayers(prev => prev.map(l => l.id === id ? { ...l, visible: !l.visible } : l)); }, []);

  const handleResetStep = useCallback((stepId: StepIdentifier) => {
      setStepStatus(prev => {
          const next = { ...prev };
          if (stepId === 'PRELIMINARY') {
              next.PRELIMINARY = 'pending'; next.STEP1 = 'pending'; next.STEP2 = 'pending'; next.STEP3 = 'pending';
              setValidManzanas([]); setExcludedManzanas([]); setZoningResults([]);
          } else if (stepId === 'STEP1') {
              next.STEP1 = 'pending'; next.STEP2 = 'pending'; next.STEP3 = 'pending';
              setZoningResults([]);
          } else if (stepId === 'STEP2') {
              next.STEP2 = 'pending'; next.STEP3 = 'pending';
              setZoningResults(prevZ => prevZ.map(z => ({
                ...z,
                features: { ...z.features, features: z.features.features.map(f => ({ ...f, properties: { ...f.properties, zoning_score: f.properties?.step1_score || 0 } })) }
              })));
          } else if (stepId === 'STEP3') {
              next.STEP3 = 'pending';
              setZoningResults(prevZ => prevZ.map(z => ({
                ...z,
                features: { ...z.features, features: z.features.features.map(f => ({ ...f, properties: { ...f.properties, zoning_score: f.properties?.step2_score || f.properties?.step1_score || 0 } })) }
              })));
          }
          return next;
      });
      setStepReports(prev => ({ ...prev, [stepId]: null }));
  }, []);

  const handleRunPreliminaryAnalysis = useCallback((selectedExclusionLayerIds: string[]) => {
      setIsAnalyzing(true);
      setTimeout(() => {
        try {
            const manzanasLayer = layers.find(l => l.slot === 'Manzanas');

            if (!manzanasLayer) { 
                alert("OBLIGATORIO: Cargue la capa de 'Manzanas' primero."); 
                setIsAnalyzing(false); return; 
            }
            
            const exclusionLayers = layers.filter(l => selectedExclusionLayerIds.includes(l.id));
            const valid: Feature[] = [];
            const excluded: Feature[] = [];

            manzanasLayer.data.features.forEach(manzana => {
                let isRestricted = false;
                let restrictionName = "";
                
                // Análisis de sobreposición contra capas de riesgos, cultivo o protección
                for (const exLayer of exclusionLayers) {
                    for (const exFeature of exLayer.data.features) {
                         // Si hay sobreposición > 1%, se considera excluida
                         if (checkIntersectionPct(manzana as any, exFeature as any, 1)) { 
                             isRestricted = true; 
                             restrictionName = exLayer.slot; 
                             break; 
                         }
                    }
                    if (isRestricted) break;
                }

                if (isRestricted) { 
                    excluded.push({ 
                        ...manzana, 
                        properties: { 
                            ...manzana.properties, 
                            excluded: true, 
                            exclusion_reason: restrictionName 
                        } 
                    }); 
                } else { 
                    valid.push({
                        ...manzana,
                        properties: {
                            ...manzana.properties,
                            excluded: false
                        }
                    }); 
                }
            });

            setValidManzanas(valid);
            setExcludedManzanas(excluded);
            setStepStatus(prev => ({ ...prev, PRELIMINARY: 'completed' }));
            setStepReports(prev => ({ ...prev, PRELIMINARY: { stepTitle: "Exclusión", description: "Análisis de sobreposición contra Riesgos, Cultivo y Protección.", stats: [{ label: "Manzanas Aptas", value: valid.length }, { label: "Manzanas Excluidas", value: excluded.length }], qualitativeAnalysis: ["Capa 'Area Urbana' usada como referencia visual.", "Determinación de áreas útiles para zonificación."], timestamp: new Date().toLocaleString() } }));
        } catch (e) { alert("Error en análisis preliminar."); } finally { setIsAnalyzing(false); }
      }, 500);
  }, [layers]);

  // PASO 1: SERVICIOS BÁSICOS
  const handleRunStep1Analysis = useCallback((selectedIds: string[]) => {
      setIsAnalyzing(true);
      setTimeout(async () => {
        try {
          if (validManzanas.length === 0) { setIsAnalyzing(false); return; }
          const activeLayers = layers.filter(l => selectedIds.includes(l.id));
          const maxLayers = activeLayers.length;
          
          const zoneGroups: Record<number, Feature[]> = {}; 
          validManzanas.forEach(manzana => {
              let hitCount = 0;
              activeLayers.forEach(layer => {
                  let intersectsLayer = false;
                  for (const feature of layer.data.features) {
                      if (checkIntersectionPct(manzana as any, feature as any, 50)) { intersectsLayer = true; break; }
                  }
                  if (intersectsLayer) hitCount++;
              });
              const diff = maxLayers - hitCount;
              if (!zoneGroups[diff]) zoneGroups[diff] = [];
              const score = hitCount === maxLayers ? 10 : Math.max(0, 10 - (diff * 2));
              zoneGroups[diff].push({ 
                ...manzana, 
                properties: { 
                  ...manzana.properties, 
                  zoning_score: score, 
                  step1_score: score,
                  services_count: hitCount 
                } 
              });
          });

          const newZoning: ZoningResult[] = [];
          const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
          const colors = ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444', '#71717a'];
          Object.keys(zoneGroups).sort().forEach((diff, i) => {
              const diffVal = parseInt(diff);
              newZoning.push({
                  zoneName: `ZONA ${alphabet[i] || i}`,
                  description: `Cobertura de Servicios: ${maxLayers - diffVal}/${maxLayers} redes detectadas.`,
                  color: colors[i % colors.length],
                  visible: true,
                  features: { type: 'FeatureCollection', features: zoneGroups[diffVal] }
              });
          });

          const aiInsight = await analyzeStepResults("Servicios Básicos", "Zonificación por cobertura de infraestructura.", [{ label: "Zonas creadas", value: newZoning.length }]);

          setZoningResults(newZoning);
          setStepStatus(prev => ({ ...prev, STEP1: 'completed' }));
          setStepReports(prev => ({ ...prev, STEP1: { stepTitle: "Servicios Básicos", description: "Zonificación inicial por redes.", stats: [{ label: "Zonas", value: newZoning.length }], qualitativeAnalysis: ["Priorización de zonas con servicios completos."], aiAnalysis: aiInsight, timestamp: new Date().toLocaleString() } }));
          setActiveTab('ZONAS');
        } catch(e) { alert("Error en Paso 1."); } finally { setIsAnalyzing(false); }
      }, 500);
  }, [layers, validManzanas]);

  // PASO 2: EQUIPAMIENTOS (BUFFERS INDIVIDUALES)
  const handleRunStep2Analysis = useCallback((selectedIds: string[]) => {
      setIsAnalyzing(true);
      setTimeout(async () => {
        try {
          const activeLayers = layers.filter(l => selectedIds.includes(l.id));
          const layerBuffers = activeLayers.map(layer => {
              const dist = layer.bufferDistance || 300;
              return { 
                id: layer.id, 
                buffer: turf.buffer(layer.data as any, dist, { units: 'meters' }) 
              };
          });

          const newZones = zoningResults.map(zone => {
              const updatedFeatures = zone.features.features.map(manzana => {
                  let hits = 0;
                  layerBuffers.forEach(lb => { if (checkIntersectionPct(manzana as any, lb.buffer as any, 50)) hits++; });
                  const prev = manzana.properties?.zoning_score || 0;
                  const newScore = prev + (hits * 2);
                  return { 
                    ...manzana, 
                    properties: { 
                      ...manzana.properties, 
                      zoning_score: newScore,
                      step2_score: newScore,
                      equip_hits: hits 
                    } 
                  };
              });
              return { ...zone, features: { ...zone.features, features: updatedFeatures } };
          });

          const aiInsight = await analyzeStepResults("Equipamientos", "Ponderación por proximidad a servicios públicos.", [{ label: "Equipamientos analizados", value: activeLayers.length }]);

          setZoningResults(newZones);
          setStepStatus(prev => ({ ...prev, STEP2: 'completed' }));
          setStepReports(prev => ({ ...prev, STEP2: { stepTitle: "Equipamientos", description: "Ponderación por proximidad.", stats: [{ label: "Capas", value: activeLayers.length }], qualitativeAnalysis: ["Aumento de valor por cercanía a salud/educación."], aiAnalysis: aiInsight, timestamp: new Date().toLocaleString() } }));
        } catch(e) { alert("Error en Paso 2."); } finally { setIsAnalyzing(false); }
      }, 500);
  }, [layers, zoningResults]);

  // PASO 3: TOPOGRAFÍA (PENALIZACIONES)
  const handleRunStep3Analysis = useCallback((selectedIds: string[]) => {
      setIsAnalyzing(true);
      setTimeout(async () => {
        try {
          const activeLayers = layers.filter(l => selectedIds.includes(l.id));
          const newZones = zoningResults.map(zone => {
              const updatedFeatures = zone.features.features.map(manzana => {
                  let penalty = 0;
                  activeLayers.forEach(l => { 
                      // Si la manzana intersecta una zona accidentada, penalizar
                      if (checkIntersectionPct(manzana as any, l.data as any, 10)) {
                        if (l.slot.includes('> 45')) penalty += 5; 
                        else if (l.slot.includes('16°')) penalty += 3;
                        else if (l.slot.includes('11°')) penalty += 1;
                      }
                  });
                  const prev = manzana.properties?.zoning_score || 0;
                  const finalScore = Math.max(0, prev - penalty);
                  return { 
                    ...manzana, 
                    properties: { 
                      ...manzana.properties, 
                      zoning_score: finalScore,
                      step3_penalty: penalty 
                    } 
                  };
              });
              return { ...zone, features: { ...zone.features, features: updatedFeatures } };
          });

          const aiInsight = await analyzeStepResults("Topografía", "Ajuste de aptitud por pendientes.", [{ label: "Capas de relieve", value: activeLayers.length }]);

          setZoningResults(newZones);
          setStepStatus(prev => ({ ...prev, STEP3: 'completed' }));
          setStepReports(prev => ({ ...prev, STEP3: { stepTitle: "Topografía", description: "Ajuste por relieve.", stats: [{ label: "Pendientes", value: activeLayers.length }], qualitativeAnalysis: ["Reducción de aptitud en terrenos accidentados."], aiAnalysis: aiInsight, timestamp: new Date().toLocaleString() } }));
        } catch(e) { alert("Error en Paso 3."); } finally { setIsAnalyzing(false); }
      }, 500);
  }, [layers, zoningResults]);

  // Manejadores para el módulo de Encuestas
  const handleUploadSurvey = async (zoneId: string, file: File) => {
    try {
        const data = await processSurveyFile(file);
        setSurveyZones(prev => prev.map(z => z.id === zoneId ? { ...z, extractedData: data, form1File: file } : z));
        alert(`Se han extraído ${data.length} registros de valuación.`);
    } catch (e) { alert((e as Error).message); }
  };

  return (
    <div className="flex h-screen w-full flex-row overflow-hidden bg-black text-slate-100 font-sans">
      <Sidebar
        isOpen={isSidebarOpen}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        layers={layers}
        onAddLayer={handleAddLayer}
        onRemoveLayer={handleRemoveLayer}
        onUpdateLayer={handleUpdateLayer}
        onToggleVisibility={handleToggleVisibility}
        onResetStep={handleResetStep}
        stepStatus={stepStatus}
        stepReports={stepReports}
        onRunPreliminaryAnalysis={handleRunPreliminaryAnalysis}
        onRunStep1Analysis={handleRunStep1Analysis}
        onRunStep2Analysis={handleRunStep2Analysis}
        onRunStep3Analysis={handleRunStep3Analysis}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        zoningResults={zoningResults}
        onToggleZoneVisibility={(i) => setZoningResults(prev => prev.map((z, idx) => i === idx ? { ...z, visible: !z.visible } : z))}
        onExportZone={exportZoningData}
        onExportExcluded={(f) => exportFeatureCollection(excludedManzanas, "Excluidas", f)}
        onExportAptas={(f) => exportFeatureCollection(validManzanas, "Aptas", f)}
        isAnalyzing={isAnalyzing}
        validVisible={validVisible}
        onToggleValidVisibility={() => setValidVisible(!validVisible)}
        validOpacity={validOpacity}
        onChangeValidOpacity={setValidOpacity}
        excludedVisible={excludedVisible}
        onToggleExcludedVisibility={() => setExcludedVisible(!excludedVisible)}
        excludedOpacity={excludedOpacity}
        onChangeExcludedOpacity={setExcludedOpacity}
        samplingZones={samplingZones}
        onAddSamplingZone={() => setSamplingZones(prev => [...prev, { id: crypto.randomUUID(), name: `Zona ${prev.length + 1}`, layers: {} }])}
        onRemoveSamplingZone={(id) => setSamplingZones(prev => prev.filter(z => z.id !== id))}
        surveyZones={surveyZones}
        onAddSurveyZone={() => setSurveyZones(prev => [...prev, { id: crypto.randomUUID(), name: `Zona ${prev.length + 1}` }])}
        onRemoveSurveyZone={(id) => setSurveyZones(prev => prev.filter(z => z.id !== id))}
        onUploadSurveyFile={handleUploadSurvey}
      />
      <div className="flex-1 relative h-full w-full">
        <MapComponent 
            layers={layers} 
            zoningResults={zoningResults}
            excludedManzanas={excludedManzanas}
            excludedVisible={excludedVisible}
            excludedOpacity={excludedOpacity}
            validManzanas={validManzanas}
            validVisible={validVisible}
            validOpacity={validOpacity}
            activeTab={activeTab}
        />
      </div>
    </div>
  );
}
