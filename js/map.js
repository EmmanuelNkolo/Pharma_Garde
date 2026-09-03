/**
 * Pharma-Garde — Map Module
 * Manages the Leaflet map, markers, and radius circle
 */

const PharmMap = (() => {
  let map = null;
  let markersLayer = null;
  let radiusCircle = null;
  let maskLayer = null;
  let userMarker = null;
  let currentPharmacies = [];
  let routingControl = null;

  // HTTPS tiles to avoid mixed-content issues
  const TILE_URL = 'https://mt0.google.com/vt/lyrs=m&hl=fr&x={x}&y={y}&z={z}';
  const TILE_ATTRIBUTION = '&copy; Google Maps';

  // Fallback OSM tiles if Google is blocked
  const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';

  /**
   * Create a custom pharmacy marker icon
   */
  function createMarkerIcon(pharmacy) {
    let markerClass = 'marker-open';
    let emoji = '💊';

    if (pharmacy.isOnDuty) {
      markerClass = 'marker-guard';
      emoji = '🏥';
    } else if (!pharmacy.isOpen) {
      markerClass = 'marker-closed';
      emoji = '💤';
    }

    return L.divIcon({
      html: `<div class="pharmacy-marker ${markerClass}">
               <div class="pharmacy-marker-dot">${emoji}</div>
             </div>`,
      className: 'pharmacy-marker-wrapper',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -20],
    });
  }

  /**
   * Create the user location marker
   */
  function createUserIcon() {
    return L.divIcon({
      html: `<div class="pharmacy-marker marker-user">
               <div class="pharmacy-marker-dot">📍</div>
             </div>`,
      className: 'pharmacy-marker-wrapper',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  /**
   * Initialize the Leaflet map
   */
  function initMap(containerId, center, zoom = 13) {
    if (map) {
      map.remove();
    }

    map = L.map(containerId, {
      center: [center.lat, center.lng],
      zoom: zoom,
      zoomControl: true,
      attributionControl: true,
    });

    // Position zoom controls on the right
    map.zoomControl.setPosition('topright');

    // Try Google tiles first, fallback to OSM
    const tileLayer = L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19,
    });

    tileLayer.on('tileerror', function() {
      // Fallback to OSM if Google tiles fail
      tileLayer.setUrl(OSM_TILE_URL);
    });

    tileLayer.addTo(map);

    // Create markers layer group
    markersLayer = L.layerGroup().addTo(map);

    return map;
  }

  /**
   * Set user location marker
   */
  function setUserMarker(lat, lng) {
    if (userMarker) {
      userMarker.remove();
    }

    userMarker = L.marker([lat, lng], {
      icon: createUserIcon(),
      zIndexOffset: 1000,
    }).addTo(map);

    userMarker.bindPopup(`
      <div class="popup-content">
        <div class="popup-name">📍 Votre position</div>
        <div class="popup-address">Position actuelle</div>
      </div>
    `);
  }

  /**
   * Helper to get polygon points for a circle
   */
  function getCirclePolygon(center, radiusKm, points = 64) {
    const coords = [];
    const R = 6371; 
    const lat = (center.lat * Math.PI) / 180;
    const lng = (center.lng * Math.PI) / 180;
    const d = radiusKm / R;

    for (let i = 0; i <= points; i++) {
      const brng = (Math.PI * 2 * i) / points;
      const pLat = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(brng));
      const pLng = lng + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(pLat));
      coords.push([ (pLat * 180) / Math.PI, (pLng * 180) / Math.PI ]);
    }
    return coords;
  }

  /**
   * Draw or update the radius circle
   */
  function drawRadiusCircle(center, radiusKm) {
    if (radiusCircle) {
      radiusCircle.remove();
    }
    if (maskLayer) {
      maskLayer.remove();
    }

    radiusCircle = L.circle([center.lat, center.lng], {
      radius: radiusKm * 1000,
      color: '#38bdf8',
      fillColor: '#38bdf8',
      fillOpacity: 0.08,
      weight: 2,
      opacity: 0.6,
      dashArray: '6, 8',
    }).addTo(map);

    // Draw inverted mask to dim the outside
    const outerRing = [
      [90, -180], [90, 180], [-90, 180], [-90, -180], [90, -180]
    ];
    const innerRing = getCirclePolygon(center, radiusKm);

    maskLayer = L.polygon([outerRing, innerRing], {
      color: 'transparent',
      fillColor: '#0f172a',
      fillOpacity: 0.5,
      className: 'map-mask'
    }).addTo(map);

    // Fit map to circle bounds
    map.fitBounds(radiusCircle.getBounds(), { padding: [30, 30], maxZoom: 15 });
  }

  /**
   * Add pharmacy markers to the map
   */
  function addPharmacyMarkers(pharmacies, onClickCallback) {
    markersLayer.clearLayers();
    currentPharmacies = pharmacies;

    pharmacies.forEach((pharmacy) => {
      const marker = L.marker([pharmacy.lat, pharmacy.lng], {
        icon: createMarkerIcon(pharmacy),
      });

      const statusBadge = pharmacy.isOnDuty
        ? '<span class="badge badge-guard">🌙 De garde</span>'
        : pharmacy.isOpen
          ? '<span class="badge badge-open">✅ Ouvert</span>'
          : '<span class="badge badge-closed">Fermé</span>';

      const popupContent = `
        <div class="popup-content">
          <div class="popup-name">${pharmacy.name}</div>
          <div class="popup-address">${pharmacy.address}</div>
          <div class="popup-meta">
            ${statusBadge}
            <span class="popup-distance">${pharmacy.distance} km</span>
          </div>
          <div class="popup-actions">
            <button class="btn btn-call btn-sm" onclick="App.callPharmacy('${pharmacy.phone}')">📞 Appeler</button>
            <button class="btn btn-route btn-sm" onclick="PharmMap.drawRoute(Geolocation.getPosition().lat, Geolocation.getPosition().lng, ${pharmacy.lat}, ${pharmacy.lng})">🗺️ Y aller</button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, {
        maxWidth: 280,
        className: 'pharmacy-popup',
      });

      marker.on('click', () => {
        if (onClickCallback) {
          onClickCallback(pharmacy);
        }
      });

      marker.addTo(markersLayer);
    });
  }

  /**
   * Highlight a specific pharmacy on the map (zoom to it)
   */
  function highlightPharmacy(pharmacy) {
    if (map) {
      map.setView([pharmacy.lat, pharmacy.lng], 16, {
        animate: true,
        duration: 0.5,
      });
    }
  }

  /**
   * Fit the map to show all markers
   */
  function fitToMarkers() {
    if (currentPharmacies.length > 0 && map) {
      const bounds = L.latLngBounds(
        currentPharmacies.map((p) => [p.lat, p.lng])
      );
      
      const userPos = Geolocation.getPosition();
      if (userPos) {
        bounds.extend([userPos.lat, userPos.lng]);
      }
      
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    }
  }

  /**
   * Center map on a specific location
   */
  function centerOn(lat, lng, zoom = 14) {
    if (map) {
      map.setView([lat, lng], zoom, { animate: true });
    }
  }

  /**
   * Center map on user position
   */
  function recenterOnUser() {
    const pos = Geolocation.getPosition();
    if (pos && map) {
      map.setView([pos.lat, pos.lng], 14, { animate: true });
    }
  }

  /**
   * Get the map instance
   */
  function getMap() {
    return map;
  }

  /**
   * Draw route between two points using Leaflet Routing Machine
   */
  function drawRoute(startLat, startLng, endLat, endLng) {
    if (!map) return;
    
    // Remove existing route if any
    if (routingControl) {
      map.removeControl(routingControl);
    }

    try {
      routingControl = L.Routing.control({
        waypoints: [
          L.latLng(startLat, startLng),
          L.latLng(endLat, endLng)
        ],
        routeWhileDragging: false,
        lineOptions: {
          styles: [{color: '#2563EB', opacity: 0.8, weight: 6}]
        },
        createMarker: function() { return null; },
        show: false,
        addWaypoints: false,
      }).addTo(map);
    } catch(e) {
      console.error('Routing error:', e);
      // Fallback: open Google Maps
      window.open(
        `https://www.google.com/maps/dir/${startLat},${startLng}/${endLat},${endLng}`,
        '_blank'
      );
    }

    // Hide bottom sheet for full map view
    const bottomSheet = document.getElementById('bottom-sheet');
    if (bottomSheet && !bottomSheet.classList.contains('collapsed')) {
      bottomSheet.classList.add('collapsed');
    }
  }

  /**
   * Remove the current route from the map
   */
  function clearRoute() {
    if (routingControl && map) {
      map.removeControl(routingControl);
      routingControl = null;
    }
  }

  return {
    initMap,
    setUserMarker,
    drawRadiusCircle,
    addPharmacyMarkers,
    highlightPharmacy,
    fitToMarkers,
    centerOn,
    recenterOnUser,
    getMap,
    drawRoute,
    clearRoute,
  };
})();

window.PharmMap = PharmMap;
