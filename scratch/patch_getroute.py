import re

content = open('js/delegue.js', 'r', encoding='utf-8').read()

# Add getRoute
if 'function getRoute(lat, lng)' not in content:
    func = """
  function getRoute(lat, lng) {
    if (!userLat || !userLng) {
      return showToast('Veuillez d\\'abord détecter votre position.', 'error');
    }
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${lat},${lng}&travelmode=driving`, '_blank');
  }
"""
    content = content.replace('// ═══════════════════════════════════════════════════════\n  //  HELPERS', func + '\n  // ═══════════════════════════════════════════════════════\n  //  HELPERS')
    
    # Expose getRoute
    content = content.replace('handleLogout', 'handleLogout,\n    getRoute')

open('js/delegue.js', 'w', encoding='utf-8').write(content)
