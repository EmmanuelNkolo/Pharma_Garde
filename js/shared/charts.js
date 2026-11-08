/**
 * Pharma-Garde — Module Partagé : Graphiques & Statistiques Visuelles (Chart.js Dark Pro)
 * Utilisé par les espaces Délégué Médical, Pharmacie d'Officine et Grossiste-Répartiteur.
 * Expose : window.PGCharts
 */
(function (window) {
  'use strict';

  const instances = {};

  const PALETTE = {
    emerald: '#10b981',
    emeraldBg: 'rgba(16, 185, 129, 0.22)',
    amber: '#fbbf24',
    amberBg: 'rgba(251, 191, 36, 0.22)',
    blue: '#3b82f6',
    blueBg: 'rgba(59, 130, 246, 0.22)',
    purple: '#a855f7',
    purpleBg: 'rgba(168, 85, 247, 0.22)',
    red: '#ef4444',
    redBg: 'rgba(239, 68, 68, 0.22)',
    cyan: '#06b6d4',
    cyanBg: 'rgba(6, 182, 212, 0.22)',
    grid: 'rgba(255, 255, 255, 0.06)',
    text: '#94a3b8'
  };

  function destroyChart(canvasId) {
    if (instances[canvasId]) {
      try { instances[canvasId].destroy(); } catch (e) {}
      delete instances[canvasId];
    }
  }

  function ensureCanvas(canvasOrId) {
    return typeof canvasOrId === 'string'
      ? document.getElementById(canvasOrId)
      : canvasOrId;
  }

  /**
   * Courbe ou Histogramme d'évolution (Commandes, Visites, Demandes, Chiffre d'affaires)
   * Accepte soit (canvasId, configObj) soit (canvasId, labelsArray, datasetsArray, typeStr)
   */
  function renderTrendChart(canvasId, configOrLabels, maybeDatasets, maybeType) {
    const canvas = ensureCanvas(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;

    destroyChart(canvasId);
    const cfg = Array.isArray(configOrLabels)
      ? { labels: configOrLabels, datasets: maybeDatasets || [], type: maybeType || 'line' }
      : (configOrLabels || {});
    const labels = cfg.labels || ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const datasets = (cfg.datasets || []).map((ds, idx) => {
      const colors = [
        { border: PALETTE.emerald, bg: PALETTE.emeraldBg },
        { border: PALETTE.amber, bg: PALETTE.amberBg },
        { border: PALETTE.blue, bg: PALETTE.blueBg },
        { border: PALETTE.purple, bg: PALETTE.purpleBg }
      ];
      const c = colors[idx % colors.length];
      return {
        label: ds.label || `Série ${idx + 1}`,
        data: ds.data || [],
        borderColor: ds.color || c.border,
        backgroundColor: ds.bgColor || c.bg,
        borderWidth: 2.5,
        tension: 0.35,
        fill: ds.fill !== false,
        borderRadius: cfg.type === 'bar' ? 6 : 0,
        pointRadius: 3.5,
        pointHoverRadius: 6
      };
    });

    instances[canvasId] = new Chart(canvas.getContext('2d'), {
      type: cfg.type || 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: datasets.length > 1 || Boolean(cfg.showLegend),
            labels: { color: '#cbd5e1', font: { size: 11, weight: '600' }, boxWidth: 12 }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#fbbf24',
            bodyColor: '#f8fafc',
            borderColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1,
            padding: 10
          }
        },
        scales: {
          x: {
            grid: { color: PALETTE.grid },
            ticks: { color: PALETTE.text, font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: PALETTE.grid },
            ticks: { color: PALETTE.text, font: { size: 11 }, precision: 0 }
          }
        }
      }
    });

    return instances[canvasId];
  }

  /**
   * Camembert / Anneau de répartition (Statuts de commandes, Taux de réponse, Assurances)
   * Accepte soit (canvasId, configObj) soit (canvasId, labelsArray, dataArray, colorsArray)
   */
  function renderDistributionChart(canvasId, configOrLabels, maybeData, maybeColors) {
    const canvas = ensureCanvas(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;

    destroyChart(canvasId);
    const cfg = Array.isArray(configOrLabels)
      ? { labels: configOrLabels, data: maybeData || [], colors: maybeColors }
      : (configOrLabels || {});
    const labels = cfg.labels || ['Confirmé', 'En attente', 'Rupture / Refusé'];
    const data = cfg.data || [65, 25, 10];
    const colors = cfg.colors || [
      PALETTE.emerald,
      PALETTE.amber,
      PALETTE.blue,
      PALETTE.purple,
      PALETTE.red,
      PALETTE.cyan
    ];

    instances[canvasId] = new Chart(canvas.getContext('2d'), {
      type: cfg.type || 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: '#0f172a',
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: cfg.type === 'pie' ? '0%' : '64%',
        plugins: {
          legend: {
            position: cfg.legendPosition || 'bottom',
            labels: { color: '#cbd5e1', font: { size: 11, weight: '600' }, padding: 12, boxWidth: 12 }
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#fbbf24',
            bodyColor: '#f8fafc',
            borderColor: 'rgba(255,255,255,0.12)',
            borderWidth: 1
          }
        }
      }
    });

    return instances[canvasId];
  }

  /**
   * Barres horizontales (Top médicaments commandés / sollicités, Top laboratoires)
   * Accepte soit (canvasId, configObj) soit (canvasId, labelsArray, dataArray, labelStr)
   */
  function renderHorizontalBarChart(canvasId, configOrLabels, maybeData, maybeLabel) {
    const canvas = ensureCanvas(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;

    destroyChart(canvasId);
    const cfg = Array.isArray(configOrLabels)
      ? { labels: configOrLabels, data: maybeData || [], label: maybeLabel || 'Volume' }
      : (configOrLabels || {});
    const labels = cfg.labels || [];
    const data = cfg.data || [];

    instances[canvasId] = new Chart(canvas.getContext('2d'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: cfg.label || 'Volume',
          data,
          backgroundColor: cfg.color || 'rgba(16, 185, 129, 0.75)',
          borderColor: cfg.borderColor || PALETTE.emerald,
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            titleColor: '#fbbf24',
            bodyColor: '#f8fafc'
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: PALETTE.grid },
            ticks: { color: PALETTE.text, font: { size: 11 }, precision: 0 }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#e2e8f0', font: { size: 11, weight: '600' } }
          }
        }
      }
    });

    return instances[canvasId];
  }

  window.PGCharts = {
    PALETTE,
    destroyChart,
    renderTrendChart,
    renderDistributionChart,
    renderHorizontalBarChart
  };
})(window);

