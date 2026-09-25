import re

content = open('js/delegue.js', 'r', encoding='utf-8').read()

repl_str = """  async function loadStats() {
    if (!currentDelegate) return;

    try {
      // 1. Fetch Promos
      const { data: promos } = await supabase
        .from('delegate_promotions').select('*').eq('delegate_id', currentDelegate.id);
      const promoIds = (promos || []).map(p => p.id);

      let targets = [];
      if (promoIds.length > 0) {
        const { data } = await supabase.from('promotion_targets').select('*, pharmacy:pharmacy_id(name)').in('promotion_id', promoIds);
        targets = data || [];
      }

      // 2. Fetch Visits
      const { data: visits } = await supabase
        .from('visit_requests').select('*').eq('delegate_id', currentDelegate.id);

      // --- STATS SUMMARY ---
      const setVal = (id, val) => { const el = $(id); if (el) el.textContent = val; };
      setVal('stat-promos-sent', targets.length);
      setVal('stat-visits', (visits || []).length);
      setVal('stat-pharmacies-covered', new Set(targets.map(t => t.pharmacy_id)).size);
      setVal('stat-labs-active', sessionLabs.length);

      const readCount = targets.filter(t => t.status !== 'sent').length;
      const interestedCount = targets.filter(t => t.status === 'interested').length;
      const ignoredCount = targets.filter(t => t.status === 'ignored').length;

      setVal('stat-promos-read', readCount);
      setVal('stat-promos-interested', interestedCount);
      const ignEl = $('stat-promos-ignored');
      if (ignEl) ignEl.textContent = ignoredCount;

      // --- CHART ---
      renderStatsChart(targets);

      // --- PAR MEDICAMENT & PAR LABORATOIRE ---
      const medStats = {};
      const labStats = {};
      
      promos.forEach(p => {
        const myTargets = targets.filter(t => t.promotion_id === p.id);
        const interested = myTargets.filter(t => t.status === 'interested').length;
        
        // Med
        if (!medStats[p.med_name]) medStats[p.med_name] = { sent: 0, interested: 0 };
        medStats[p.med_name].sent += myTargets.length;
        medStats[p.med_name].interested += interested;

        // Lab
        if (!labStats[p.laboratory]) labStats[p.laboratory] = { sent: 0, interested: 0 };
        labStats[p.laboratory].sent += myTargets.length;
        labStats[p.laboratory].interested += interested;
      });

      // Render Med List
      const medListEl = $('med-stats-list');
      if (medListEl) {
        const medHtml = Object.entries(medStats).sort((a,b) => b[1].interested - a[1].interested).map(([med, s]) => `
          <div style="display:flex; justify-content:space-between; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--glass-border);">
            <strong style="color:var(--dark-200);">${escapeHtml(med)}</strong>
            <span style="color:var(--green-400); font-weight:600;">${s.interested} intéressées / ${s.sent}</span>
          </div>
        `).join('');
        medListEl.innerHTML = medHtml || '<div style="text-align:center; padding:20px;">Aucune donnée.</div>';
      }

      // Render Lab List
      const labListEl = $('lab-stats-list');
      if (labListEl) {
        const labHtml = Object.entries(labStats).sort((a,b) => b[1].interested - a[1].interested).map(([lab, s]) => `
          <div style="display:flex; justify-content:space-between; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--glass-border);">
            <strong style="color:var(--dark-200);">${escapeHtml(lab)}</strong>
            <span style="color:var(--blue-400); font-weight:600;">${s.sent} cibles | ${s.interested} retours positifs</span>
          </div>
        `).join('');
        labListEl.innerHTML = labHtml || '<div style="text-align:center; padding:20px;">Aucune donnée.</div>';
      }

      // Populate lab report dropdown
      populateLabSelect('report-lab');
    } catch (err) {
      console.error('Load stats error:', err);
    }
  }

  function renderStatsChart(targets) {
    const ctx = $('delegate-chart');
    if (!ctx) return;

    const counts = { sent: 0, read: 0, interested: 0, already_stocked: 0, ignored: 0 };
    if(targets) {
        targets.forEach(t => { if (counts[t.status] !== undefined) counts[t.status]++; });
    }

    if (statsChart) statsChart.destroy();
    statsChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Envoyées', 'Lues', 'Intéressées', 'Déjà en stock', 'Ignorées'],
        datasets: [{
          data: [counts.sent, counts.read, counts.interested, counts.already_stocked, counts.ignored],
          backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#6b7280'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 12 } } },
        },
      },
    });
  }"""

content = re.sub(
    r'  async function loadStats\(\) \{.*?(?=  // ═══════════════════════════════════════════════════════)',
    repl_str + '\n\n',
    content,
    flags=re.DOTALL
)

open('js/delegue.js', 'w', encoding='utf-8').write(content)
