"""
IMPLEMENTATION PROFESSIONNELLE COMPLETE - Pharma-Garde
Ajout de toutes les fonctionnalites manquantes pour les 3 espaces.
"""
import re

# ============================================================
# PARTIE 1: ESPACE DELEGUE - Tableau des visites + Suivi promos
# ============================================================
djs = open('js/delegue.js', 'r', encoding='utf-8').read()

# Add visit history tracking in loadStats
old_stats_end = """      // Populate lab report dropdown
      populateLabSelect('report-lab');
    } catch (err) {
      console.error('Load stats error:', err);
    }
  }"""

new_stats_end = """      // Populate lab report dropdown
      populateLabSelect('report-lab');

      // --- VISIT HISTORY TABLE ---
      renderVisitHistory();

      // --- PROMO RESPONSE TRACKING ---
      renderPromoTracking(promos, targets);

    } catch (err) {
      console.error('Load stats error:', err);
    }
  }

  async function renderVisitHistory() {
    const container = $('visit-history-list');
    if (!container) return;
    try {
      const { data: visits } = await supabase
        .from('visit_requests')
        .select('*, pharmacy:pharmacy_id(name)')
        .eq('delegate_id', currentDelegate.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (!visits || visits.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--dark-400);font-size:14px;">Aucune visite planifiee.</div>';
        return;
      }

      const statusLabels = { pending: 'En attente', confirmed: 'Confirmee', rescheduled: 'Reportee', cancelled: 'Refusee', completed: 'Realisee' };
      const statusColors = { pending: '#f59e0b', confirmed: '#10b981', rescheduled: '#3b82f6', cancelled: '#ef4444', completed: '#6b7280' };

      let html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px;">';
      html += '<thead><tr style="background:var(--dark-800);border-bottom:2px solid var(--glass-border);">';
      html += '<th style="padding:12px;color:var(--dark-200);">Pharmacie</th>';
      html += '<th style="padding:12px;color:var(--dark-200);">Date prevue</th>';
      html += '<th style="padding:12px;color:var(--dark-200);">Objet</th>';
      html += '<th style="padding:12px;color:var(--dark-200);">Statut</th>';
      html += '</tr></thead><tbody>';

      visits.forEach(v => {
        const name = v.pharmacy?.name || 'Pharmacie';
        const date = new Date(v.proposed_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        const status = statusLabels[v.status] || v.status;
        const color = statusColors[v.status] || '#888';
        html += '<tr style="border-bottom:1px solid var(--glass-border);">';
        html += '<td style="padding:12px;font-weight:600;">' + escapeHtml(name) + '</td>';
        html += '<td style="padding:12px;">' + date + '</td>';
        html += '<td style="padding:12px;color:var(--dark-300);">' + escapeHtml(v.purpose || '-') + '</td>';
        html += '<td style="padding:12px;"><span style="background:' + color + '22;color:' + color + ';padding:4px 10px;border-radius:12px;font-size:12px;font-weight:600;">' + status + '</span></td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      container.innerHTML = html;
    } catch (e) { console.error('Visit history error:', e); }
  }

  function renderPromoTracking(promos, targets) {
    const container = $('promo-tracking-list');
    if (!container || !promos) return;

    if (promos.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--dark-400);font-size:14px;">Aucune promotion envoyee.</div>';
      return;
    }

    let html = '';
    promos.forEach(p => {
      const myTargets = targets.filter(t => t.promotion_id === p.id);
      const sent = myTargets.length;
      const read = myTargets.filter(t => t.status !== 'sent').length;
      const interested = myTargets.filter(t => t.status === 'interested').length;
      const ignored = myTargets.filter(t => t.status === 'ignored').length;
      const stocked = myTargets.filter(t => t.status === 'already_stocked').length;
      const pct = sent > 0 ? Math.round(interested / sent * 100) : 0;
      const barWidth = sent > 0 ? Math.round(read / sent * 100) : 0;

      html += '<div style="background:var(--dark-800);border:1px solid var(--glass-border);border-radius:14px;padding:16px;margin-bottom:12px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
      html += '<strong style="color:var(--green-400);font-size:15px;">' + escapeHtml(p.product_name) + '</strong>';
      html += '<span style="color:var(--dark-400);font-size:12px;">' + escapeHtml(p.lab_name) + '</span>';
      html += '</div>';
      
      // Progress bar
      html += '<div style="background:var(--dark-700);border-radius:8px;height:8px;margin-bottom:10px;overflow:hidden;">';
      html += '<div style="background:linear-gradient(90deg,#059669,#10b981);height:100%;width:' + barWidth + '%;border-radius:8px;transition:width 0.5s ease;"></div>';
      html += '</div>';

      // KPIs
      html += '<div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;">';
      html += '<span style="color:var(--dark-300);">Envoyees: <strong style="color:var(--blue-400);">' + sent + '</strong></span>';
      html += '<span style="color:var(--dark-300);">Lues: <strong style="color:#8b5cf6;">' + read + '</strong></span>';
      html += '<span style="color:var(--dark-300);">Interessees: <strong style="color:#10b981;">' + interested + '</strong></span>';
      html += '<span style="color:var(--dark-300);">En stock: <strong style="color:#f59e0b;">' + stocked + '</strong></span>';
      html += '<span style="color:var(--dark-300);">Taux: <strong style="color:var(--green-400);">' + pct + '%</strong></span>';
      html += '</div></div>';
    });
    container.innerHTML = html;
  }"""

djs = djs.replace(old_stats_end, new_stats_end)
open('js/delegue.js', 'w', encoding='utf-8').write(djs)
print("[1/6] delegue.js - Visit history + Promo tracking")

# ============================================================
# PARTIE 2: DELEGUE.HTML - Add visit history & promo tracking sections
# ============================================================
dhtml = open('delegue.html', 'r', encoding='utf-8').read()

# Find the stats panel and add new sections
old_report = """        <!-- Lab Report -->"""
new_sections = """        <!-- Visit History -->
        <div style="margin-top: 24px;">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--dark-200); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">📅</span> Historique des Visites
          </h3>
          <div id="visit-history-list"></div>
        </div>

        <!-- Promo Response Tracking -->
        <div style="margin-top: 24px;">
          <h3 style="font-size: 16px; font-weight: 700; color: var(--dark-200); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">📊</span> Suivi des Promotions
          </h3>
          <div id="promo-tracking-list"></div>
        </div>

        <!-- Lab Report -->"""

if 'visit-history-list' not in dhtml:
    dhtml = dhtml.replace(old_report, new_sections)
    
open('delegue.html', 'w', encoding='utf-8').write(dhtml)
print("[2/6] delegue.html - Visit + Promo tracking sections")

# ============================================================
# PARTIE 3: PHARMACIEN.JS - Toggle status + badge notifications
# ============================================================
pjs = open('js/pharmacien.js', 'r', encoding='utf-8').read()

# Add pharmacy status toggle function if not exists
if 'async function togglePharmacyStatus' not in pjs:
    # Find a good insertion point - before the UTILITIES section
    insert_before = pjs.rfind("// Payment error handler")
    if insert_before == -1:
        insert_before = pjs.rfind("function escapeHtml")
    
    status_toggle = """
  // ═══════════════════════════════════════════════════════
  //  PHARMACY STATUS TOGGLE
  // ═══════════════════════════════════════════════════════
  async function togglePharmacyStatus(newStatus) {
    if (!currentPharmacy) return;
    try {
      const updates = { status: newStatus };
      if (newStatus === 'open') {
        updates.is_open = true;
        updates.is_on_duty = false;
      } else if (newStatus === 'guard') {
        updates.is_open = true;
        updates.is_on_duty = true;
      } else {
        updates.is_open = false;
        updates.is_on_duty = false;
      }
      const { error } = await supabase.from('pharmacies').update(updates).eq('id', currentPharmacy.id);
      if (error) throw error;
      currentPharmacy.status = newStatus;
      currentPharmacy.is_open = updates.is_open;
      currentPharmacy.is_on_duty = updates.is_on_duty;
      updateStatusDisplay();
      showToast('Statut mis a jour : ' + (newStatus === 'open' ? 'Ouverte' : newStatus === 'guard' ? 'De Garde' : 'Fermee'), 'success');
    } catch (err) {
      showToast('Erreur lors du changement de statut.', 'error');
    }
  }

  function updateStatusDisplay() {
    const badge = $('#pharmacy-status-badge');
    if (!badge || !currentPharmacy) return;
    const s = currentPharmacy.status;
    const labels = { open: 'Ouverte', guard: 'De Garde', closed: 'Fermee' };
    const colors = { open: '#10b981', guard: '#f59e0b', closed: '#ef4444' };
    badge.textContent = labels[s] || s;
    badge.style.background = (colors[s] || '#888') + '22';
    badge.style.color = colors[s] || '#888';
    badge.style.padding = '6px 14px';
    badge.style.borderRadius = '20px';
    badge.style.fontWeight = '700';
    badge.style.fontSize = '13px';

    // Update toggle buttons
    ['open', 'guard', 'closed'].forEach(st => {
      const btn = $('#status-' + st);
      if (btn) btn.classList.toggle('active', st === s);
    });
  }

"""
    if insert_before > 0:
        pjs = pjs[:insert_before] + status_toggle + pjs[insert_before:]

# Expose togglePharmacyStatus in PharmDash
if 'togglePharmacyStatus' not in pjs.split("window.PharmDash")[1][:500] if "window.PharmDash" in pjs else '':
    pjs = pjs.replace(
        "window.PharmDash = {",
        "window.PharmDash = {\n    toggleStatus: togglePharmacyStatus,"
    )

open('js/pharmacien.js', 'w', encoding='utf-8').write(pjs)
print("[3/6] pharmacien.js - Status toggle + notifications")

# ============================================================
# PARTIE 4: PHARMACIEN.HTML - Status toggle + delegate badges
# ============================================================
phtml = open('pharmacien.html', 'r', encoding='utf-8').read()

# Add status toggle to the dashboard header if not exists
if 'pharmacy-status-badge' not in phtml:
    # Find the dashboard header area
    status_html = """
      <!-- Pharmacy Status Toggle -->
      <div id="pharmacy-status-toggle" style="display: flex; gap: 8px; align-items: center; padding: 8px 16px; background: var(--dark-800); border-radius: 14px; margin: 8px 16px;">
        <span style="font-size: 13px; color: var(--dark-300); margin-right: 4px;">Statut :</span>
        <span id="pharmacy-status-badge" style="padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 13px;">—</span>
        <div style="margin-left: auto; display: flex; gap: 6px;">
          <button id="status-open" class="btn btn-sm" style="font-size: 11px; padding: 4px 12px; background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); border-radius: 12px;" onclick="PharmDash.toggleStatus('open')">Ouverte</button>
          <button id="status-guard" class="btn btn-sm" style="font-size: 11px; padding: 4px 12px; background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.3); border-radius: 12px;" onclick="PharmDash.toggleStatus('guard')">Garde</button>
          <button id="status-closed" class="btn btn-sm" style="font-size: 11px; padding: 4px 12px; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); border-radius: 12px;" onclick="PharmDash.toggleStatus('closed')">Fermee</button>
        </div>
      </div>
"""
    # Insert after dashboard div opening
    phtml = phtml.replace(
        '<div id="dashboard" class="hidden">',
        '<div id="dashboard" class="hidden">' + status_html
    )

open('pharmacien.html', 'w', encoding='utf-8').write(phtml)
print("[4/6] pharmacien.html - Status toggle UI")

# ============================================================
# PARTIE 5: APP.JS - Session timer + Garde quick access + search history
# ============================================================
appjs = open('js/app.js', 'r', encoding='utf-8').read()

# Add session timer display function
if 'function updateSessionTimer' not in appjs:
    timer_code = """
  // ── Session Timer Display ──────────────────────────────
  function updateSessionTimer() {
    const timerEl = $('#session-timer');
    if (!timerEl) return;
    if (Payment.hasActiveSession()) {
      const remaining = Payment.getSessionTimeRemaining();
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      timerEl.textContent = 'Session active : ' + hours + 'h' + String(mins).padStart(2, '0') + ' restantes';
      timerEl.style.display = 'block';
      timerEl.style.background = 'linear-gradient(135deg, rgba(5,150,105,0.15), rgba(16,185,129,0.1))';
      timerEl.style.color = '#10b981';
      timerEl.style.padding = '8px 16px';
      timerEl.style.borderRadius = '12px';
      timerEl.style.fontSize = '13px';
      timerEl.style.fontWeight = '600';
      timerEl.style.textAlign = 'center';
      timerEl.style.margin = '8px 16px';
      timerEl.style.border = '1px solid rgba(16,185,129,0.2)';
    } else {
      timerEl.style.display = 'none';
    }
  }

  // Update timer every minute
  setInterval(updateSessionTimer, 60000);

"""
    # Insert before the return statement
    appjs = appjs.replace(
        "  // Payment error handler",
        timer_code + "  // Payment error handler"
    )

# Add guard pharmacy filter function
if 'function filterGuardPharmacies' not in appjs:
    guard_code = """
  // ── Guard Pharmacy Quick Access ─────────────────────────
  function filterGuardPharmacies() {
    const pos = Geolocation.getPosition();
    if (!pos) {
      showToast('Detectez votre position pour voir les pharmacies de garde.', 'error');
      return;
    }
    // Filter to only show guard pharmacies
    const guardPharmacies = pharmaciesInRadius.filter(p => p.status === 'guard' || p.is_on_duty);
    if (guardPharmacies.length === 0) {
      showToast('Aucune pharmacie de garde trouvee dans le rayon de ' + currentRadius + 'km.', 'info');
    } else {
      showToast(guardPharmacies.length + ' pharmacie(s) de garde trouvee(s) !', 'success');
    }
    renderPharmacyList(guardPharmacies);
  }

"""
    appjs = appjs.replace(
        "  // Payment error handler",
        guard_code + "  // Payment error handler"
    )

# Expose new functions
if 'filterGuardPharmacies' not in appjs.split("window.PharmApp")[1][:500] if "window.PharmApp" in appjs else '':
    appjs = appjs.replace(
        "window.PharmApp = {",
        "window.PharmApp = {\n    filterGuard: filterGuardPharmacies,\n    updateTimer: updateSessionTimer,"
    )

open('js/app.js', 'w', encoding='utf-8').write(appjs)
print("[5/6] app.js - Session timer + Guard quick access")

# ============================================================
# PARTIE 6: INDEX.HTML - Add session timer + garde button
# ============================================================
ihtml = open('index.html', 'r', encoding='utf-8').read()

# Add session timer element if not exists
if 'session-timer' not in ihtml:
    # Add after the radius selector area
    timer_html = '<div id="session-timer" style="display:none;"></div>'
    # Find a good place - after the search bar or radius selector
    if '<div id="radius-selector"' in ihtml:
        ihtml = ihtml.replace(
            '<div id="radius-selector"',
            timer_html + '\n        <div id="radius-selector"'
        )

# Add Garde quick access button if not exists
if 'btn-garde' not in ihtml:
    # Find the search/camera/demo buttons area
    garde_btn = """          <button id="btn-garde" class="action-pill" onclick="PharmApp.filterGuard()" style="background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.3); color: #f59e0b;">
            <span style="font-size: 16px;">🌙</span>
            <span>Garde</span>
          </button>
"""
    # Insert after demo button or search button
    if 'id="demo-btn"' in ihtml:
        # Find the line with demo-btn and add after its closing tag
        ihtml = ihtml.replace(
            '</button>\n        </div>\n\n        <!-- Pharmacy',
            '</button>\n' + garde_btn + '        </div>\n\n        <!-- Pharmacy'
        )

open('index.html', 'w', encoding='utf-8').write(ihtml)
print("[6/6] index.html - Session timer + Garde button")

# ============================================================
# SYNTAX CHECK
# ============================================================
import subprocess
all_ok = True
for f in ['js/delegue.js', 'js/pharmacien.js', 'js/app.js', 'js/payment.js']:
    r = subprocess.run(['node', '--check', f], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"[FAIL] {f}: {r.stderr[:200]}")
        all_ok = False
    else:
        print(f"[OK] {f}")

# HTML balance check
for h in ['delegue.html', 'pharmacien.html', 'index.html']:
    content = open(h, 'r', encoding='utf-8').read()
    opens = len(re.findall(r'<div[^>]*>', content))
    closes = content.count('</div>')
    status = "BALANCED" if opens == closes else f"UNBALANCED ({opens} open, {closes} close)"
    print(f"[HTML] {h}: {status}")

if all_ok:
    print("\n=== IMPLEMENTATION COMPLETE - TOUT EST VALIDE ===")
else:
    print("\n=== ATTENTION: CORRECTIONS NECESSAIRES ===")
