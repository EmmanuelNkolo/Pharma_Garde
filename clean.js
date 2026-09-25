const fs = require('fs');
let code = fs.readFileSync('js/delegue.js', 'utf8');

const newEnd = \
async function loadPharmacies() {
  try {
    const { data: pharmacies, error } = await supabase.from('pharmacies').select('*').eq('is_active', true);
    if (error) throw error;

    const list = document.getElementById('pharmacy-list');
    if(list) list.innerHTML = '';

    // Clear map markers
    if (typeof pharmacyMarkers !== 'undefined' && pharmacyMarkers) {
      pharmacyMarkers.forEach(m => m.remove());
      pharmacyMarkers = [];
    }

    let visiblePharmacies = 0;

    pharmacies.forEach(pharm => {
      if (pharm.lat && pharm.lng) {
        const dist = haversine(currentDelegateLat, currentDelegateLng, pharm.lat, pharm.lng);
        if (dist <= currentDelegateRadius) {
          visiblePharmacies++;
          // Add to list
          if (list) {
            const item = document.createElement('div');
            item.className = 'pharmacy-card';
            item.style = 'padding: 12px; border-bottom: 1px solid var(--glass-border);';
            item.innerHTML = \\\
              <div style="font-weight: 600; color: var(--green-500);">🏥 \ <span style="font-size: 12px; color: var(--gold-400); font-weight: normal;">(\ km)</span></div>
              <div style="font-size: 13px; color: var(--dark-300); margin-top: 4px;">📍 \ - \</div>
              <div style="margin-top: 8px;">
                <button class="btn btn-outline btn-sm" style="color: var(--green-400); border-color: var(--green-400);" onclick="proposePromotion('\', '\')">Envoyer offre</button>
              </div>
            \\\;
            list.appendChild(item);
          }

          // Add to map
          if (delegateMap) {
            const marker = L.marker([pharm.lat, pharm.lng]).addTo(delegateMap);
            marker.bindPopup(\\\<strong>\</strong><br>\\\\);
            pharmacyMarkers.push(marker);
          }
        }
      }
    });

    if (visiblePharmacies === 0 && list) {
      list.innerHTML = '<p style="color: var(--dark-400); text-align: center; padding: 20px;">Aucune pharmacie dans ce rayon.</p>';
    }

  } catch (err) {
    console.error(err);
  }
}

// ════════════════════════════════════════════════════════
//  PROMOTIONS
// ════════════════════════════════════════════════════════
async function loadPromotions() {
  if (!currentDelegate) return;
  try {
    const { data: promos, error } = await supabase
      .from('delegate_promotions')
      .select('*')
      .eq('delegate_id', currentDelegate.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    console.log('Promotions loaded:', promos);
  } catch (err) {
    console.error(err);
  }
}

async function handleSavePromo() {
  const name = document.getElementById('promo-name').value.trim();
  const type = document.getElementById('promo-type').value;
  const desc = document.getElementById('promo-desc').value.trim();
  const doc = document.getElementById('promo-doc').value.trim();

  if (!name) {
    return showToast('Le nom du produit est requis.', 'error');
  }

  const btn = document.getElementById('btn-save-promo');
  btn.disabled = true;
  btn.textContent = 'Enregistrement...';

  try {
    const { error } = await supabase.from('delegate_promotions').insert([{
      delegate_id: currentDelegate.id,
      product_name: name,
      product_type: type,
      description: desc,
      document_url: doc || null
    }]);

    if (error) throw error;

    showToast('Promotion créée !', 'success');
    document.getElementById('new-promo-modal').classList.remove('active');
    document.getElementById('promo-name').value = '';
    document.getElementById('promo-desc').value = '';
    document.getElementById('promo-doc').value = '';
    loadPromotions();

  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
  }
}

// ════════════════════════════════════════════════════════
//  INTERACTIONS
// ════════════════════════════════════════════════════════
async function loadInteractions() {
  if (!currentDelegate) return;
  try {
    const { data: interactions, error } = await supabase
      .from('delegate_interactions')
      .select('*, pharmacies(name)')
      .eq('delegate_id', currentDelegate.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    console.log('Interactions loaded:', interactions);
  } catch (err) {
    console.error(err);
  }
}

window.proposePromotion = async function(pharmacyId, pharmName) {
  try {
    const { data: promos } = await supabase
      .from('delegate_promotions')
      .select('*')
      .eq('delegate_id', currentDelegate.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!promos || promos.length === 0) {
      return showToast("Créez d'abord une promotion active.", 'error');
    }

    const promo = promos[0];

    if (confirm(\\\Proposer le produit "\" à la pharmacie \ ?\\\)) {
      const { error } = await supabase.from('delegate_interactions').insert([{
        delegate_id: currentDelegate.id,
        pharmacy_id: pharmacyId,
        interaction_type: promo.product_name,
        notes: promo.description,
        related_promotion_id: promo.id
      }]);

      if (error) throw error;
      showToast('Offre envoyée avec succès !', 'success');
      loadInteractions();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.broadcastPromotion = async function() {
  try {
    const btn = document.getElementById('btn-broadcast');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Diffusion en cours...';
    }

    // Get active promotion
    const { data: promos } = await supabase
      .from('delegate_promotions')
      .select('*')
      .eq('delegate_id', currentDelegate.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (!promos || promos.length === 0) {
      if (btn) { btn.disabled = false; btn.textContent = 'Diffuser à toutes les pharmacies'; }
      return showToast("Créez d'abord une promotion active.", 'error');
    }
    const promo = promos[0];

    // Get all pharmacies in radius
    const { data: pharmacies } = await supabase.from('pharmacies').select('*').eq('is_active', true);
    
    let targetPharmacies = [];
    pharmacies.forEach(pharm => {
      if (pharm.lat && pharm.lng) {
        const dist = haversine(currentDelegateLat, currentDelegateLng, pharm.lat, pharm.lng);
        if (dist <= currentDelegateRadius) {
          targetPharmacies.push(pharm);
        }
      }
    });

    if (targetPharmacies.length === 0) {
      if (btn) { btn.disabled = false; btn.textContent = 'Diffuser à toutes les pharmacies'; }
      return showToast('Aucune pharmacie dans ce rayon.', 'info');
    }

    if (!confirm(\\\Diffuser l'offre "\" à \ pharmacies dans un rayon de \km ?\\\)) {
      if (btn) { btn.disabled = false; btn.textContent = 'Diffuser à toutes les pharmacies'; }
      return;
    }

    // Insert all interactions
    const inserts = targetPharmacies.map(p => ({
      delegate_id: currentDelegate.id,
      pharmacy_id: p.id,
      interaction_type: promo.product_name,
      notes: promo.description,
      related_promotion_id: promo.id
    }));

    const { error } = await supabase.from('delegate_interactions').insert(inserts);
    if (error) throw error;

    showToast(\\\Diffusé avec succès à \ pharmacies !\\\, 'success');
    loadInteractions();
    
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = \\\<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg> Diffuser à toutes les pharmacies\\\;
    }

  } catch (err) {
    console.error(err);
    showToast('Erreur lors de la diffusion.', 'error');
    const btn = document.getElementById('btn-broadcast');
    if (btn) { btn.disabled = false; btn.textContent = 'Diffuser à toutes les pharmacies'; }
  }
};

window.confirmVisit = async function(interactionId) {
  try {
    const { error } = await supabase
      .from('delegate_interactions')
      .update({ status: 'visit_confirmed' })
      .eq('id', interactionId);

    if (error) throw error;
    showToast('Rendez-vous confirmé !', 'success');
    loadInteractions();
  } catch (err) {
    console.error(err);
    showToast('Erreur lors de la confirmation.', 'error');
  }
};
\

let parts = code.split('async function loadPharmacies() {');
let newCode = parts[0] + newEnd;

fs.writeFileSync('js/delegue.js', newCode);
console.log('js/delegue.js cleaned up and updated successfully');
