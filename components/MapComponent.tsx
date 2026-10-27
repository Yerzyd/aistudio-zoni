
import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents, Marker } from 'react-leaflet';
import L from 'leaflet';
import { Layers, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Home, Plus, Minus } from 'lucide-react';
import { LayerData, ZoningResult, TabType, SamplingValidationResult } from '../types';
import { Feature } from 'geojson';
import * as turf from '@turf/turf';

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface MapComponentProps {
  layers: LayerData[];
  zoningResults?: ZoningResult[];
  excludedManzanas?: Feature[];
  excludedVisible?: boolean;
  excludedOpacity?: number;
  validManzanas?: Feature[];
  validVisible?: boolean;
  validOpacity?: number;
  samplingValidationResults?: SamplingValidationResult[];
  activeTab?: TabType;
}

const SVGPatterns = () => (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
            <pattern id="diagonal-hatch-brown" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                <rect width="8" height="8" fill="#F5F5DC" opacity="0.5"/>
                <line x1="0" y1="0" x2="0" y2="8" stroke="#8B4513" strokeWidth="2" />
            </pattern>
            <pattern id="vertical-hatch-black" patternUnits="userSpaceOnUse" width="6" height="6">
                <rect width="6" height="6" fill="#FFA500" opacity="0.6"/>
                <line x1="0" y1="0" x2="0" y2="6" stroke="black" strokeWidth="1" />
            </pattern>
            <pattern id="horizontal-hatch-black" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(90)">
                <rect width="6" height="6" fill="#EE82EE" opacity="0.6"/>
                <line x1="0" y1="0" x2="0" y2="6" stroke="black" strokeWidth="1" />
            </pattern>
            <pattern id="error-hatch" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="10" stroke="red" strokeWidth="3" />
            </pattern>
        </defs>
    </svg>
);

const BASE_MAPS = {
  dark: { name: 'Oscuro', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; CARTO' },
  osm: { name: 'OSM', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap' },
  satellite: { name: 'Satélite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri' },
  topo: { name: 'Topográfico', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenTopoMap' }
};

type BaseMapType = keyof typeof BASE_MAPS;

const MapBoundsFitter: React.FC<{ layers: LayerData[] }> = ({ layers }) => {
  const map = useMap();
  useEffect(() => {
    const vectorLayers = layers.filter(l => l.visible);
    if (vectorLayers.length === 0) return;
    try {
      const group = L.featureGroup();
      vectorLayers.forEach(layer => {
        const geoJsonLayer = L.geoJSON(layer.data);
        if (geoJsonLayer.getLayers().length > 0) group.addLayer(geoJsonLayer);
      });
      if (group.getLayers().length > 0) map.fitBounds(group.getBounds(), { padding: [50, 50] });
    } catch (e) {}
  }, [layers, map]);
  return null;
};

const LayerLabels: React.FC<{ layers: LayerData[] }> = ({ layers }) => {
    const map = useMap();
    const [zoom, setZoom] = useState(map.getZoom());
    useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
    const renderLabels = useMemo(() => {
        if (zoom < 14) return null;
        const labels: React.ReactNode[] = [];
        layers.forEach(layer => {
            if (!layer.visible || !layer.showLabels) return;
            layer.data.features.forEach((feature: any, idx) => {
                if (!feature.geometry || !feature.properties) return;
                const labelValue = feature.properties.CODIGO || feature.properties.codigo || feature.properties.manzana || feature.properties.NOMBRE;
                if (!labelValue) return;
                let position: L.LatLngExpression | null = null;
                try {
                    const centroid = turf.centroid(feature);
                    position = [centroid.geometry.coordinates[1], centroid.geometry.coordinates[0]];
                } catch (e) { return; }
                if (position) {
                    const divIcon = L.divIcon({
                        className: 'bg-transparent',
                        html: `<div style="color: #FFFF6A; font-weight: 800; font-size: ${zoom - 2}px; text-shadow: 2px 2px 2px #000; white-space: nowrap; transform: translate(-50%, -50%); pointer-events: none;">${labelValue}</div>`
                    });
                    labels.push(<Marker key={`${layer.id}-l-${idx}`} position={position} icon={divIcon} interactive={false} />);
                }
            });
        });
        return labels;
    }, [layers, zoom]);
    return <>{renderLabels}</>;
};

const MapComponentInternal: React.FC<MapComponentProps> = ({ layers, zoningResults, excludedManzanas, excludedVisible, excludedOpacity, validManzanas, validVisible, validOpacity, samplingValidationResults, activeTab }) => {
  const [currentBaseMap, setCurrentBaseMap] = useState<BaseMapType>('dark');
  const [isLayerMenuOpen, setIsLayerMenuOpen] = useState(false);
  const svgRenderer = useMemo(() => L.svg({ padding: 0.5 }), []);

  const renderLayers = useMemo(() => {
      const zoningLayers = (zoningResults || []).map((zone, idx) => {
          if (!zone.visible || zone.features.features.length === 0) return null;
          return <GeoJSON key={`z-${idx}`} data={zone.features as any} style={{ color: zone.color, fillColor: zone.color, weight: 2, fillOpacity: 0.6 }} onEachFeature={(f, l) => l.bindPopup(`<div class="text-sm font-bold">${zone.zoneName}</div><div class="text-xs">Puntuación: ${f.properties.zoning_score}</div>`)} />;
      });

      const standardLayers = layers.map((layer) => {
          if (activeTab === 'PREDIOS' && !layer.samplingType) return null;
          if (activeTab !== 'PREDIOS' && layer.samplingType) return null;
          if (!layer.visible) return null;

          const visibleFeatures = layer.data.features.filter(f => {
              if (!f.geometry) return false;
              const t = f.geometry.type;
              if (t.includes('Point')) return layer.visiblePoint;
              if (t.includes('Line')) return layer.visibleLine;
              if (t.includes('Polygon')) return layer.visiblePolygon;
              return true;
          });

          if (visibleFeatures.length === 0) return null;

          return (
              <React.Fragment key={layer.id}>
                  {layer.bufferData && layer.bufferVisible && <GeoJSON data={layer.bufferData as any} style={{ color: '#ef4444', fillOpacity: 0.1, weight: 1, dashArray: '5,5' }} />}
                  <GeoJSON 
                    data={{ type: 'FeatureCollection', features: visibleFeatures } as any} 
                    style={() => ({ color: layer.color, weight: 2, fillOpacity: layer.opacity })}
                    onEachFeature={(f, l) => {
                        if (f.properties) {
                            const p = Object.entries(f.properties).slice(0, 10).map(([k, v]) => `<div class="mb-0.5"><strong class="text-[#FE8330]">${k}:</strong> <span class="text-neutral-200">${v}</span></div>`).join('');
                            l.bindPopup(`<div class="text-[12px] p-1 font-sans">${p}</div>`, { maxWidth: 260 });
                        }
                    }}
                  />
              </React.Fragment>
          );
      });

      return [...zoningLayers, ...standardLayers];
  }, [layers, zoningResults, activeTab]);

  const renderAnalysisOverlays = useMemo(() => {
      if (activeTab !== 'ANALISIS') return null;
      const overlays = [];
      
      if (excludedManzanas && excludedManzanas.length > 0 && excludedVisible) {
          overlays.push(
              <GeoJSON 
                key="excl" 
                data={{ type: 'FeatureCollection', features: excludedManzanas } as any} 
                style={{ color: '#000000', weight: 1.5, fillColor: '#333', fillOpacity: excludedOpacity }} 
                onEachFeature={(f, l) => l.bindPopup(`<div class="text-sm font-black text-red-500 uppercase mb-1">Manzana Excluida</div><div class="text-xs text-neutral-300">Causa: ${f.properties.exclusion_reason}</div>`)}
              />
          );
      }

      if (validManzanas && validManzanas.length > 0 && validVisible) {
          overlays.push(
            <GeoJSON 
                key="valid" 
                data={{ type: 'FeatureCollection', features: validManzanas } as any} 
                style={{ color: '#22c55e', weight: 2.5, fillColor: '#22c55e', fillOpacity: validOpacity }} 
                onEachFeature={(f, l) => l.bindPopup(`<div class="text-sm font-black text-green-500 uppercase">Manzana Apta</div>`)}
            />
          );
      }

      return overlays;
  }, [excludedManzanas, excludedVisible, excludedOpacity, validManzanas, validVisible, validOpacity, activeTab]);

  return (
    <div className="h-full w-full bg-black relative">
      <SVGPatterns />
      <MapContainer center={[-16.5, -68.1]} zoom={12} className="h-full w-full z-0" preferCanvas={true} zoomControl={false}>
        <TileLayer attribution={BASE_MAPS[currentBaseMap].attribution} url={BASE_MAPS[currentBaseMap].url} />
        {renderLayers}
        {renderAnalysisOverlays}
        <LayerLabels layers={layers} />
        <MapBoundsFitter layers={layers} />
      </MapContainer>
      <div className="absolute top-4 right-4 z-[400] flex flex-col items-end gap-3">
        <button onClick={() => setIsLayerMenuOpen(!isLayerMenuOpen)} title="Cambiar el estilo del mapa base" className="bg-neutral-800 text-neutral-200 p-3 rounded-xl border border-neutral-700 shadow-2xl transition-transform active:scale-95"><Layers size={24} /></button>
        {isLayerMenuOpen && (
          <div className="bg-neutral-800 rounded-2xl shadow-2xl border border-neutral-700 overflow-hidden flex flex-col min-w-[140px]">
            {(Object.keys(BASE_MAPS) as BaseMapType[]).map((k) => (
              <button key={k} onClick={() => { setCurrentBaseMap(k); setIsLayerMenuOpen(false); }} className={`px-5 py-3 text-sm font-bold transition-colors hover:bg-neutral-700 text-left ${currentBaseMap === k ? 'text-[#FFFF6A] bg-neutral-900' : 'text-neutral-300'}`}>{BASE_MAPS[k].name}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const MapComponent = React.memo(MapComponentInternal);
