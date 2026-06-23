import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';
import GridLockGuardUI from './gridlock_guard_ui.jsx';

const API_BASE = 'https://gridlock-guard-3.onrender.com';

// Fix Leaflet icon issue
if (L.Icon.Default.prototype._getIconUrl) {
  delete L.Icon.Default.prototype._getIconUrl;
}
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

console.log('[INFO] App.jsx loaded, Leaflet version:', L.version);

function HistoricalView() {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const heatmapRef = useRef(null);

  const [incidents, setIncidents] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [recommendationError, setRecommendationError] = useState(null);
  const [backendHealth, setBackendHealth] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [filters, setFilters] = useState({
    activeOnly: false,
    highPriorityOnly: false,
    cause: 'all',
    corridor: 'all',
    zone: 'all'
  });
  const [filterOptions, setFilterOptions] = useState({
    causes: [],
    corridors: [],
    zones: []
  });

  console.log('[INFO] App component mounted');

  // Check backend health on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        console.log('[INFO] Checking backend health...');
        const response = await fetch(`${API_BASE}/health`);
        const data = await response.json();
        setBackendHealth(data);
        console.log('[SUCCESS] Backend health:', data);
      } catch (err) {
        console.error('[ERROR] Backend health check failed:', err);
        setBackendHealth({
          status: 'error',
          error: 'Cannot reach backend at ' + API_BASE
        });
      }
    };
    checkBackend();
  }, []);

  // Load leaflet-heat from CDN
  useEffect(() => {
    if (!window.L.heatLayer) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
      script.async = true;
      script.onload = () => {
        console.log('[SUCCESS] leaflet-heat loaded from CDN');
      };
      script.onerror = () => {
        console.warn('[WARNING] leaflet-heat CDN failed - markers will still work fine');
      };
      document.head.appendChild(script);
    }
  }, []);

  // Initialize map
  useEffect(() => {
    const initMap = () => {
      console.log('[INFO] Attempting to initialize map...');
      
      if (!mapRef.current) {
        console.error('[ERROR] mapRef is null!');
        return;
      }

      if (mapInstanceRef.current) {
        console.log('[INFO] Map already initialized');
        return;
      }

      try {
        if (mapRef.current) {
          mapRef.current.innerHTML = '';
        }

        const map = L.map(mapRef.current, {
          center: [12.97, 77.59],
          zoom: 11,
          attributionControl: true
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 19,
          minZoom: 8
        }).addTo(map);

        mapInstanceRef.current = map;
        console.log('[SUCCESS] Map initialized successfully');

        setTimeout(() => {
          map.invalidateSize();
          console.log('[INFO] Map size invalidated');
        }, 100);

      } catch (err) {
        console.error('[ERROR] Failed to initialize map:', err);
      }
    };

    const timer = setTimeout(initMap, 500);
    return () => clearTimeout(timer);
  }, []);

  // Fetch filter options
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [causes, corridors, zones] = await Promise.all([
          fetch(`${API_BASE}/filters/causes`).then(r => r.json()),
          fetch(`${API_BASE}/filters/corridors`).then(r => r.json()),
          fetch(`${API_BASE}/filters/zones`).then(r => r.json()),
        ]);
        setFilterOptions({ causes, corridors, zones });
        console.log('[SUCCESS] Filter options loaded');
      } catch (err) {
        console.error('[ERROR] Failed to fetch filters:', err);
      }
    };
    fetchFilterOptions();
  }, []);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        console.log('[INFO] Fetching data from backend...');
        const analyticsRes = await fetch(`${API_BASE}/analytics`).then(r => r.json());
        const incidentsRes = await fetch(`${API_BASE}/incidents?limit=500`).then(r => r.json());
        
        console.log('[SUCCESS] Data loaded:', incidentsRes.length, 'incidents');
        setAnalytics(analyticsRes);
        setIncidents(incidentsRes);
      } catch (err) {
        console.error('[ERROR] Data fetch failed:', err);
        alert('⚠️ Could not load data. Is backend running?\n\nRun: python backend.py\n\nError: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Apply filters
  const filteredIncidents = incidents.filter(i => {
    if (filters.activeOnly && i.is_active === 0) return false;
    if (filters.highPriorityOnly && i.priority !== 'High') return false;
    if (filters.cause !== 'all' && i.cause !== filters.cause) return false;
    if (filters.corridor !== 'all' && i.corridor !== filters.corridor) return false;
    if (filters.zone !== 'all' && i.zone !== filters.zone) return false;
    return true;
  });

  // Helper function to get severity label
  const getSeverityLabel = (severity) => {
    if (severity >= 7) return 'Critical';
    if (severity >= 5) return 'High';
    if (severity >= 3) return 'Medium';
    return 'Low';
  };

  // Fetch recommendations with improved error handling
  const fetchRecommendations = async (incident_id) => {
    setLoadingRecommendations(true);
    setRecommendationError(null);
    
    try {
      console.log(`[INFO] Fetching recommendations for incident ${incident_id}...`);
      
      // Check backend health first
      if (!backendHealth || backendHealth.status !== 'ok') {
        throw new Error('Backend not responding. Make sure to run: python backend.py');
      }
      
      const response = await fetch(`${API_BASE}/incidents/${incident_id}/recommendations`);
      
      console.log(`[INFO] Response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ERROR] Response text:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      console.log('[SUCCESS] Recommendations loaded:', data);
      
      if (!data) {
        throw new Error('Empty response from server');
      }
      
      setRecommendations(data);
      
    } catch (err) {
      console.error('[ERROR] Failed to fetch recommendations:', err);
      console.error('[DEBUG] Error message:', err.message);
      
      setRecommendationError({
        title: '❌ Failed to Load Recommendations',
        message: err.message,
        details: 'Check the browser console (F12) and backend logs for details.'
      });
      
      alert(`Error loading recommendations:\n${err.message}\n\nSee browser console for details.`);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  // Update map markers
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    markersRef.current.forEach(m => {
      try {
        mapInstanceRef.current.removeLayer(m);
      } catch (e) {
        // Ignore
      }
    });
    markersRef.current = [];

    if (!showMarkers) return;

    console.log('[INFO] Adding', filteredIncidents.length, 'markers to map');

    filteredIncidents.forEach(incident => {
      try {
        const color =
          incident.severity >= 7
            ? '#e74c3c'
            : incident.severity >= 5
            ? '#f39c12'
            : '#27ae60';

        const pulseClass = incident.severity >= 7 ? 'incident-marker' : '';

        const icon = L.divIcon({
          html: `
            <div class="${pulseClass}"
                 style="
                   background-color: ${color};
                   width: 12px;
                   height: 12px;
                   border-radius: 50%;
                   border: 2px solid white;
                   box-shadow: 0 0 3px rgba(0,0,0,0.3);
                 ">
            </div>
          `,
          iconSize: [16, 16],
          className: '',
        });

        const marker = L.marker([incident.lat, incident.lng], { icon })
          .bindPopup(`<strong>${incident.cause}</strong><br/>${incident.corridor}<br/>Severity: ${incident.severity}`, { maxWidth: 250 })
          .on('click', () => {
            console.log('[INFO] Incident clicked:', incident.id);
            setSelectedIncident(incident);
            setRecommendationError(null);
            fetchRecommendations(incident.id);
          })
          .addTo(mapInstanceRef.current);

        markersRef.current.push(marker);
      } catch (err) {
        console.error('[ERROR] Failed to add marker:', err);
      }
    });

  }, [filteredIncidents, showMarkers, backendHealth]);

  // Update heatmap
  useEffect(() => {
    if (!mapInstanceRef.current || !window.L.heatLayer) return;

    if (heatmapRef.current) {
      try {
        mapInstanceRef.current.removeLayer(heatmapRef.current);
      } catch (e) {
        // Ignore
      }
    }

    if (!showHeatmap) return;

    console.log('[INFO] Updating heatmap with', filteredIncidents.length, 'points');

    const heatmapData = filteredIncidents.map(i => [
      i.lat,
      i.lng,
      i.severity / 10.0
    ]);

    if (heatmapData.length > 0) {
      try {
        heatmapRef.current = window.L.heatLayer(heatmapData, {
          radius: 40,
          blur: 25,
          maxZoom: 18,
          minOpacity: 0.2,
          gradient: { 0.2: 'blue', 0.4: 'lime', 0.6: 'yellow', 0.8: 'orange', 1.0: 'red' }
        }).addTo(mapInstanceRef.current);

        console.log('[SUCCESS] Heatmap added');
      } catch (err) {
        console.warn('[WARNING] Heatmap rendering failed:', err);
      }
    }

  }, [filteredIncidents, showHeatmap]);

  // Get demand score color
  const getDemandScoreColor = (score) => {
    if (score >= 80) return '#e74c3c';
    if (score >= 60) return '#f39c12';
    if (score >= 40) return '#f1c40f';
    return '#27ae60';
  };

  // Backend health indicator
  const getBackendStatus = () => {
    if (!backendHealth) return { text: '⏳ Checking...', color: '#95a5a6' };
    if (backendHealth.status === 'ok') return { text: '✅ Connected', color: '#27ae60' };
    return { text: '❌ Disconnected', color: '#e74c3c' };
  };

  const backendStatus = getBackendStatus();

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <h1>🚨 GridLock Guard</h1>
          <p>Bengaluru Traffic Event Intelligence Dashboard</p>
        </div>
        <div className="header-stats">
          <div className="stat">
            <span className="stat-value">{analytics?.total_incidents || '0'}</span>
            <span className="stat-label">Total Events</span>
          </div>
          <div className="stat">
            <span className="stat-value" style={{ color: '#e74c3c' }}>{analytics?.active_incidents || '0'}</span>
            <span className="stat-label">Active</span>
          </div>
          <div className="stat">
            <span className="stat-value" style={{ color: '#f39c12' }}>{analytics?.high_priority_count || '0'}</span>
            <span className="stat-label">High Priority</span>
          </div>
          <div className="stat">
            <span className="stat-value" style={{ color: '#e67e22' }}>{analytics?.road_closures || '0'}</span>
            <span className="stat-label">Road Closures</span>
          </div>
          <div className="stat">
            <span className="stat-value" style={{ color: backendStatus.color }}>{backendStatus.text}</span>
            <span className="stat-label">Backend</span>
          </div>
        </div>
      </header>

      <div className="main-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="panel">
            <h3>📊 Filters</h3>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={filters.activeOnly}
                onChange={(e) => setFilters({...filters, activeOnly: e.target.checked})}
              />
              <span>Active Only</span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={filters.highPriorityOnly}
                onChange={(e) => setFilters({...filters, highPriorityOnly: e.target.checked})}
              />
              <span>High Priority Only</span>
            </label>

            <select
              className="filter-select"
              value={filters.cause}
              onChange={(e) => setFilters({...filters, cause: e.target.value})}
            >
              <option value="all">All Causes</option>
              {filterOptions.causes && filterOptions.causes.map(c => <option key={c} value={c}>{c.replace('_', ' ')}</option>)}
            </select>

            <select
              className="filter-select"
              value={filters.corridor}
              onChange={(e) => setFilters({...filters, corridor: e.target.value})}
            >
              <option value="all">All Corridors</option>
              {filterOptions.corridors && filterOptions.corridors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            <select
              className="filter-select"
              value={filters.zone}
              onChange={(e) => setFilters({...filters, zone: e.target.value})}
            >
              <option value="all">All Zones</option>
              {filterOptions.zones && filterOptions.zones.map(z => <option key={z} value={z}>{z}</option>)}
            </select>

            <button className="btn-secondary" onClick={() => setFilters({
              activeOnly: false, highPriorityOnly: false, cause: 'all', corridor: 'all', zone: 'all'
            })}>Reset Filters</button>
          </div>

          <div className="panel">
            <h3>🎨 Visualization</h3>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showMarkers}
                onChange={(e) => setShowMarkers(e.target.checked)}
              />
              <span>Show Markers</span>
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={showHeatmap}
                onChange={(e) => setShowHeatmap(e.target.checked)}
              />
              <span>Show Heatmap</span>
            </label>
          </div>

          {analytics && (
            <div className="panel">
              <h3>🛣️ Top Corridors</h3>
              <div className="top-list">
                {Object.entries(analytics.top_corridors).slice(0, 5).map(([corridor, count]) => (
                  <div key={corridor} className="list-item">
                    <span className="list-label">{corridor}</span>
                    <span className="list-badge">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel">
            <h3>📍 Results</h3>
            <p>{filteredIncidents.length} incidents found</p>
          </div>
        </aside>

        {/* Map */}
        <div className="map-container" ref={mapRef}></div>

        {/* Detail Panel */}
        {selectedIncident && (
          <aside className="detail-panel">
            <button className="close-btn" onClick={() => {
              setSelectedIncident(null);
              setRecommendations(null);
              setRecommendationError(null);
            }}>✕</button>

            <div className="detail-header">
              <h2>{selectedIncident.cause.replace('_', ' ').toUpperCase()}</h2>
              <div className={`severity-badge severity-${getSeverityLabel(selectedIncident.severity).toLowerCase()}`}>
                {getSeverityLabel(selectedIncident.severity)}
              </div>
            </div>

            <div className="detail-info">
              <div className="info-row">
                <span className="label">Priority</span>
                <span className="value">{selectedIncident.priority}</span>
              </div>
              <div className="info-row">
                <span className="label">Corridor</span>
                <span className="value">{selectedIncident.corridor}</span>
              </div>
              <div className="info-row">
                <span className="label">Zone</span>
                <span className="value">{selectedIncident.zone}</span>
              </div>
              <div className="info-row">
                <span className="label">Junction</span>
                <span className="value">{selectedIncident.junction}</span>
              </div>
              <div className="info-row">
                <span className="label">Address</span>
                <span className="value small">{selectedIncident.address}</span>
              </div>
              <div className="info-row">
                <span className="label">Status</span>
                <span className={`value status-${selectedIncident.status}`}>{selectedIncident.status}</span>
              </div>
              <div className="info-row">
                <span className="label">Road Closure</span>
                <span className="value">{selectedIncident.requires_closure ? '🔴 Yes' : '🟢 No'}</span>
              </div>
              <div className="info-row">
                <span className="label">Duration</span>
                <span className="value">{Math.round(selectedIncident.duration_mins)} minutes</span>
              </div>
            </div>

            {loadingRecommendations && (
              <div className="loading-spinner">
                <p>⏳ Loading ML predictions...</p>
              </div>
            )}

            {recommendationError && (
              <div className="error-box" style={{
                backgroundColor: '#fadbd8',
                border: '2px solid #e74c3c',
                borderRadius: '6px',
                padding: '12px',
                marginBottom: '12px',
                color: '#c0392b'
              }}>
                <p><strong>{recommendationError.title}</strong></p>
                <p>{recommendationError.message}</p>
                <p style={{ fontSize: '0.9em', marginTop: '8px' }}>
                  {recommendationError.details}
                </p>
              </div>
            )}

            {recommendations && (
              <div className="recommendations">
                <h3>🎯 Enforcement Recommendations</h3>

                <div className={`risk-badge risk-${recommendations.risk_level.toLowerCase()}`}>
                  <strong>Risk Level: {recommendations.risk_level}</strong>
                </div>

                {recommendations.predicted_demand_score !== undefined && (
                  <div className="demand-score" style={{
                    backgroundColor: getDemandScoreColor(recommendations.predicted_demand_score),
                    padding: '12px',
                    borderRadius: '6px',
                    color: 'white',
                    marginBottom: '12px',
                    fontWeight: 'bold'
                  }}>
                    📊 Predicted Traffic Demand: {recommendations.predicted_demand_score.toFixed(1)}/100
                  </div>
                )}

                <div className="recommendation-section">
                  <h4>🚧 Barricading Points</h4>
                  <ul>
                    {recommendations.barricading_points && recommendations.barricading_points.length > 0 ? (
                      recommendations.barricading_points.map((point, i) => (
                        <li key={i}>{point}</li>
                      ))
                    ) : (
                      <li>No barricading required</li>
                    )}
                  </ul>
                </div>

                <div className="recommendation-section">
                  <h4>🛣️ Diversion Routes</h4>
                  <ul>
                    {recommendations.diversion_routes && recommendations.diversion_routes.length > 0 ? (
                      recommendations.diversion_routes.map((route, i) => (
                        <li key={i}>{route}</li>
                      ))
                    ) : (
                      <li>No diversions needed</li>
                    )}
                  </ul>
                </div>

                <div className="recommendation-section">
                  <h4>👮 Manpower Deployment</h4>
                  <ul>
                    {recommendations.manpower_deployment && recommendations.manpower_deployment.length > 0 ? (
                      recommendations.manpower_deployment.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))
                    ) : (
                      <li>Standard monitoring</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
// ============================================================================
// MAIN APP WITH MODE SWITCHER
// ============================================================================

export default function App() {
  const [appMode, setAppMode] = useState('historical'); // 'historical' or 'prediction'

  return (
    <div>
      {/* Mode Switcher Header */}
      <div style={{
        background: '#1e293b',
        borderBottom: '1px solid #334155',
        padding: '8px 24px',
        display: 'flex',
        gap: '8px',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        <button
          onClick={() => setAppMode('historical')}
          style={{
            padding: '8px 16px',
            background: appMode === 'historical' ? '#3b82f6' : '#0f172a',
            border: `2px solid ${appMode === 'historical' ? '#3b82f6' : '#334155'}`,
            color: '#fff',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
        >
          📊 Historical Incidents
        </button>
        <button
          onClick={() => setAppMode('prediction')}
          style={{
            padding: '8px 16px',
            background: appMode === 'prediction' ? '#3b82f6' : '#0f172a',
            border: `2px solid ${appMode === 'prediction' ? '#3b82f6' : '#334155'}`,
            color: '#fff',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            transition: 'all 0.2s'
          }}
        >
          🔮 Predict Event
        </button>
      </div>

      {/* Render based on mode */}
      {appMode === 'historical' ? <HistoricalView /> : <GridLockGuardUI />}
    </div>
  );
}
