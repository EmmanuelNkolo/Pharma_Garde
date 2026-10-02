import re

content = open('js/delegue.js', 'r', encoding='utf-8').read()

# 1. Update bindClick for promo buttons
content = content.replace("bindClick('btn-save-promo', handleSavePromotion);", """bindClick('btn-save-promo-all', () => handleSavePromotion('all'));
    bindClick('btn-save-promo-specific', () => handleSavePromotion('specific'));""")

# 2. Rewrite loadPromotions, renderPromotionsList, handleSavePromotion
replacement = """  async function loadPromotions() {
    if (!currentDelegate) return;
    try {
      const { data: promos, error } = await supabase
        .from('delegate_promotions')
        .select(`
          *,
          promotion_targets (
            pharmacy:pharmacies ( name )
          )
        `)
        .eq('delegate_id', currentDelegate.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      myPromotions = promos || [];
      renderPromotionsList();
    } catch (err) {
      console.error('Load promotions error:', err);
    }
  }

  function renderPromotionsList() {
    const container = $('promotions-list');
    if (!container) return;

    if (myPromotions.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:40px 16px;color:var(--dark-400);">Aucune promotion.<br>Créez votre première campagne !</div>';
      return;
    }

    let html = `
      <div style="overflow-x: auto;">
      <table style="width:100%; border-collapse: collapse; text-align: left; font-size: 13px;">
        <thead>
          <tr style="background: var(--dark-800); border-bottom: 2px solid var(--glass-border);">
            <th style="padding: 12px; color: var(--dark-200);">Identité Promo</th>
            <th style="padding: 12px; color: var(--dark-200);">Date</th>
            <th style="padding: 12px; color: var(--dark-200);">Nom Produit</th>
            <th style="padding: 12px; color: var(--dark-200);">Laboratoire</th>
            <th style="padding: 12px; color: var(--dark-200);">Description</th>
            <th style="padding: 12px; color: var(--dark-200);">Pharmacies (Diffusion)</th>
          </tr>
        </thead>
        <tbody>
    `;

    myPromotions.forEach(p => {
      const date = new Date(p.created_at).toLocaleDateString('fr-FR');
      const pharmaciesList = (p.promotion_targets || [])
        .map(t => t.pharmacy?.name)
        .filter(n => n)
        .join(', ');
      
      html += `
        <tr style="border-bottom: 1px solid var(--glass-border);">
          <td style="padding: 12px;">#${p.id.split('-')[0].toUpperCase()}</td>
          <td style="padding: 12px;">${date}</td>
          <td style="padding: 12px; font-weight: 600; color: var(--green-400);">${escapeHtml(p.product_name)}</td>
          <td style="padding: 12px;">${escapeHtml(p.lab_name)}</td>
          <td style="padding: 12px; color: var(--dark-300);">${escapeHtml(p.description || '-')}</td>
          <td style="padding: 12px; font-size:12px;">${escapeHtml(pharmaciesList) || '-'}</td>
        </tr>
      `;
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  async function handleSavePromotion(targetType) {
    const lab = ($('promo-lab') || {}).value;
    const name = ($('promo-name') || {}).value?.trim();
    const type = ($('promo-type') || {}).value;
    const desc = ($('promo-desc') || {}).value?.trim();
    const doc = ($('promo-doc') || {}).value?.trim();

    if (!name) return showToast('Veuillez saisir le nom du produit.', 'error');
    if (!lab) return showToast('Veuillez sélectionner un laboratoire.', 'error');

    const btn = targetType === 'all' ? $('btn-save-promo-all') : $('btn-save-promo-specific');
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

      showToast('✅ Promotion enregistrée !', 'success');
      $('new-promo-modal').classList.remove('active');
      
      // If targeting 'all' pharmacies in radius
      if (targetType === 'all' && pharmaciesInRadius.length > 0) {
        const targetsToInsert = pharmaciesInRadius.map(p => ({
          promotion_id: newPromo.id,
          pharmacy_id: p.id,
        }));
        await supabase.from('promotion_targets').insert(targetsToInsert);
        showToast('✅ Diffusée à toutes les pharmacies dans le rayon !', 'success');
      } 
      else if (targetType === 'specific') {
         switchPanel('pharmacies');
         showToast('ℹ️ Veuillez cliquer sur "📤 Envoyer Promo" sur la pharmacie ciblée.', 'info');
      }

      // Clear form
      ['promo-name', 'promo-desc', 'promo-doc'].forEach(id => { const el = $(id); if (el) el.value = ''; });
      
      await loadPromotions();
      await loadStats();
    } catch (err) {
      showToast('❌ Erreur: ' + (err.message || ''), 'error');
    } finally {
      if(btn) { btn.disabled = false; btn.textContent = oldText; }
    }
  }"""

content = re.sub(
    r'  async function loadPromotions\(\).*?// ── Send Promotion to a Pharmacy ───────────────────────',
    replacement + '\n\n  // ── Send Promotion to a Pharmacy ───────────────────────',
    content,
    flags=re.DOTALL
)

open('js/delegue.js', 'w', encoding='utf-8').write(content)
print("delegue.js promo logic patched")
