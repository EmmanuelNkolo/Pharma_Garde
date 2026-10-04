/**
 * Pharma-Garde — Geolocation Module v2.0
 * Handles GPS, reverse geocoding, distance calculations, and map management
 */
const Geolocation = (() => {
  let position = null; // { lat, lng }
  let watchId = null;

  /**
   * Haversine distance between two points in km
   */
  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /**
   * Get current GPS position using high-precision PG core if available
   */
  async function getCurrentPosition() {
    if (window.PG && typeof PG.locate === 'function') {
      try {
        const pos = await PG.locate({ desired: 30, maxWait: 15000 });
        position = { lat: pos.lat, lng: pos.lng };
        return position;
      } catch (err) {
        throw err;
      }
    }
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Géolocalisation non supportée'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          resolve(position);
        },
        (err) => {
          const messages = {
            1: 'Permission de géolocalisation refusée. Activez-la dans les paramètres.',
            2: 'Position indisponible. Vérifiez votre GPS.',
            3: 'Délai de détection dépassé. Réessayez.'
          };
          reject(new Error(messages[err.code] || 'Erreur GPS inconnue'));
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
      );
    });
  }

  /**
   * Watch position changes
   */
  function watchPosition(callback) {
    if (!navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (callback) callback(position);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  }

  function stopWatching() {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  /**
   * Reverse geocode to get city name
   */
  async function reverseGeocode(lat, lng) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=fr`
      );
      const data = await res.json();
      return {
        city: data.address?.city || data.address?.town || data.address?.village || data.address?.state || 'Position détectée',
        quarter: data.address?.suburb || data.address?.neighbourhood || '',
        display: data.display_name || '',
        country: data.address?.country || ''
      };
    } catch (e) {
      return { city: 'Position détectée', quarter: '', display: '', country: '' };
    }
  }

  function getPosition() { return position; }
  function setPosition(lat, lng) { position = { lat, lng }; }

  /**
   * Navigate to coordinates using native intent (stays in app context)
   */
  function navigateTo(lat, lng) {
    if (!position) {
      throw new Error('Position non détectée');
    }
    // Use geo: URI scheme which opens native maps app without leaving the browser context
    const geoUri = `geo:${lat},${lng}?q=${lat},${lng}`;
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${position.lat},${position.lng}&destination=${lat},${lng}&travelmode=driving`;
    
    // Try native intent first, fallback to Google Maps
    try {
      window.location.href = geoUri;
    } catch (e) {
      window.open(mapsUrl, '_blank');
    }
  }

  return {
    haversine,
    getCurrentPosition,
    watchPosition,
    stopWatching,
    reverseGeocode,
    getPosition,
    setPosition,
    navigateTo,
  };
})();

window.Geolocation = Geolocation;
