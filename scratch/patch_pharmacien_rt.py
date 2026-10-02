import re

content = open('js/pharmacien.js', 'r', encoding='utf-8').read()

repl = """    function subscribeToRealTimeRequests() {
    if (realtimeChannel) supabase.removeChannel(realtimeChannel);

    realtimeChannel = supabase
      .channel('pharmacy_requests_v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'requests' }, (payload) => {
        const req = payload.new;
        if (req.status !== 'pending' || !currentPharmacy) return;
        if (req.user_lat && req.user_lng) {
          const dist = haversine(currentPharmacy.lat, currentPharmacy.lng, req.user_lat, req.user_lng);
          if (dist > (req.radius || 5)) return;
        }
        activeRequests.unshift(req);
        renderActiveRequests();
        updateStatCounters();
        showToast('🔔 Nouvelle demande de patient !', 'info');
        playNotificationSound();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'requests' }, (payload) => {
        const idx = activeRequests.findIndex(r => r.id === payload.new.id);
        if (idx >= 0) {
          if (payload.new.status !== 'pending') activeRequests.splice(idx, 1);
          else activeRequests[idx] = payload.new;
          renderActiveRequests();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'promotion_targets' }, (payload) => {
        if (currentPharmacy && payload.new.pharmacy_id === currentPharmacy.id) {
           loadReceivedPromotions();
           showToast('📢 Nouvelle promotion reçue !', 'info');
           playNotificationSound();
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visit_requests' }, (payload) => {
        if (currentPharmacy && payload.new.pharmacy_id === currentPharmacy.id) {
           loadReceivedVisits();
           showToast('📅 Nouvelle demande de visite !', 'info');
           playNotificationSound();
        }
      })
      .subscribe();
  }"""

content = re.sub(
    r"  function subscribeToRealTimeRequests\(\) \{.*?\)\s*\.subscribe\(\);\s*\}",
    repl,
    content,
    flags=re.DOTALL
)

open('js/pharmacien.js', 'w', encoding='utf-8').write(content)
print("pharmacien.js real-time patched")
