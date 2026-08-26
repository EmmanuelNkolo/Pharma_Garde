/**
 * Pharma-Garde — Geolocation Module
 * Handles GPS positioning and distance calculations
 */

const Geolocation = (() => {
  let userPosition = null;

  /**
   * Get user's current GPS position
   * @returns {Promise<{lat: number, lng: number}>}
   */
  function getUserLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('La géolocalisation n\'est pas supportée par votre navigateur.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          userPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          resolve(userPosition);
        },
        (error) => {
          let message;
          switch (error.code) {
            case error.PERMISSION_DENIED:
              message = 'Accès à la localisation refusé. Veuillez choisir votre quartier manuellement.';
              break;
            case error.POSITION_UNAVAILABLE:
              message = 'Position indisponible. Veuillez réessayer ou choisir votre quartier.';
              break;
            case error.TIMEOUT:
              message = 'Délai dépassé. Veuillez réessayer ou choisir votre quartier.';
              break;
            default:
              message = 'Erreur de localisation. Veuillez choisir votre quartier.';
          }
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    });
  }

  /**
   * Set user position manually (when selecting a quarter)
   * @param {number} lat
   * @param {number} lng
   */
  function setUserPosition(lat, lng) {
    userPosition = { lat, lng };
    return userPosition;
  }

  /**
   * Get currently stored user position
   * @returns {{lat: number, lng: number} | null}
   */
  function getPosition() {
    return userPosition;
  }

  /**
   * Calculate distance between two coordinates using the Haversine formula
   * @param {number} lat1
   * @param {number} lng1
   * @param {number} lat2
   * @param {number} lng2
   * @returns {number} Distance in kilometers
   */
  function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function toRad(deg) {
    return deg * (Math.PI / 180);
  }

  /**
   * Filter pharmacies within a given radius from user position
   * @param {Array} pharmacies - Array of pharmacy objects
   * @param {number} radiusKm - Radius in kilometers
   * @param {boolean} includesClosed - Whether to include closed pharmacies
   * @returns {Array} Filtered and sorted pharmacies with distance property added
   */
  function filterByRadius(pharmacies, radiusKm, includesClosed = false) {
    if (!userPosition) return [];

    return pharmacies
      .map((pharmacy) => {
        const distance = calculateDistance(
          userPosition.lat,
          userPosition.lng,
          pharmacy.lat,
          pharmacy.lng
        );
        return { ...pharmacy, distance: Math.round(distance * 10) / 10 };
      })
      .filter((pharmacy) => {
        if (pharmacy.distance > radiusKm) return false;
        if (!includesClosed && !pharmacy.isOpen && !pharmacy.isOnDuty) return false;
        return true;
      })
      .sort((a, b) => {
        // Sort: on-duty first, then open, then by distance
        if (a.isOnDuty && !b.isOnDuty) return -1;
        if (!a.isOnDuty && b.isOnDuty) return 1;
        return a.distance - b.distance;
      });
  }

  /**
   * Get only open/on-duty pharmacies within radius
   */
  function getOpenPharmacies(pharmacies, radiusKm) {
    if (!userPosition) return [];

    return pharmacies
      .map((pharmacy) => {
        const distance = calculateDistance(
          userPosition.lat,
          userPosition.lng,
          pharmacy.lat,
          pharmacy.lng
        );
        return { ...pharmacy, distance: Math.round(distance * 10) / 10 };
      })
      .filter((p) => p.distance <= radiusKm && (p.isOpen || p.isOnDuty))
      .sort((a, b) => a.distance - b.distance);
  }

  /**
   * Determine which city the user is closest to
   */
  function detectCity() {
    if (!userPosition) return 'Douala';

    let closestCity = 'Douala';
    let minDist = Infinity;

    for (const [city, data] of Object.entries(CITIES_AND_QUARTERS)) {
      const dist = calculateDistance(
        userPosition.lat,
        userPosition.lng,
        data.center.lat,
        data.center.lng
      );
      if (dist < minDist) {
        minDist = dist;
        closestCity = city;
      }
    }

    return closestCity;
  }

  return {
    getUserLocation,
    setUserPosition,
    getPosition,
    calculateDistance,
    filterByRadius,
    getOpenPharmacies,
    detectCity,
  };
})();
