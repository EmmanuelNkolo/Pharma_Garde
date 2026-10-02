import re

content = open('js/delegue.js', 'r', encoding='utf-8').read()

bind_repl = """      bindClick('btn-cancel-promo', () => {
        $('new-promo-modal').classList.remove('active');
        $('promo-specific-container').style.display = 'none';
        $('promo-buttons-container').style.display = 'flex';
      });
      bindClick('btn-save-promo-all', () => handleSavePromotion('all'));
      bindClick('btn-save-promo-specific', () => {
          if (!pharmaciesInRadius || pharmaciesInRadius.length === 0) {
              return showToast('❌ Aucune pharmacie dans le rayon. Veuillez d\\'abord détecter votre position.', 'error');
          }
          $('promo-buttons-container').style.display = 'none';
          $('promo-specific-container').style.display = 'flex';
          const select = $('promo-specific-pharmacy');
          select.innerHTML = '<option value="">— Sélectionner une pharmacie —</option>' + 
              pharmaciesInRadius.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
      });
      bindClick('btn-cancel-specific', () => {
          $('promo-specific-container').style.display = 'none';
          $('promo-buttons-container').style.display = 'flex';
      });
      bindClick('btn-save-promo-specific-confirm', () => handleSavePromotion('specific'));"""

content = re.sub(
    r"      bindClick\('btn-cancel-promo',.*?bindClick\('btn-save-promo-specific', \(\) => handleSavePromotion\('specific'\)\);",
    bind_repl,
    content,
    flags=re.DOTALL
)


func_repl = """  async function handleSavePromotion(targetType) {
    if (!pharmaciesInRadius || pharmaciesInRadius.length === 0) {
       return showToast('❌ Aucune pharmacie dans le rayon. Veuillez d\\'abord détecter votre position.', 'error');
    }

    const lab = ($('promo-lab') || {}).value;
    const name = ($('promo-name') || {}).value?.trim();
    const type = ($('promo-type') || {}).value;
    const desc = ($('promo-desc') || {}).value?.trim();
    const doc = ($('promo-doc') || {}).value?.trim();

    if (!name) return showToast('Veuillez saisir le nom du produit.', 'error');
    if (!lab) return showToast('Veuillez sélectionner un laboratoire.', 'error');

    let specificPharmacyId = null;
    if (targetType === 'specific') {
       specificPharmacyId = $('promo-specific-pharmacy').value;
       if (!specificPharmacyId) return showToast('Veuillez sélectionner une pharmacie.', 'error');
    }

    const btn = targetType === 'all' ? $('btn-save-promo-all') : $('btn-save-promo-specific-confirm');
    const oldText = btn.textContent;
    btn.disabled = true; btn.textContent = 'Traitement...';

    try {
      const { data: newPromo, error } = await supabase.from('delegate_promotions').insert([{
        delegate_id: currentDelegate.id,
        lab_name: lab,
        product_name: name,
        product_type: type,
        description: desc || null,
        document_url: doc || null,
      }]).select().single();
      if (error) throw error;

      if (targetType === 'all') {
        const targetsToInsert = pharmaciesInRadius.map(p => ({
          promotion_id: newPromo.id,
          pharmacy_id: p.id,
        }));
        const { error: targetErr } = await supabase.from('promotion_targets').insert(targetsToInsert);
        if (targetErr) throw targetErr;
        showToast('✅ Diffusée à toutes les pharmacies dans le rayon !', 'success');
      } 
      else if (targetType === 'specific') {
        const { error: targetErr } = await supabase.from('promotion_targets').insert([{
          promotion_id: newPromo.id,
          pharmacy_id: specificPharmacyId,
        }]);
        if (targetErr) throw targetErr;
        showToast('✅ Envoyée à la pharmacie sélectionnée !', 'success');
      }

      // Clear form & close modal
      $('new-promo-modal').classList.remove('active');
      ['promo-name', 'promo-desc', 'promo-doc', 'promo-specific-pharmacy'].forEach(id => { const el = $(id); if (el) el.value = ''; });
      $('promo-specific-container').style.display = 'none';
      $('promo-buttons-container').style.display = 'flex';
      
      await loadPromotions();
      await loadStats();
    } catch (err) {
      showToast('❌ Erreur: ' + (err.message || ''), 'error');
    } finally {
      if(btn) { btn.disabled = false; btn.textContent = oldText; }
    }
  }"""

content = re.sub(
    r"  async function handleSavePromotion\(targetType\) \{.*?  // ── Send Promotion to a Pharmacy ───────────────────────",
    func_repl + '\n\n  // ── Send Promotion to a Pharmacy ───────────────────────',
    content,
    flags=re.DOTALL
)

open('js/delegue.js', 'w', encoding='utf-8').write(content)
print("delegue.js patched")
