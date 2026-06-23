import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, MapPin, Clock, Users, Shield, AlertTriangle, TrendingUp, Route } from 'lucide-react';

const API_BASE = 'https://gridlock-guard-9.onrender.com';

export default function GridLockGuardUI() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const layersRef = useRef([]);  // ✅ Track all non-tile layers for proper cleanup
  const [eventData, setEventData] = useState({
    eventType: 'unplanned',
    eventCause: 'accident',
    location: 'Mysore Road',
    latitude: 12.9716,
    longitude: 77.6412,
    corridor: 'Mysore Road',
    zone: 'South Zone 1',
    startDateTime: '2026-06-22T08:00',
    endDateTime: '2026-06-22T09:30',
    vehicleType: 'truck',
    priority: 'High',
  });

  const [predictions, setPredictions] = useState(null);
  const [activeTab, setActiveTab] = useState('input');
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filterOptions, setFilterOptions] = useState({
    causes: [],
    corridors: [],
    zones: [],
    vehicles: []
  });
  const [filteredLocations, setFilteredLocations] = useState([]);

  // Load Leaflet
  useEffect(() => {
    if (!leafletLoaded) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      script.onload = () => setLeafletLoaded(true);
      document.head.appendChild(script);
    }
  }, []);

  // Load filter options from backend
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [causes, corridors, zones, vehicles] = await Promise.all([
          fetch(`${API_BASE}/prediction/causes`).then(r => r.json()),
          fetch(`${API_BASE}/prediction/corridors`).then(r => r.json()),
          fetch(`${API_BASE}/prediction/zones`).then(r => r.json()),
          fetch(`${API_BASE}/prediction/vehicles`).then(r => r.json()),
        ]);
        setFilterOptions({ causes, corridors, zones, vehicles });
        console.log('[SUCCESS] Filter options loaded from backend');
      } catch (err) {
        console.error('[ERROR] Failed to load filter options:', err);
      }
    };
    loadFilterOptions();
  }, []);

  // Load addresses when corridor or zone changes
  useEffect(() => {
    const loadAddresses = async () => {
      if (eventData.corridor && eventData.zone) {
        try {
          const response = await fetch(
            `${API_BASE}/prediction/addresses?corridor=${encodeURIComponent(eventData.corridor)}&zone=${encodeURIComponent(eventData.zone)}`
          );
          const addresses = await response.json();
          setFilteredLocations(addresses || []);
          console.log(`[SUCCESS] Loaded ${addresses.length} addresses for ${eventData.corridor} - ${eventData.zone}`);
        } catch (err) {
          console.error('[ERROR] Failed to load addresses:', err);
          setFilteredLocations([]);
        }
      }
    };
    loadAddresses();
  }, [eventData.corridor, eventData.zone]);

  // Initialize Map
  useEffect(() => {
    if (leafletLoaded && mapContainer.current && !map.current) {
      try {
        const L = window.L;
        if (!L) {
          console.error('[ERROR] Leaflet library not loaded');
          return;
        }
        
        console.log('[INFO] Initializing map...');
        map.current = L.map(mapContainer.current, {
          center: [12.9716, 77.6412],
          zoom: 13,
        });
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map.current);
        
        // Force map to recalculate size
        setTimeout(() => {
          if (map.current) {
            map.current.invalidateSize();
            console.log('[SUCCESS] Map initialized and rendered');
          }
        }, 100);
      } catch (err) {
        console.error('[ERROR] Failed to initialize map:', err);
      }
    }
  }, [leafletLoaded]);

  useEffect(() => {
  if (activeTab === 'map' && map.current) {
    setTimeout(() => {
      map.current.invalidateSize();
      map.current.setView(
        [eventData.latitude, eventData.longitude],
        13
      );
    }, 300);
  }
}, [activeTab, eventData.latitude, eventData.longitude]);

useEffect(() => {
  console.log("MAP EFFECT RUNNING");
  console.log("activeTab =", activeTab);
  console.log("predictions =", predictions);

  if (!map.current) {
    console.log("map.current is NULL");
    return;
  }

  if (activeTab !== "map") {
    console.log("MAP TAB NOT ACTIVE");
    return;
  }

  console.log("DRAWING MAP");
}, [predictions, leafletLoaded, eventData, activeTab]);

  // Update map when predictions change or on initial load
  useEffect(() => {
    if (!map.current || !leafletLoaded) return;
    if (activeTab !== 'map') return;

    const L = window.L;
    
    // ✅ Clean clear using tracked layers ref - prevents ghosts/duplicates
    layersRef.current.forEach(layer => {
      try { map.current.removeLayer(layer); } catch(e) {}
    });
    layersRef.current = [];

    // Helper to track and add layers
    const addLayer = (layer) => {
      layer.addTo(map.current);
      layersRef.current.push(layer);
      return layer;
    };

      // Always add incident marker
      addLayer(
        L.circleMarker([eventData.latitude, eventData.longitude], {
          radius: 8,
          fillColor: '#ff0000',
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8,
        })
          .bindPopup(`<b>Incident Location</b><br/>${eventData.location}`)
      );

      // Add prediction-based elements only if predictions exist
      if (predictions) {
        // Add affected radius
        const radiusColor = 
          predictions.severity >= 75 ? '#dc2626' :
          predictions.severity >= 50 ? '#ea580c' :
          predictions.severity >= 25 ? '#eab308' : '#22c55e';

        addLayer(
          L.circle([eventData.latitude, eventData.longitude], {
            radius: predictions.affectedRadius * 1000,
            color: radiusColor,
            fillColor: radiusColor,
            fillOpacity: 0.2,
            weight: 2,
            dashArray: '5, 5',
          })
            .bindPopup(`<b>Affected Radius</b><br/>${predictions.affectedRadius.toFixed(2)} km`)
        );

        // ✅ FIX: Barricades at strategic entry points with exact coordinates
        const barricadeCount = Math.min(predictions.barricadesNeeded, 8);
        const barricadePositions = [];
        
        // Place barricades at cardinal/intercardinal directions (N, NE, E, SE, S, SW, W, NW)
        const directions = [
          { angle: 0, label: 'North' },
          { angle: Math.PI / 4, label: 'Northeast' },
          { angle: Math.PI / 2, label: 'East' },
          { angle: (3 * Math.PI) / 4, label: 'Southeast' },
          { angle: Math.PI, label: 'South' },
          { angle: (-3 * Math.PI) / 4, label: 'Southwest' },
          { angle: -Math.PI / 2, label: 'West' },
          { angle: -Math.PI / 4, label: 'Northwest' },
        ];

        for (let i = 0; i < barricadeCount; i++) {
          const direction = directions[i];
          const distance = predictions.affectedRadius * 0.85; // Place at edge of affected radius
          
          const barLat = eventData.latitude + (distance / 111) * Math.cos(direction.angle);
          const barLon = eventData.longitude + (distance / 111) * Math.sin(direction.angle);
          
          barricadePositions.push({
            number: i + 1,
            lat: barLat,
            lon: barLon,
            direction: direction.label,
            distance: distance.toFixed(2)
          });

          // Add marker with visible number label
          addLayer(
            L.marker([barLat, barLon], {
              icon: L.divIcon({
                className: 'barricade-icon',
                html: `<div style="background: #fbbf24; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #000; border: 2px solid #d97706; box-shadow: 0 0 10px rgba(251, 191, 36, 0.7); font-size: 13px; text-align: center;">B${i + 1}</div>`,
              }),
            })
              .bindPopup(
                `<b style="font-size: 14px; color: #d97706;">Barricade ${i + 1}</b><br/>
                 <hr style="margin: 6px 0; border: none; border-top: 1px solid #ddd;"/>
                 <b>Direction:</b> ${direction.label}<br/>
                 <b>Latitude:</b> <code>${barLat.toFixed(6)}</code><br/>
                 <b>Longitude:</b> <code>${barLon.toFixed(6)}</code><br/>
                 <b>Distance:</b> ${distance.toFixed(2)} km`
              )
          );
        }

        // Store barricade positions for sidebar display
        window.currentBarricades = barricadePositions;

        // ✅ FIX 2: Alternate routes as DOTS from predictions.alternateRoutes strings
        const routeColors = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899'];
        const routeDirections = [
          { dLat: -0.025, dLon: 0.05 },   // Southeast
          { dLat: 0.03,  dLon: -0.035 },  // Northwest
          { dLat: -0.04, dLon: -0.02 },   // Southwest
          { dLat: 0.04,  dLon: 0.03 },    // Northeast
          { dLat: 0.01, dLon: 0.06 },     // East
        ];

        // Accurate alternate-route markers
const routeOffsets = [
  { lat: 0.02, lon: 0.03 },
  { lat: -0.02, lon: 0.04 },
  { lat: 0.03, lon: -0.02 }
];




      predictions.alternateRoutes.forEach((routeName, idx) => {

  const offset = routeOffsets[idx % routeOffsets.length];

  const coords = [
    eventData.latitude + offset.lat,
    eventData.longitude + offset.lon
  ];

  addLayer(
    L.marker(coords, {
      icon: L.divIcon({
        className: '',
        html: `
          <div style="
            font-size:32px;
            color:#3b82f6;
          ">
            ➤
          </div>
        `,
        iconSize:[32,32]
      })
    }).bindPopup(routeName)
  );
});}

      map.current.setView([eventData.latitude, eventData.longitude], 13);
      map.current.invalidateSize();
  }, [predictions, leafletLoaded, eventData, activeTab]);

  // ============================================================================
  // FIXED: Call real backend prediction endpoint
  // ============================================================================
  const predictCongestion = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('[INFO] Calling backend prediction endpoint...');
      
      const response = await fetch(`${API_BASE}/prediction/predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_cause: eventData.eventCause,
          corridor: eventData.corridor,
          zone: eventData.zone,
          vehicle_type: eventData.vehicleType,
          priority: eventData.priority,
          start_datetime: eventData.startDateTime,
          end_datetime: eventData.endDateTime,
          requires_road_closure: false
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('[SUCCESS] Prediction received:', data);

      // Map backend response to UI format
      setPredictions({
        severity: data.severity_score,
        severityLevel: data.severity_level,
        closureRequired: data.will_require_closure,
        affectedRadius: data.affected_radius_km,
        trafficDuration: data.traffic_duration_min,
        vehiclesToDeploy: data.vehicles_to_deploy,
        barricadesNeeded: data.barricades_needed,
        officersRequired: data.officers_required,
        confidence: data.confidence,
        affectedRoads: data.affected_roads,
        alternateRoutes: data.alternate_routes,
        delayEstimate: data.delay_estimate,
        recommendations: data.recommendations
      });
      setActiveTab('dashboard');
    } catch (error) {
      console.error('[ERROR]', error);
      setError({
        title: '⚠️ Backend Error',
        message: error.message,
        details: 'Make sure backend is running: python fastapi_prediction_backend.py'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: '#0f172a',
      color: '#e2e8f0',
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '24px',
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          marginBottom: '32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '2px solid #334155',
          paddingBottom: '16px'
        }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 'bold' }}>🚨 GridLock Guard</h1>
            <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '14px' }}>Real-time Traffic Prediction Engine</p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setActiveTab('input')}
              style={{
                padding: '8px 16px',
                background: activeTab === 'input' ? '#3b82f6' : '#1e293b',
                border: `2px solid ${activeTab === 'input' ? '#3b82f6' : '#334155'}`,
                color: '#fff',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              📝 Input
            </button>
            <button
              onClick={() => setActiveTab('dashboard')}
              disabled={!predictions}
              style={{
                padding: '8px 16px',
                background: activeTab === 'dashboard' ? '#3b82f6' : '#1e293b',
                border: `2px solid ${activeTab === 'dashboard' ? '#3b82f6' : '#334155'}`,
                color: '#fff',
                borderRadius: '6px',
                cursor: predictions ? 'pointer' : 'not-allowed',
                fontWeight: '600',
                opacity: predictions ? 1 : 0.5
              }}
            >
              📊 Dashboard
            </button>
            <button
              onClick={() => setActiveTab('map')}
              disabled={!predictions}
              style={{
                padding: '8px 16px',
                background: activeTab === 'map' ? '#3b82f6' : '#1e293b',
                border: `2px solid ${activeTab === 'map' ? '#3b82f6' : '#334155'}`,
                color: '#fff',
                borderRadius: '6px',
                cursor: predictions ? 'pointer' : 'not-allowed',
                fontWeight: '600',
                opacity: predictions ? 1 : 0.5
              }}
            >
              🗺️ Map
            </button>
          </div>
        </div>

        {/* INPUT TAB */}
        {activeTab === 'input' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '16px',
            marginBottom: '32px'
          }}>
            {/* Event Type */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#cbd5e1' }}>Event Type</label>
              <select
                value={eventData.eventType}
                onChange={(e) => setEventData({...eventData, eventType: e.target.value})}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  cursor: 'pointer'
                }}
              >
                <option value="planned">Planned</option>
                <option value="unplanned">Unplanned</option>
              </select>
            </div>

            {/* Event Cause */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#cbd5e1' }}>Event Cause</label>
              <select
                value={eventData.eventCause}
                onChange={(e) => setEventData({...eventData, eventCause: e.target.value})}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  cursor: 'pointer'
                }}
              >
                {filterOptions.causes.map(cause => (
                  <option key={cause} value={cause}>{cause.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            {/* Corridor */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#cbd5e1' }}>Corridor</label>
              <select
                value={eventData.corridor}
                onChange={(e) => {
  setEventData(prev => ({
    ...prev,
    corridor: e.target.value,
    location: '',
    latitude: 0,
    longitude: 0
  }));
}}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  cursor: 'pointer'
                }}
              >
                {filterOptions.corridors.map(corridor => (
                  <option key={corridor} value={corridor}>{corridor}</option>
                ))}
              </select>
            </div>

            {/* Zone */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#cbd5e1' }}>Zone</label>
              <select
                value={eventData.zone}
                onChange={(e) => setEventData({...eventData, zone: e.target.value})}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  cursor: 'pointer'
                }}
              >
                {filterOptions.zones.map(zone => (
                  <option key={zone} value={zone}>{zone}</option>
                ))}
              </select>
            </div>

            {/* Vehicle Type */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#cbd5e1' }}>Vehicle Type</label>
              <select
                value={eventData.vehicleType}
                onChange={(e) => setEventData({...eventData, vehicleType: e.target.value})}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  cursor: 'pointer'
                }}
              >
                {filterOptions.vehicles.map(vehicle => (
                  <option key={vehicle} value={vehicle}>{vehicle.replace('_', ' ')}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#cbd5e1' }}>Priority</label>
              <select
                value={eventData.priority}
                onChange={(e) => setEventData({...eventData, priority: e.target.value})}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  cursor: 'pointer'
                }}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>

            {/* Start DateTime */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#cbd5e1' }}>Start Time</label>
              <input
                type="datetime-local"
                value={eventData.startDateTime}
                onChange={(e) => setEventData({...eventData, startDateTime: e.target.value})}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0'
                }}
              />
            </div>

            {/* End DateTime */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#cbd5e1' }}>End Time</label>
              <input
                type="datetime-local"
                value={eventData.endDateTime}
                onChange={(e) => setEventData({...eventData, endDateTime: e.target.value})}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0'
                }}
              />
            </div>

            {/* Location */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#cbd5e1' }}>Location</label>
              <select
                value={eventData.location}
               onChange={(e) => {
  const selectedAddress = filteredLocations.find(
    item => item.address === e.target.value
  );

  if (selectedAddress) {
    setEventData(prev => ({
      ...prev,
      location: selectedAddress.address,
      latitude: selectedAddress.latitude,
      longitude: selectedAddress.longitude
    }));

    console.log(
      "Address selected:",
      selectedAddress.address,
      selectedAddress.latitude,
      selectedAddress.longitude
    );
  }
}}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#e2e8f0',
                  maxHeight: '300px',
                  overflowY: 'auto'
                }}
              >
                <option value="">-- Select Location --</option>
                {filteredLocations.map((loc, idx) => (
                  <option key={idx} value={loc.address}>
                    {loc.address}
                  </option>
                ))}
              </select>
            </div>

            {/* Latitude */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#cbd5e1' }}>Latitude</label>
              <div
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#cbd5e1',
                  fontFamily: 'monospace',
                  fontSize: '14px'
                }}
              >
                {eventData.latitude.toFixed(6)}
              </div>
            </div>

            {/* Longitude */}
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', color: '#cbd5e1' }}>Longitude</label>
              <div
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  color: '#cbd5e1',
                  fontFamily: 'monospace',
                  fontSize: '14px'
                }}
              >
                {eventData.longitude.toFixed(6)}
              </div>
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {error && (
          <div style={{
            background: '#7f1d1d',
            border: '2px solid #dc2626',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '24px',
            color: '#fecaca'
          }}>
            <p style={{ margin: '0 0 8px', fontWeight: 'bold' }}>{error.title}</p>
            <p style={{ margin: '0 0 4px' }}>{error.message}</p>
            <p style={{ margin: 0, fontSize: '12px', opacity: 0.8 }}>{error.details}</p>
          </div>
        )}

        {/* PREDICT BUTTON */}
        {activeTab === 'input' && (
          <button
            onClick={predictCongestion}
            disabled={loading}
            style={{
              padding: '14px 28px',
              background: loading ? '#475569' : '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginBottom: '32px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}
          >
            {loading ? '⏳ Predicting...' : '🚀 Predict Congestion'}
          </button>
        )}

        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && predictions && (
          <div>
            {/* Severity Overview */}
            <div style={{
              background: predictions.severity >= 75 ? 'rgba(220, 38, 38, 0.1)' :
                          predictions.severity >= 50 ? 'rgba(234, 88, 12, 0.1)' :
                          predictions.severity >= 25 ? 'rgba(234, 179, 8, 0.1)' :
                          'rgba(34, 197, 94, 0.1)',
              border: `2px solid ${
                predictions.severity >= 75 ? '#dc2626' :
                predictions.severity >= 50 ? '#ea580c' :
                predictions.severity >= 25 ? '#eab308' : '#22c55e'
              }`,
              padding: '24px',
              borderRadius: '8px',
              marginBottom: '24px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <div>
                  <div style={{ fontSize: '48px', fontWeight: 'bold', color: 
                    predictions.severity >= 75 ? '#dc2626' :
                    predictions.severity >= 50 ? '#ea580c' :
                    predictions.severity >= 25 ? '#eab308' : '#22c55e'
                  }}>
                    {predictions.severity}
                  </div>
                  <p style={{ margin: '4px 0 0', color: '#cbd5e1', fontSize: '12px' }}>Severity Score</p>
                </div>
                <div style={{ flex: 1 }}>
                  <h2 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>
                    {predictions.severityLevel} ALERT
                  </h2>
                  <p style={{ margin: 0, color: '#cbd5e1', fontSize: '14px', lineHeight: '1.6' }}>
                    {predictions.severityLevel === 'CRITICAL' ? 'Severe congestion expected. Consider full road closure. Emergency protocols recommended.' :
                     predictions.severityLevel === 'HIGH' ? 'Heavy traffic expected. Priority traffic control needed.' :
                     predictions.severityLevel === 'MEDIUM' ? 'Moderate slowdown expected. Standard traffic management.' :
                     'Minor impact expected. Routine monitoring sufficient.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}>
              {[
                { icon: '🛣️', label: 'Affected Radius', value: `${predictions.affectedRadius.toFixed(2)} km`, color: '#3b82f6' },
                { icon: '⏱️', label: 'Traffic Duration', value: `${predictions.trafficDuration} min`, color: '#f97316' },
                { icon: '🚗', label: 'Vehicles Needed', value: predictions.vehiclesToDeploy, color: '#8b5cf6' },
                { icon: '🚧', label: 'Barricades', value: predictions.barricadesNeeded, color: '#eab308' },
                { icon: '👮', label: 'Officers Required', value: predictions.officersRequired, color: '#06b6d4' },
                { icon: '✅', label: 'Confidence', value: `${predictions.confidence}%`, color: '#22c55e' },
              ].map((metric, i) => (
                <div
                  key={i}
                  style={{
                    background: '#1e293b',
                    padding: '16px',
                    borderRadius: '8px',
                    border: `1px solid ${metric.color}33`,
                  }}
                >
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>{metric.icon}</div>
                  <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>{metric.label}</p>
                  <p style={{ margin: '4px 0 0', fontSize: '18px', fontWeight: 'bold', color: metric.color }}>
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Affected Roads & Routes */}
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '24px',
            }}>
              {/* Affected Roads */}
              <div style={{
                background: '#1e293b',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #334155',
              }}>
                <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🛣️ Affected Roads
                </h3>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {predictions.affectedRoads.map((road, i) => (
                    <li key={i} style={{ color: '#cbd5e1', fontSize: '13px', marginBottom: '6px' }}>
                      {road}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Alternate Routes */}
              <div style={{
                background: '#1e293b',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #334155',
              }}>
                <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🛤️ Alternate Routes
                </h3>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {predictions.alternateRoutes.map((route, i) => (
                    <li key={i} style={{ color: '#cbd5e1', fontSize: '13px', marginBottom: '6px' }}>
                      {route}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Road Closure & Delay */}
            <div style={{ 
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '24px',
            }}>
              <div style={{
                background: predictions.closureRequired ? '#dc2626' : '#22c55e',
                padding: '16px',
                borderRadius: '8px',
              }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#fff', opacity: 0.9 }}>Road Closure Required</p>
                <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>
                  {predictions.closureRequired ? '🔴 YES' : '🟢 NO'}
                </p>
              </div>
              <div style={{
                background: '#3b82f6',
                padding: '16px',
                borderRadius: '8px',
              }}>
                <p style={{ margin: 0, fontSize: '12px', color: '#fff', opacity: 0.9 }}>Expected Commuter Delay</p>
                <p style={{ margin: '4px 0 0', fontSize: '20px', fontWeight: 'bold', color: '#fff' }}>
                  {predictions.delayEstimate}
                </p>
              </div>
            </div>

            {/* Recommendations */}
            {predictions.recommendations && predictions.recommendations.length > 0 && (
              <div style={{
                background: '#1e293b',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #334155',
              }}>
                <h3 style={{ margin: '0 0 12px' }}>📋 Recommendations</h3>
                <ul style={{ margin: 0, paddingLeft: '20px' }}>
                  {predictions.recommendations.map((rec, i) => (
                    <li key={i} style={{ color: '#cbd5e1', fontSize: '13px', marginBottom: '6px' }}>
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* MAP TAB */}
        <div
  style={{
    display: activeTab === 'map' ? 'block' : 'none'
  }}
></div>
          <div>
            <div style={{
              background: '#1e293b',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid #334155',
              marginBottom: '16px',
            }}>
              <div
                ref={mapContainer}
                style={{
                  width: '100%',
                  height: '600px',
                  background: '#0f172a',
                }}
              />
            </div>

            <div style={{
              background: '#1e293b',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #334155',
              marginBottom: '16px',
            }}>
              <h3 style={{ margin: '0 0 12px' }}>Map Legend</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', fontSize: '13px' }}>
                <div><span style={{ color: '#ff0000' }}>● </span>Incident Location</div>
                <div><span style={{ color: '#dc2626' }}>⊚ </span>Affected Radius</div>
                <div><span style={{ color: '#fbbf24' }}>● </span>Barricade Locations</div>
                <div><span style={{ color: '#3b82f6', fontSize: '18px' }}>➤ </span>Alternate Routes</div>
              </div>
            </div>

            {/* Barricade Locations Table */}
            {predictions && window.currentBarricades && window.currentBarricades.length > 0 && (
              <div style={{
                background: '#1e293b',
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #334155',
                overflowX: 'auto',
              }}>
                <h3 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🚧 Barricade Locations & Coordinates
                </h3>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                  color: '#cbd5e1',
                }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #334155' }}>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold', color: '#fbbf24' }}>Bar.</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold', color: '#fbbf24' }}>Direction</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold', color: '#fbbf24' }}>Latitude</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold', color: '#fbbf24' }}>Longitude</th>
                      <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold', color: '#fbbf24' }}>Distance (km)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {window.currentBarricades.map((bar, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #334155', backgroundColor: idx % 2 === 0 ? '#0f172a' : '#1e293b' }}>
                        <td style={{ padding: '8px', fontWeight: 'bold', color: '#fbbf24' }}>B{bar.number}</td>
                        <td style={{ padding: '8px' }}>{bar.direction}</td>
                        <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '11px' }}>{bar.lat.toFixed(6)}</td>
                        <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '11px' }}>{bar.lon.toFixed(6)}</td>
                        <td style={{ padding: '8px' }}>{bar.distance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        
      </div>
    </div>
  );
}