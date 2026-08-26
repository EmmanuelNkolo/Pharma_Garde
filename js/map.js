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

  // Google Maps tile
  const TILE_URL = 'http://mt0.google.com/vt/lyrs=m&hl=fr&x={x}&y={y}&z={z}';
  const TILE_ATTRIBUTION = '&copy; Google Maps';

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
   * @param {string} containerId - HTML element ID for the map
   * @param {{lat: number, lng: number}} center - Initial center coordinates
   * @param {number} zoom - Initial zoom level
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

    // Add dark tile layer
    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

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
      color: '#38bdf8', /* Sky blue 400 */
      fillColor: '#38bdf8',
      fillOpacity: 0.1,
      weight: 2,
      opacity: 0.8,
    }).addTo(map);

    // Draw inverted mask to dim the outside
    const outerRing = [
      [90, -180],
      [90, 180],
      [-90, 180],
      [-90, -180],
      [90, -180]
    ];
    const innerRing = getCirclePolygon(center, radiusKm);

    maskLayer = L.polygon([outerRing, innerRing], {
      color: 'transparent',
      fillColor: '#0f172a',
      fillOpacity: 0.6,
      className: 'map-mask'
    }).addTo(map);
  }

  /**
   * Add pharmacy markers to the map
   * @param {Array} pharmacies - Pharmacies with distance property
   * @param {Function} onClickCallback - Called when a marker is clicked
   */
  function addPharmacyMarkers(pharmacies, onClickCallback) {
    // Clear existing markers
    markersLayer.clearLayers();
    currentPharmacies = pharmacies;

    pharmacies.forEach((pharmacy) => {
      const marker = L.marker([pharmacy.lat, pharmacy.lng], {
        icon: createMarkerIcon(pharmacy),
      });

      // Create popup content
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

    routingControl = L.Routing.control({
      waypoints: [
        L.latLng(startLat, startLng),
        L.latLng(endLat, endLng)
      ],
      routeWhileDragging: false,
      lineOptions: {
        styles: [{color: '#2563EB', opacity: 0.8, weight: 6}] // Blue line
      },
      createMarker: function() { return null; }, // Hide default markers
      show: false, // Hide itinerary instructions panel
      addWaypoints: false,
    }).addTo(map);

    // Hide bottom sheet if we want full map view
    const bottomSheet = document.getElementById('bottom-sheet');
    if (bottomSheet && !bottomSheet.classList.contains('collapsed')) {
      bottomSheet.classList.add('collapsed');
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
    getMap,
    drawRoute,
  };
})();
