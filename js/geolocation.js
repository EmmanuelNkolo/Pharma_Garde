/**
 * Pharma-Garde — Geolocation Module
 * Handles GPS position detection, watching, and city detection
 */

const Geolocation = (() => {
  let currentPosition = null;
  let watchId = null;
  let currentCity = null;

  const STORAGE_KEY = 'pharmagarde_last_position';
  const CITY_STORAGE_KEY = 'pharmagarde_last_city';

  // GPS options for high accuracy
  const GPS_OPTIONS = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 30000,
  };

  // City detection polygons (approximate bounding boxes)
  const CITY_BOUNDS = {
    'Douala': { minLat: 3.90, maxLat: 4.15, minLng: 9.55, maxLng: 9.90 },
    'Yaoundé': { minLat: 3.76, maxLat: 3.96, minLng: 11.40, maxLng: 11.62 },
    'Bafoussam': { minLat: 5.42, maxLat: 5.55, minLng: 10.35, maxLng: 10.50 },
    'Garoua': { minLat: 9.22, maxLat: 9.40, minLng: 13.32, maxLng: 13.50 },
    'Maroua': { minLat: 10.52, maxLat: 10.68, minLng: 14.25, maxLng: 14.40 },
    'Bamenda': { minLat: 5.90, maxLat: 6.05, minLng: 10.10, maxLng: 10.25 },
    'Kribi': { minLat: 2.90, maxLat: 3.00, minLng: 9.86, maxLng: 9.96 },
    'Limbé': { minLat: 4.00, maxLat: 4.05, minLng: 9.18, maxLng: 9.25 },
    'Buéa': { minLat: 4.14, maxLat: 4.20, minLng: 9.21, maxLng: 9.28 },
    'Bertoua': { minLat: 4.55, maxLat: 4.62, minLng: 13.65, maxLng: 13.72 },
    'Ngaoundéré': { minLat: 7.28, maxLat: 7.38, minLng: 13.55, maxLng: 13.65 },
    'Ebolowa': { minLat: 2.87, maxLat: 2.93, minLng: 11.13, maxLng: 11.19 },
  };

  /**
   * Detect which city the coordinates belong to
   */
  function detectCity(lat, lng) {
    for (const [cityName, bounds] of Object.entries(CITY_BOUNDS)) {
      if (lat >= bounds.minLat && lat <= bounds.maxLat &&
          lng >= bounds.minLng && lng <= bounds.maxLng) {
        return cityName;
      }
    }
    // Default to the closest city by distance
    return findClosestCity(lat, lng);
  }

  /**
   * Find the closest city to the given coordinates
   */
  function findClosestCity(lat, lng) {
    if (typeof CITIES_AND_QUARTERS === 'undefined') return 'Douala';

    let closest = 'Douala';
    let minDist = Infinity;

    for (const [cityName, cityData] of Object.entries(CITIES_AND_QUARTERS)) {
      const dist = haversine(lat, lng, cityData.center.lat, cityData.center.lng);
      if (dist < minDist) {
        minDist = dist;
        closest = cityName;
      }
    }

    return closest;
  }

  /**
   * Haversine formula for distance in km
   */
  function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Save position to localStorage
   */
  function savePosition(pos) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        lat: pos.lat,
        lng: pos.lng,
        timestamp: Date.now()
      }));
    } catch(e) { /* localStorage might be unavailable */ }
  }

  /**
   * Load last known position from localStorage
   */
  function loadSavedPosition() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only use if less than 1 hour old
        if (Date.now() - parsed.timestamp < 3600000) {
          return { lat: parsed.lat, lng: parsed.lng };
        }
      }
    } catch(e) { /* ignore */ }
    return null;
  }

  /**
   * Save the detected city
   */
  function saveCity(city) {
    try {
      localStorage.setItem(CITY_STORAGE_KEY, city);
    } catch(e) { /* ignore */ }
  }

  /**
   * Load last known city
   */
  function loadSavedCity() {
    try {
      return localStorage.getItem(CITY_STORAGE_KEY) || 'Douala';
    } catch(e) { return 'Douala'; }
  }

  /**
   * Request GPS position (one-time)
   * Returns a Promise that resolves with { lat, lng }
   */
  function requestPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        // Try saved position as fallback
        const saved = loadSavedPosition();
        if (saved) {
          currentPosition = saved;
          currentCity = detectCity(saved.lat, saved.lng);
          saveCity(currentCity);
          resolve(saved);
        } else {
          reject(new Error('Géolocalisation non supportée'));
        }
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          currentPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          currentCity = detectCity(currentPosition.lat, currentPosition.lng);
          savePosition(currentPosition);
          saveCity(currentCity);
          resolve(currentPosition);
        },
        (error) => {
          console.warn('Geolocation error:', error.message);
          
          // Try saved position as fallback
          const saved = loadSavedPosition();
          if (saved) {
            currentPosition = saved;
            currentCity = detectCity(saved.lat, saved.lng);
            saveCity(currentCity);
            resolve(saved);
          } else {
            reject(error);
          }
        },
        GPS_OPTIONS
      );
    });
  }

  /**
   * Start watching position for real-time updates
   */
  function startWatching(onUpdate) {
    if (!navigator.geolocation) return;
    
    // Stop any existing watch
    stopWatching();

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const newPos = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        
        // Only update if position changed significantly (> 50m)
        if (currentPosition) {
          const dist = haversine(currentPosition.lat, currentPosition.lng, newPos.lat, newPos.lng);
          if (dist < 0.05) return; // Less than 50m change, ignore
        }

        currentPosition = newPos;
        savePosition(newPos);

        const newCity = detectCity(newPos.lat, newPos.lng);
        if (newCity !== currentCity) {
          currentCity = newCity;
          saveCity(currentCity);
        }

        if (onUpdate) onUpdate(newPos);
      },
      (error) => {
        console.warn('Watch position error:', error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 10000,
      }
    );
  }

  /**
   * Stop watching position
   */
  function stopWatching() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  /**
   * Set position manually (e.g., when city is selected from dropdown)
   */
  function setManualPosition(lat, lng) {
    currentPosition = { lat, lng };
    currentCity = detectCity(lat, lng);
    savePosition(currentPosition);
    saveCity(currentCity);
  }

  /**
   * Get the current position
   */
  function getPosition() {
    return currentPosition;
  }

  /**
   * Get the current detected city
   */
  function getCity() {
    return currentCity || loadSavedCity();
  }

  /**
   * Calculate distance between current position and a pharmacy
   */
  function distanceTo(lat, lng) {
    if (!currentPosition) return Infinity;
    return haversine(currentPosition.lat, currentPosition.lng, lat, lng);
  }

  /**
   * Filter pharmacies within a radius
   */
  function filterByRadius(pharmacies, radiusKm) {
    if (!currentPosition) return pharmacies;
    
    return pharmacies
      .map(p => ({
        ...p,
        distance: parseFloat(haversine(currentPosition.lat, currentPosition.lng, p.lat, p.lng).toFixed(1))
      }))
      .filter(p => p.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);
  }

  return {
    requestPosition,
    startWatching,
    stopWatching,
    setManualPosition,
    getPosition,
    getCity,
    distanceTo,
    filterByRadius,
    haversine,
    loadSavedCity,
    loadSavedPosition,
  };
})();

window.Geolocation = Geolocation;
