import re

content = open('js/pharmacien.js', 'r', encoding='utf-8').read()

replacement = """  async function loadReceivedPromotions() {
    const container = $('#delegate-promos-list');
    if (!container) return;
    try {
      const { data: targets, error } = await supabase
        .from('promotion_targets')
        .select('*, delegate_promotions(*)')
        .eq('pharmacy_id', currentPharmacy.id)
        .order('sent_at', { ascending: false })
        .limit(50);
      if (error) throw error;

      if (!targets || targets.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📢</div><div class="empty-state-text">Aucune promotion reçue pour le moment.</div></div>';
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
            <th style="padding: 12px; color: var(--dark-200);">Actions / Statut</th>
          </tr>
        </thead>
        <tbody>
      `;

      targets.forEach(t => {
        const promo = t.delegate_promotions || {};
        const statusLabels = { sent: 'Non lue', read: 'Lue', interested: 'Intéressé', already_stocked: 'Déjà en stock', ignored: 'Ignorée' };
        const statusColors = { sent: '#ff3b30', read: '#8b5cf6', interested: '#10b981', already_stocked: '#f59e0b', ignored: '#6b7280' };
        const date = new Date(t.sent_at).toLocaleDateString('fr-FR');
        
        let actionBtns = `<span style="font-size:11px;color:${statusColors[t.status] || '#888'};background:${statusColors[t.status] || '#888'}22;padding:2px 8px;border-radius:12px;display:inline-block;margin-bottom:6px;">${statusLabels[t.status] || t.status}</span><br>`;
        
        if (t.status === 'sent' || t.status === 'read') {
          actionBtns += `
            <div style="display:flex;gap:4px;flex-direction:column;">
              <button class="btn btn-sm btn-primary" onclick="PharmDash.respondPromo('${t.id}','interested')" style="font-size:11px;padding:4px;">✅ Intéressé</button>
              <button class="btn btn-sm btn-outline" onclick="PharmDash.respondPromo('${t.id}','already_stocked')" style="font-size:11px;padding:4px;">📦 Déjà en stock</button>
              <button class="btn btn-sm btn-outline" onclick="PharmDash.respondPromo('${t.id}','ignored')" style="font-size:11px;padding:4px;color:var(--dark-400);">🚫 Ignorer</button>
            </div>
          `;
        }

        html += `
          <tr style="border-bottom: 1px solid var(--glass-border);">
            <td style="padding: 12px;">#${(promo.id || '').split('-')[0].toUpperCase()}</td>
            <td style="padding: 12px;">${date}</td>
            <td style="padding: 12px; font-weight: 600; color: var(--green-400);">${escapeHtml(promo.product_name || 'Produit')}</td>
            <td style="padding: 12px;">${escapeHtml(promo.lab_name || '—')}</td>
            <td style="padding: 12px; color: var(--dark-300);">${escapeHtml(promo.description || '-')}</td>
            <td style="padding: 12px;">${actionBtns}</td>
          </tr>
        `;
      });
      
      html += '</tbody></table></div>';
      container.innerHTML = html;
      
    } catch (err) {
      console.error('Load delegate promos err:', err);
    }
  }"""

# Use regex to replace the old loadReceivedPromotions
content = re.sub(
    r'  async function loadReceivedPromotions\(\) \{.*?(?=  async function handlePromoResponse)',
    replacement + '\n\n',
    content,
    flags=re.DOTALL
)

open('js/pharmacien.js', 'w', encoding='utf-8').write(content)
print("pharmacien.js patched")
