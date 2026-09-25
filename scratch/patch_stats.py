import re

html = """
        <div id="panel-stats" class="sheet-panel" style="display: none;">
          <div class="stats-header-premium" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <h3 style="font-size: 20px; font-weight: 700; color: var(--green-400); margin: 0;">Statistiques Détaillées</h3>
            <button id="btn-download-report" class="btn btn-primary" style="font-size: 14px; display: flex; align-items: center; gap: 8px; border-radius: 8px; padding: 8px 16px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Rapport PDF
            </button>
          </div>

          <!-- Situation des demandes du délégué medical -->
          <h4 style="font-size: 15px; font-weight: 600; color: var(--dark-200); margin-bottom: 12px; margin-top: 24px; border-bottom: 1px solid var(--glass-border); padding-bottom: 8px;">Situation de vos demandes</h4>
          <div class="stats-grid-delegate">
            <div class="stat-card-delegate"><div class="mini-stat-value" id="stat-promos-sent">0</div><div class="mini-stat-label">Promotions envoyées</div></div>
            <div class="stat-card-delegate"><div class="mini-stat-value" id="stat-visits">0</div><div class="mini-stat-label">Visites programmées</div></div>
            <div class="stat-card-delegate"><div class="mini-stat-value" id="stat-pharmacies-covered">0</div><div class="mini-stat-label">Pharmacies ciblées</div></div>
            <div class="stat-card-delegate"><div class="mini-stat-value" id="stat-labs-active">0</div><div class="mini-stat-label">Laboratoires actifs</div></div>
          </div>

          <div class="stats-layout-premium" style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px;">
            
            <!-- Situation des reponses des pharmacie -->
            <div class="stat-premium-box" style="background: var(--dark-800); border: 1px solid var(--glass-border); border-radius: 12px; padding: 20px;">
              <h4 style="font-size: 15px; font-weight: 600; color: var(--dark-200); margin-bottom: 16px;">Situation des réponses des pharmacies</h4>
              <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
                <div style="text-align: center;"><div id="stat-promos-read" style="font-size:24px; font-weight:bold; color:var(--blue-400);">0</div><div style="font-size:12px; color:var(--dark-400);">Lues</div></div>
                <div style="text-align: center;"><div id="stat-promos-interested" style="font-size:24px; font-weight:bold; color:var(--green-400);">0</div><div style="font-size:12px; color:var(--dark-400);">Intéressées</div></div>
                <div style="text-align: center;"><div id="stat-promos-ignored" style="font-size:24px; font-weight:bold; color:var(--dark-400);">0</div><div style="font-size:12px; color:var(--dark-400);">Ignorées</div></div>
              </div>
              <div style="width: 100%; height: 200px;">
                <canvas id="delegate-chart"></canvas>
              </div>
            </div>

            <!-- Situation des commandes des pharmacies -->
            <div class="stat-premium-box" style="background: var(--dark-800); border: 1px solid var(--glass-border); border-radius: 12px; padding: 20px;">
              <h4 style="font-size: 15px; font-weight: 600; color: var(--dark-200); margin-bottom: 16px;">Situation des commandes (Estimations)</h4>
              <div class="commands-stats">
                <div style="display: flex; justify-content: space-between; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--glass-border);">
                  <span style="color:var(--dark-300);">Commandes générées</span> <strong style="color:var(--green-400); font-size:18px;">0</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--glass-border);">
                  <span style="color:var(--dark-300);">Pharmacies en rupture</span> <strong style="color:var(--red-400); font-size:18px;">0</strong>
                </div>
                <div style="display: flex; justify-content: space-between;">
                  <span style="color:var(--dark-300);">Chiffre d'Affaires Potentiel</span> <strong style="color:var(--orange-400); font-size:18px;">0 XAF</strong>
                </div>
              </div>
            </div>

            <!-- Situation des promotions par médicament -->
            <div class="stat-premium-box" style="background: var(--dark-800); border: 1px solid var(--glass-border); border-radius: 12px; padding: 20px;">
              <h4 style="font-size: 15px; font-weight: 600; color: var(--dark-200); margin-bottom: 16px;">Promotions par médicament</h4>
              <div id="med-stats-list" style="color:var(--dark-400); font-size:13px; max-height: 200px; overflow-y: auto;">
                <div style="text-align: center; padding: 20px;">Aucune donnée disponible.</div>
              </div>
            </div>

            <!-- Situation des promotions par laboratoire -->
            <div class="stat-premium-box" style="background: var(--dark-800); border: 1px solid var(--glass-border); border-radius: 12px; padding: 20px;">
              <h4 style="font-size: 15px; font-weight: 600; color: var(--dark-200); margin-bottom: 16px;">Promotions par laboratoire</h4>
              <div id="lab-stats-list" style="color:var(--dark-400); font-size:13px; max-height: 200px; overflow-y: auto;">
                <div style="text-align: center; padding: 20px;">Aucune donnée disponible.</div>
              </div>
            </div>
          </div>

          <!-- Report Generation -->
          <div id="lab-report-section" style="margin-top: 24px; background: linear-gradient(145deg, var(--dark-800), var(--dark-900)); border: 1px solid var(--glass-border); border-radius: 12px; padding: 20px;">
            <h4 style="font-size: 15px; font-weight: 600; color: var(--dark-200); margin-bottom: 16px;">Générer un rapport avancé</h4>
            <div style="display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
              <select id="report-lab" class="input-field" style="flex: 1; min-width: 200px;"><option value="">— Sélectionner un laboratoire —</option></select>
              <input type="date" id="report-from" class="input-field" style="flex: 1; min-width: 150px;">
              <input type="date" id="report-to" class="input-field" style="flex: 1; min-width: 150px;">
            </div>
            <button id="btn-generate-report" class="btn btn-primary" style="width: 100%; font-size: 15px; font-weight: 600; border-radius: 8px; padding: 12px;">📊 Générer le Rapport Complet</button>
          </div>
        </div>

        <!-- Logout / Settings at bottom -->
"""

content = open('delegue.html', 'r', encoding='utf-8').read()
content = re.sub(r'<div id="panel-stats".*?<!-- Logout / Settings at bottom -->', html, content, flags=re.DOTALL)
open('delegue.html', 'w', encoding='utf-8').write(content)
