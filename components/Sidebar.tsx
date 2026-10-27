
import React, { useRef, useState } from 'react';
import { 
  Eye, EyeOff, Trash2, ChevronLeft, ChevronRight, Loader2, ChevronDown, 
  FileText, Layers, Download, Lightbulb, CheckCircle2, Building2, 
  Mountain, Scan, PlayCircle, BarChart2, Grid, ScrollText, 
  RotateCcw, ShieldAlert, Plus, Settings2, Database,
  MapPin, Info, Globe, FileSpreadsheet, Ruler, FileCode
} from 'lucide-react';
import { LayerData, StepStatus, StepIdentifier, TabType, StepReportData, ZoningResult, SamplingZone, SurveyZone } from '../types';
import { parseFile } from '../services/fileParser';
import { calculateStatistics } from '../services/surveyService';

interface SidebarProps {
  isOpen: boolean;
  toggleSidebar: () => void;
  layers: LayerData[];
  onAddLayer: (layer: LayerData) => void;
  onRemoveLayer: (id: string) => void;
  onUpdateLayer: (id: string, updates: Partial<LayerData>) => void;
  onToggleVisibility: (id: string) => void;
  onResetStep: (stepId: StepIdentifier) => void;
  stepStatus: Record<StepIdentifier, StepStatus>;
  stepReports: Record<StepIdentifier, StepReportData | null>;
  onRunPreliminaryAnalysis: (selectedExclusionIds: string[]) => void;
  onRunStep1Analysis: (selectedLayerIds: string[]) => void;
  onRunStep2Analysis: (selectedLayerIds: string[]) => void;
  onRunStep3Analysis: (selectedLayerIds: string[]) => void;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  zoningResults: ZoningResult[];
  onToggleZoneVisibility: (index: number) => void;
  onExportZone: (zone: ZoningResult, format: any) => void;
  onExportExcluded: (format: 'kml' | 'kmz' | 'shp') => void;
  onExportAptas: (format: 'kml' | 'kmz' | 'shp') => void;
  isAnalyzing: boolean;
  validVisible: boolean;
  onToggleValidVisibility: () => void;
  validOpacity: number;
  onChangeValidOpacity: (val: number) => void;
  excludedVisible: boolean;
  onToggleExcludedVisibility: () => void;
  excludedOpacity: number;
  onChangeExcludedOpacity: (val: number) => void;
  samplingZones: SamplingZone[];
  onAddSamplingZone: () => void;
  onRemoveSamplingZone: (id: string) => void;
  surveyZones: SurveyZone[];
  onAddSurveyZone: () => void;
  onRemoveSurveyZone: (id: string) => void;
  onUploadSurveyFile: (zoneId: string, file: File) => void;
}

const LAYER_GROUPS = [
  { title: "Municipio / Base", slots: ["Area Urbana", "Manzanas", "Predios", "Area de Riesgos", "Areas de Protección", "Areas de Cultivo", "Curvas de Nivel"] },
  { title: "Servicios Básicos", slots: ["Red de Electricidad", "Red de Teléfono", "Red de Alumbrado Público", "Red de Agua Potable", "Red de Alcantarillado"] },
  { title: "Equipamientos", slots: ["Salud", "Educación", "Abastecimiento", "Institucional", "Servicios"] },
  { title: "Topografía", slots: ["Plano 0° a 10°", "Pte. Baja 11° a 15°", "Pte. Alta 16° a 45°", "Accidentado > 45°"] }
];

const MANDATORY_SLOTS = ["Manzanas", "Red de Electricidad", "Red de Agua Potable", "Salud", "Educación"];

const NAV_ITEMS = [
  { id: 'CAPAS', icon: Layers, color: '#FE8330', label: 'Capas SIG' },
  { id: 'ANALISIS', icon: Scan, color: '#FFFF6A', label: 'Análisis' },
  { id: 'ZONAS', icon: Grid, color: '#74B72E', label: 'Zonificación' },
  { id: 'PLANOS', icon: FileText, color: '#2A7ABF', label: 'Planos' },
  { id: 'DESC_LIT', icon: ScrollText, color: '#8A2BE2', label: 'Desc. Literal' },
  { id: 'PREDIOS', icon: Building2, color: '#E879F9', label: 'Muestreo' },
  { id: 'ENCUESTA', icon: BarChart2, color: '#06b6d4', label: 'Encuestas' }
];

export const Sidebar: React.FC<SidebarProps> = (props) => {
  const { 
    isOpen, toggleSidebar, layers, onAddLayer, onRemoveLayer, onUpdateLayer, 
    onToggleVisibility, onResetStep, stepStatus, stepReports, 
    onRunPreliminaryAnalysis, onRunStep1Analysis, onRunStep2Analysis, 
    onRunStep3Analysis, activeTab, setActiveTab, zoningResults, 
    onToggleZoneVisibility, onExportZone, onExportExcluded, onExportAptas, isAnalyzing,
    validVisible, onToggleValidVisibility, validOpacity, onChangeValidOpacity,
    excludedVisible, onToggleExcludedVisibility, excludedOpacity, onChangeExcludedOpacity,
    samplingZones, onAddSamplingZone, onRemoveSamplingZone,
    surveyZones, onAddSurveyZone, onRemoveSurveyZone, onUploadSurveyFile
  } = props;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetSlot, setTargetSlot] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(0);
  const [expandedStep, setExpandedStep] = useState<string | null>('pre');

  const [selectedPre, setSelectedPre] = useState<string[]>([]);
  const [selectedS1, setSelectedS1] = useState<string[]>([]);
  const [selectedS2, setSelectedS2] = useState<string[]>([]);
  const [selectedS3, setSelectedS3] = useState<string[]>([]);

  const activeItem = NAV_ITEMS.find(i => i.id === activeTab);

  const handleFileClick = (slot: string) => { setTargetSlot(slot); fileInputRef.current?.click(); };
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && targetSlot) {
      try { const layer = await parseFile(file); layer.slot = targetSlot; onAddLayer(layer); } catch (err) { alert((err as Error).message); }
      setTargetSlot(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`flex h-full transition-all duration-300 ease-in-out bg-black border-r border-neutral-800 ${isOpen ? 'w-[380px]' : 'w-[72px]'}`}>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

      {/* STRIP DE NAVEGACION */}
      <div className="w-[72px] flex flex-col items-center py-5 bg-neutral-950 border-r border-neutral-800 shrink-0">
        <div className="mb-10 p-2">
          <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-white">
            <Globe size={28} strokeWidth={2.5} className="text-[#FE8330]" />
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-5">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id as TabType); if(!isOpen) toggleSidebar(); }}
              className={`p-3.5 rounded-2xl transition-all duration-200 group relative ${activeTab === item.id ? 'bg-neutral-800 shadow-lg' : 'hover:bg-neutral-900'}`}
              style={{ color: activeTab === item.id ? item.color : '#666' }}
              title={item.label}
            >
              <item.icon size={26} strokeWidth={activeTab === item.id ? 2.5 : 2} />
              {activeTab === item.id && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-7 rounded-r-full" style={{ backgroundColor: item.color }} />}
            </button>
          ))}
        </div>
        <button onClick={toggleSidebar} title={isOpen ? "Colapsar menú" : "Expandir menú"} className="p-4 text-neutral-500 hover:text-white hover:bg-neutral-900 rounded-2xl transition-all">
          {isOpen ? <ChevronLeft size={28} /> : <ChevronRight size={28} />}
        </button>
      </div>

      {/* PANEL DE CONTENIDO */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="p-5 border-b border-neutral-800 bg-neutral-900/50">
          <h2 className="text-2xl font-black uppercase tracking-tighter" style={{ color: activeItem?.color }}>{activeItem?.label}</h2>
          <p className="text-[11px] font-bold text-neutral-500 uppercase tracking-widest mt-1">GeoIdeas SIG Professional</p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-black/40">
          
          {activeTab === 'CAPAS' && (
            <div className="space-y-3">
              {LAYER_GROUPS.map((group, idx) => (
                <div key={idx} className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/20 shadow-sm">
                  <button onClick={() => setExpandedGroup(expandedGroup === idx ? null : idx)} className="w-full p-4 flex items-center justify-between hover:bg-white/5 transition-colors" title={`Expandir/Contraer grupo ${group.title}`}>
                    <span className="text-xs font-black uppercase text-neutral-200">{group.title}</span>
                    <ChevronDown size={16} className={`transition-transform ${expandedGroup === idx ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedGroup === idx && (
                    <div className="p-3 pt-0 space-y-2">
                      {group.slots.map(slot => {
                        const layer = layers.find(l => l.slot === slot);
                        const isMandatory = MANDATORY_SLOTS.includes(slot);
                        return layer ? (
                          <div key={slot} className="p-3 bg-black border border-neutral-800 rounded-lg group/item">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[11px] font-black text-white uppercase truncate flex-1">{slot}</span>
                              <button onClick={() => onRemoveLayer(layer.id)} title="Eliminar capa de la lista" className="text-neutral-600 hover:text-red-500 p-1 opacity-0 group-hover/item:opacity-100 transition-opacity"><Trash2 size={12}/></button>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={() => onToggleVisibility(layer.id)} title={layer.visible ? "Ocultar capa en el mapa" : "Mostrar capa en el mapa"} className={`p-1.5 rounded ${layer.visible ? 'bg-[#FE8330] text-black' : 'bg-neutral-800 text-neutral-500'}`}><Eye size={14}/></button>
                              <input type="range" min="0" max="1" step="0.1" value={layer.opacity} onChange={(e) => onUpdateLayer(layer.id, { opacity: parseFloat(e.target.value) })} title="Ajustar transparencia de la capa" className="flex-1 h-1.5 accent-[#FE8330]" />
                            </div>
                          </div>
                        ) : (
                          <button key={slot} onClick={() => handleFileClick(slot)} title={`Cargar archivo para ${slot}`} className={`w-full py-2.5 border border-dashed rounded-lg text-[10px] font-bold uppercase transition-all ${isMandatory ? 'border-red-500/30 text-red-500/60 hover:border-red-500' : 'border-neutral-800 text-neutral-500 hover:border-[#FE8330] hover:text-[#FE8330]'}`}>+ {slot} {isMandatory && "*"}</button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {activeTab === 'ANALISIS' && (
            <div className="space-y-4">
              {/* PASO PRELIMINAR: EXCLUSIÓN */}
              <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30">
                <div className="p-4 flex items-center justify-between bg-neutral-900/50 cursor-pointer" onClick={() => setExpandedStep('pre')} title="Abrir análisis de exclusión">
                  <div className="flex items-center gap-3">
                    <ShieldAlert size={18} className={stepStatus.PRELIMINARY === 'completed' ? 'text-green-500' : 'text-red-500'}/>
                    <span className="text-xs font-black uppercase">Paso Preliminar: Exclusión</span>
                  </div>
                </div>
                {expandedStep === 'pre' && (
                  <div className="p-4 space-y-4">
                    {stepStatus.PRELIMINARY !== 'completed' ? (
                      <div className="space-y-4">
                        <p className="text-[10px] text-neutral-400 font-bold uppercase">Sobreponer 'Manzanas' con capas restrictivas:</p>
                        <div className="max-h-40 overflow-y-auto custom-scrollbar border border-neutral-800 rounded-lg p-2 bg-black/40">
                          {layers.filter(l => ["Area de Riesgos", "Areas de Protección", "Areas de Cultivo"].includes(l.slot)).map(l => (
                            <label key={l.id} className="flex items-center gap-3 p-1.5 hover:bg-white/5 rounded cursor-pointer" title={`Usar ${l.slot} para exclusión`}>
                              <input type="checkbox" checked={selectedPre.includes(l.id)} onChange={() => setSelectedPre(p => p.includes(l.id) ? p.filter(x => x !== l.id) : [...p, l.id])} className="w-3.5 h-3.5 accent-[#FFFF6A]" />
                              <span className="text-[10px] font-bold text-neutral-400 uppercase">{l.slot}</span>
                            </label>
                          ))}
                        </div>
                        <button onClick={() => onRunPreliminaryAnalysis(selectedPre)} disabled={isAnalyzing} title="Iniciar proceso de filtrado de manzanas por sobreposición" className="w-full py-3 bg-white text-black text-xs font-black uppercase rounded-xl hover:bg-neutral-200 transition-all flex items-center justify-center gap-2">
                          {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <PlayCircle size={16}/>} Ejecutar Análisis
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                         <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl">
                               <div className="flex items-center justify-between mb-2">
                                  <span className="text-[9px] font-black uppercase text-green-500">Aptas</span>
                                  <button onClick={onToggleValidVisibility} title={validVisible ? "Ocultar manzanas aptas" : "Mostrar manzanas aptas"} className={`p-1 rounded ${validVisible ? 'bg-green-500 text-black' : 'bg-neutral-800 text-neutral-500'}`}><Eye size={10}/></button>
                               </div>
                               <span className="block text-2xl font-black text-green-500">{stepReports.PRELIMINARY?.stats[0].value}</span>
                               <input type="range" min="0" max="1" step="0.1" value={validOpacity} onChange={(e) => onChangeValidOpacity(parseFloat(e.target.value))} title="Ajustar transparencia de manzanas aptas" className="w-full h-1.5 mt-2 accent-green-500" />
                               <div className="grid grid-cols-3 gap-1 mt-3">
                                  <button onClick={() => onExportAptas('kmz')} title="Exportar manzanas aptas a KMZ" className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-[9px] font-black">KMZ</button>
                                  <button onClick={() => onExportAptas('kml')} title="Exportar manzanas aptas a KML" className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-[9px] font-black">KML</button>
                                  <button onClick={() => onExportAptas('shp')} title="Exportar manzanas aptas a Shapefile" className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-[9px] font-black">SHP</button>
                               </div>
                            </div>
                            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                               <div className="flex items-center justify-between mb-2">
                                  <span className="text-[9px] font-black uppercase text-red-500">Excluidas</span>
                                  <button onClick={onToggleExcludedVisibility} title={excludedVisible ? "Ocultar manzanas excluidas" : "Mostrar manzanas excluidas"} className={`p-1 rounded ${excludedVisible ? 'bg-red-500 text-black' : 'bg-neutral-800 text-neutral-500'}`}><Eye size={10}/></button>
                               </div>
                               <span className="block text-2xl font-black text-red-500">{stepReports.PRELIMINARY?.stats[1].value}</span>
                               <input type="range" min="0" max="1" step="0.1" value={excludedOpacity} onChange={(e) => onChangeExcludedOpacity(parseFloat(e.target.value))} title="Ajustar transparencia de manzanas excluidas" className="w-full h-1.5 mt-2 accent-red-500" />
                               <div className="grid grid-cols-3 gap-1 mt-3">
                                  <button onClick={() => onExportExcluded('kmz')} title="Exportar manzanas excluidas a KMZ" className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-[9px] font-black">KMZ</button>
                                  <button onClick={() => onExportExcluded('kml')} title="Exportar manzanas excluidas a KML" className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-[9px] font-black">KML</button>
                                  <button onClick={() => onExportExcluded('shp')} title="Exportar manzanas excluidas a Shapefile" className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded text-[9px] font-black">SHP</button>
                               </div>
                            </div>
                         </div>
                         <button onClick={() => onResetStep('PRELIMINARY')} title="Reiniciar y borrar resultados de este paso" className="w-full py-2.5 bg-neutral-800 text-[10px] font-black uppercase rounded-lg hover:bg-neutral-700"><RotateCcw size={12} className="inline mr-2"/> Reiniciar Análisis</button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PASO 1: SERVICIOS BÁSICOS */}
              <div className={`border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30 ${stepStatus.PRELIMINARY !== 'completed' ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="p-4 flex items-center justify-between bg-neutral-900/50 cursor-pointer" onClick={() => setExpandedStep('s1')} title="Abrir análisis de servicios básicos">
                  <div className="flex items-center gap-3">
                    <Lightbulb size={18} className="text-yellow-400"/>
                    <span className="text-xs font-black uppercase">Paso 1: Servicios Básicos</span>
                  </div>
                </div>
                {expandedStep === 's1' && (
                  <div className="p-4 space-y-4">
                    {stepStatus.STEP1 !== 'completed' ? (
                      <div className="space-y-4">
                        <p className="text-[10px] text-neutral-400 font-bold uppercase">Seleccione redes de servicios:</p>
                        <div className="max-h-40 overflow-y-auto custom-scrollbar border border-neutral-800 rounded-lg p-2 bg-black/40">
                          {layers.filter(l => ["Red de Electricidad", "Red de Teléfono", "Red de Alumbrado Público", "Red de Agua Potable", "Red de Alcantarillado"].includes(l.slot)).map(l => (
                            <label key={l.id} className="flex items-center gap-3 p-1.5 hover:bg-white/5 rounded cursor-pointer" title={`Usar ${l.slot} para puntuación`}>
                              <input type="checkbox" checked={selectedS1.includes(l.id)} onChange={() => setSelectedS1(p => p.includes(l.id) ? p.filter(x => x !== l.id) : [...p, l.id])} className="w-3.5 h-3.5 accent-yellow-400" />
                              <span className="text-[10px] font-bold text-neutral-400 uppercase">{l.slot}</span>
                            </label>
                          ))}
                        </div>
                        <button onClick={() => onRunStep1Analysis(selectedS1)} disabled={isAnalyzing} title="Crear zonas basadas en la cantidad de servicios disponibles" className="w-full py-3 bg-yellow-500 text-black text-xs font-black uppercase rounded-xl hover:bg-yellow-400 transition-all flex items-center justify-center gap-2">Zonificar por Servicios</button>
                      </div>
                    ) : (
                      <button onClick={() => onResetStep('STEP1')} title="Reiniciar y recalcular zonificación de servicios" className="w-full py-2.5 bg-neutral-800 text-[10px] font-black uppercase rounded-lg hover:bg-neutral-700"><RotateCcw size={12} className="inline mr-2"/> Recalcular Paso 1</button>
                    )}
                  </div>
                )}
              </div>

              {/* PASO 2: EQUIPAMIENTOS */}
              <div className={`border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30 ${stepStatus.STEP1 !== 'completed' ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="p-4 flex items-center justify-between bg-neutral-900/50 cursor-pointer" onClick={() => setExpandedStep('s2')} title="Abrir análisis de equipamientos">
                  <div className="flex items-center gap-3">
                    <Building2 size={18} className="text-purple-500"/>
                    <span className="text-xs font-black uppercase">Paso 2: Equipamientos (Buffers)</span>
                  </div>
                </div>
                {expandedStep === 's2' && (
                  <div className="p-4 space-y-4">
                    {stepStatus.STEP2 !== 'completed' ? (
                      <div className="space-y-4">
                        <p className="text-[10px] text-neutral-400 font-bold uppercase">Capas y distancias de buffer:</p>
                        <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-2">
                          {layers.filter(l => ["Salud", "Educación", "Abastecimiento", "Institucional", "Servicios"].includes(l.slot)).map(l => (
                            <div key={l.id} className="p-2.5 bg-black/40 border border-neutral-800 rounded-xl">
                              <label className="flex items-center gap-3 mb-2 cursor-pointer" title={`Calcular proximidad a ${l.slot}`}>
                                  <input type="checkbox" checked={selectedS2.includes(l.id)} onChange={() => setSelectedS2(p => p.includes(l.id) ? p.filter(x => x !== l.id) : [...p, l.id])} className="w-3.5 h-3.5 accent-purple-500" />
                                  <span className="text-[10px] font-black uppercase text-neutral-300">{l.slot}</span>
                              </label>
                              {selectedS2.includes(l.id) && (
                                <div className="flex items-center gap-2 pl-6">
                                  <Ruler size={12} className="text-purple-500"/>
                                  <input type="number" value={l.bufferDistance || 300} onChange={(e) => onUpdateLayer(l.id, { bufferDistance: parseInt(e.target.value) })} title="Distancia de influencia en metros" className="w-20 bg-neutral-900 text-[11px] font-black border border-neutral-700 rounded-lg px-2 h-7"/>
                                  <span className="text-[9px] text-neutral-500 uppercase font-black">Metros</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <button onClick={() => onRunStep2Analysis(selectedS2)} disabled={isAnalyzing} title="Aumentar puntuación según cercanía a equipamientos públicos" className="w-full py-3 bg-purple-600 text-white text-xs font-black uppercase rounded-xl hover:bg-purple-500 flex items-center justify-center gap-2 shadow-lg">Ponderar Proximidad</button>
                      </div>
                    ) : (
                      <button onClick={() => onResetStep('STEP2')} title="Reiniciar y recalcular influencia de equipamientos" className="w-full py-2.5 bg-neutral-800 text-[10px] font-black uppercase rounded-lg hover:bg-neutral-700"><RotateCcw size={12} className="inline mr-2"/> Recalcular Paso 2</button>
                    )}
                  </div>
                )}
              </div>

              {/* PASO 3: TOPOGRAFÍA */}
              <div className={`border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30 ${stepStatus.STEP2 !== 'completed' ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="p-4 flex items-center justify-between bg-neutral-900/50 cursor-pointer" onClick={() => setExpandedStep('s3')} title="Abrir análisis topográfico">
                  <div className="flex items-center gap-3">
                    <Mountain size={18} className="text-orange-500"/>
                    <span className="text-xs font-black uppercase">Paso 3: Topografía (Ajuste)</span>
                  </div>
                </div>
                {expandedStep === 's3' && (
                  <div className="p-4 space-y-4">
                    {stepStatus.STEP3 !== 'completed' ? (
                      <div className="space-y-4">
                        <p className="text-[10px] text-neutral-400 font-bold uppercase">Seleccione capas de relieve:</p>
                        <div className="max-h-40 overflow-y-auto custom-scrollbar border border-neutral-800 rounded-lg p-2 bg-black/40">
                          {layers.filter(l => l.slot.includes('Pte.') || l.slot.includes('Accidentado')).map(l => (
                            <label key={l.id} className="flex items-center gap-3 p-1.5 hover:bg-white/5 rounded cursor-pointer" title={`Penalizar según ${l.slot}`}>
                              <input type="checkbox" checked={selectedS3.includes(l.id)} onChange={() => setSelectedS3(p => p.includes(l.id) ? p.filter(x => x !== l.id) : [...p, l.id])} className="w-3.5 h-3.5 accent-orange-500" />
                              <span className="text-[10px] font-bold text-neutral-400 uppercase">{l.slot}</span>
                            </label>
                          ))}
                        </div>
                        <button onClick={() => onRunStep3Analysis(selectedS3)} disabled={isAnalyzing} title="Restar puntuación según la dificultad del relieve" className="w-full py-3 bg-orange-600 text-white text-xs font-black uppercase rounded-xl hover:bg-orange-500 flex items-center justify-center gap-2 shadow-lg">Finalizar Ajuste</button>
                      </div>
                    ) : (
                      <button onClick={() => onResetStep('STEP3')} title="Reiniciar y recalcular impacto topográfico" className="w-full py-2.5 bg-neutral-800 text-[10px] font-black uppercase rounded-lg hover:bg-neutral-700"><RotateCcw size={12} className="inline mr-2"/> Recalcular Paso 3</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'ENCUESTA' && (
            <div className="space-y-4">
               <button onClick={onAddSurveyZone} title="Crear un nuevo contenedor para datos de encuestas" className="w-full py-3 border border-dashed border-[#06b6d4] text-[#06b6d4] rounded-xl font-black uppercase text-xs hover:bg-[#06b6d4]/10 transition-colors shadow-sm">+ Nueva Zona de Valuación</button>
               {surveyZones.map(zone => (
                 <div key={zone.id} className="p-4 border border-neutral-800 bg-neutral-900/20 rounded-xl space-y-3 shadow-md">
                    <div className="flex justify-between items-center">
                       <span className="font-black uppercase text-xs">{zone.name}</span>
                       <button onClick={() => onRemoveSurveyZone(zone.id)} title="Eliminar zona de valuación" className="text-red-500 hover:bg-red-500/10 p-1 rounded transition-colors"><Trash2 size={14}/></button>
                    </div>
                    {!zone.extractedData ? (
                      <div className="space-y-2">
                        <p className="text-[10px] text-neutral-500 uppercase font-black">Excel de Valuación (Form. 1):</p>
                        <input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files && onUploadSurveyFile(zone.id, e.target.files[0])} title="Subir el Formulario 1 extraído de encuestas" className="text-[10px] text-neutral-400 file:bg-neutral-800 file:text-white file:border-none file:rounded-md file:px-2 file:py-1 cursor-pointer"/>
                      </div>
                    ) : (
                      <div className="space-y-2 bg-black/40 p-3 rounded-xl">
                         <div className="flex justify-between text-[11px] font-black uppercase"><span className="text-neutral-500">Registros:</span><span className="text-[#06b6d4]">{zone.extractedData.length}</span></div>
                         <div className="flex justify-between text-[11px] font-black uppercase"><span className="text-neutral-500">Valor Promedio:</span><span className="text-[#06b6d4]">Bs. {calculateStatistics(zone.extractedData).mean.toFixed(2)}</span></div>
                         <button className="w-full py-2 bg-[#06b6d4] text-black text-[10px] font-black uppercase rounded-lg mt-2 hover:bg-[#0891b2] transition-colors" title="Descargar reporte Excel con el resumen de valuación"><FileSpreadsheet size={12} className="inline mr-1.5"/> Descargar Resumen</button>
                      </div>
                    )}
                 </div>
               ))}
            </div>
          )}

          {activeTab === 'ZONAS' && (
            <div className="space-y-3">
              {zoningResults.length === 0 ? (
                <div className="text-center py-24 opacity-30"><Database size={54} className="mx-auto mb-4"/><p className="text-xs font-black uppercase tracking-widest">Sin resultados de zonificación.</p></div>
              ) : (
                zoningResults.map((zone, idx) => (
                  <div key={idx} className="bg-neutral-900/40 border border-neutral-800 rounded-xl p-4 space-y-3 shadow-md">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3"><div className="w-3.5 h-3.5 rounded-full shadow-sm" style={{ backgroundColor: zone.color }} /><span className="font-black uppercase text-sm">{zone.zoneName}</span></div>
                      <button onClick={() => onToggleZoneVisibility(idx)} title={zone.visible ? "Ocultar zona en el mapa" : "Mostrar zona en el mapa"} className={`p-1.5 rounded-lg ${zone.visible ? 'text-[#74B72E]' : 'text-neutral-600'}`}>{zone.visible ? <Eye size={18}/> : <EyeOff size={18}/>}</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                       <button onClick={() => onExportZone(zone, 'kmz')} title={`Descargar ${zone.zoneName} en formato KMZ`} className="py-2 bg-neutral-800 text-[10px] font-black uppercase rounded-xl hover:bg-neutral-700 transition-colors flex items-center justify-center gap-1.5"><Download size={14}/> KMZ</button>
                       <button onClick={() => onExportZone(zone, 'pdf')} title={`Descargar plano PDF de ${zone.zoneName}`} className="py-2 bg-neutral-800 text-[10px] font-black uppercase rounded-xl hover:bg-neutral-700 transition-colors flex items-center justify-center gap-1.5"><FileText size={14}/> PDF</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
