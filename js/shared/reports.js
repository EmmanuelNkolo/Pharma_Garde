/**
 * Pharma-Garde — Module Partagé : Génération de Rapports Pro PDF & CSV Sécurisés
 * • Export CSV compatible Excel FR (UTF-8 BOM + séparateur `;` + protection anti-injection de formule)
 * • Export PDF professionnel multi-tableaux (via html2pdf.js avec repli impression)
 * Expose : window.PGReports
 */
(function (window) {
  'use strict';

  function esc(val) {
    if (window.PGNetwork && typeof window.PGNetwork.escapeHtml === 'function') {
      return window.PGNetwork.escapeHtml(val);
    }
    if (val === null || val === undefined) return '';
    return String(val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeCsvCell(val) {
    if (window.PGNetwork && typeof window.PGNetwork.sanitizeCsvCell === 'function') {
      return window.PGNetwork.sanitizeCsvCell(val);
    }
    if (val === null || val === undefined) return '';
    let str = String(val).replace(/\r?\n/g, ' ').trim();
    if (/^[=+\-@\t\r]/.test(str) && !/^-\d+(\.\d+)?%?$/.test(str)) {
      str = "'" + str;
    }
    if (str.includes(';') || str.includes('"')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Exporte des données en fichier CSV sécurisé (avec BOM UTF-8 pour Excel)
   * @param {Object} opts { filename, headers: string[], rows: any[][] }
   */
  function exportCSV(opts) {
    const o = opts || {};
    const headers = o.headers || [];
    const rows = o.rows || [];
    const filename = (o.filename || `PharmaGarde_Export_${new Date().toISOString().slice(0, 10)}.csv`)
      .replace(/[^a-zA-Z0-9_.\-]/g, '_');

    const lines = [];
    if (headers.length > 0) {
      lines.push(headers.map(safeCsvCell).join(';'));
    }
    rows.forEach(row => {
      if (Array.isArray(row)) {
        lines.push(row.map(safeCsvCell).join(';'));
      }
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  }

  /**
   * Génère et télécharge un rapport PDF professionnel A4
   * @param {Object} opts {
   *   filename, title, subtitle, entityName, entityCode, periodLabel,
   *   kpis: [{ label, value }],
   *   tables: [{ title, headers: [], rows: [[]] }],
   *   footerNote
   * }
   */
  function exportPDF(opts) {
    const o = opts || {};
    const nowStr = new Date().toLocaleString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const filename = (o.filename || `Rapport_PharmaGarde_${new Date().toISOString().slice(0, 10)}.pdf`)
      .replace(/[^a-zA-Z0-9_.\-]/g, '_');

    const kpisHtml = (o.kpis && o.kpis.length > 0) ? `
      <div style="display:grid;grid-template-columns:repeat(${Math.min(4, o.kpis.length)}, 1fr);gap:10px;margin-bottom:20px;">
        ${o.kpis.map(k => `
          <div style="border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;background:#f8fafc;text-align:center;">
            <div style="font-size:18px;font-weight:800;color:#059669;">${esc(k.value)}</div>
            <div style="font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;margin-top:3px;">${esc(k.label)}</div>
          </div>
        `).join('')}
      </div>
    ` : '';

    const tablesHtml = (o.tables || []).map(tbl => `
      <div style="margin-bottom:20px;page-break-inside:avoid;">
        ${tbl.title ? `<h3 style="font-size:13px;font-weight:800;color:#0f172a;margin:0 0 8px;padding-bottom:4px;border-bottom:2px solid #10b981;text-transform:uppercase;">${esc(tbl.title)}</h3>` : ''}
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <thead>
            <tr style="background:#0f172a;color:#ffffff;">
              ${(tbl.headers || []).map(h => `<th style="padding:7px 8px;text-align:left;border:1px solid #334155;font-weight:700;">${esc(h)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${(tbl.rows && tbl.rows.length > 0) ? tbl.rows.map((r, i) => `
              <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f1f5f9'};">
                ${(r || []).map(cell => `<td style="padding:6px 8px;border:1px solid #cbd5e1;color:#1e293b;">${esc(cell)}</td>`).join('')}
              </tr>
            `).join('') : `
              <tr>
                <td colspan="${(tbl.headers || []).length || 1}" style="padding:12px;text-align:center;color:#64748b;border:1px solid #cbd5e1;">Aucune donnée sur cette période</td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `).join('');

    const htmlString = `
      <div style="font-family:'Inter',Arial,sans-serif;color:#0f172a;background:#ffffff;padding:24px;max-width:780px;margin:0 auto;">
        <!-- Entête Officiel Pharma-Garde -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #059669;padding-bottom:14px;margin-bottom:18px;">
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="display:inline-block;width:18px;height:18px;background:#10b981;border-radius:4px;"></span>
              <span style="font-size:18px;font-weight:900;color:#0f172a;letter-spacing:-0.3px;">PHARMA-GARDE CAMEROUN</span>
            </div>
            <h1 style="font-size:16px;font-weight:800;color:#059669;margin:6px 0 2px;">${esc(o.title || 'RAPPORT D\'ACTIVITÉ PROFESSIONNEL')}</h1>
            <div style="font-size:11px;color:#475569;">${esc(o.subtitle || 'Plateforme Numérique de Santé Publique & Distribution Pharmaceutique')}</div>
          </div>
          <div style="text-align:right;font-size:11px;color:#334155;line-height:1.5;">
            <div><strong>Établissement / Titulaire :</strong> ${esc(o.entityName || 'Pharma-Garde Pro')}</div>
            ${o.entityCode ? `<div><strong>Matricule / Code :</strong> ${esc(o.entityCode)}</div>` : ''}
            <div><strong>Période :</strong> ${esc(o.periodLabel || 'Toutes périodes')}</div>
            <div><strong>Édité le :</strong> ${esc(nowStr)}</div>
          </div>
        </div>

        ${kpisHtml}
        ${tablesHtml}

        <!-- Pied de page -->
        <div style="margin-top:26px;padding-top:10px;border-top:1px solid #cbd5e1;display:flex;justify-content:space-between;font-size:9.5px;color:#64748b;">
          <span>Pharma-Garde v9.0 — Document certifié généré automatiquement</span>
          <span>Assistance Pro : +237 694 929 909 · Capbioconsulting@gmail.com</span>
        </div>
      </div>
    `;

    if (typeof window.html2pdf === 'function') {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;z-index:-1;';
      wrapper.innerHTML = htmlString;
      document.body.appendChild(wrapper);

      window.html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename,
          image: { type: 'jpeg', quality: 0.96 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(wrapper.firstElementChild)
        .save()
        .then(() => wrapper.remove())
        .catch(() => wrapper.remove());
    } else {
      const win = window.open('', '_blank', 'width=880,height=720');
      if (win) {
        win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${esc(o.title || 'Rapport Pharma-Garde')}</title></head><body>${htmlString}<script>window.onload=function(){window.print();}<\/script></body></html>`);
        win.document.close();
      }
    }
    return true;
  }

  window.PGReports = {
    exportCSV,
    exportPDF
  };
})(window);
