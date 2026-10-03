import re

def fix_app_js():
    with open('js/app.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Delete the duplicate OCR logic at the end of the file
    old_ocr = '''  // ── OCR Ordonnance ──
  function openOCRModal() {
    const input = $('#ocr-camera-input');
    if (input) {
      input.onchange = handleOCRImage;
      input.click();
    }
  }

  async function handleOCRImage(e) {
    const file = e.target.files[0];
    if (!file) return;

    showToast("Analysant l'ordonnance... Veuillez patienter.", 'info');
    
    try {
      if (!window.Tesseract) {
        showToast("Erreur: Tesseract non chargé", "error");
        return;
      }
      const result = await Tesseract.recognize(file, 'fra');
      const text = result.data.text;
      
      const lines = text.split('\\n').map(l => l.trim()).filter(l => l.length > 3);
      if (lines.length > 0) {
        selectedMedicines = [...new Set([...selectedMedicines, ...lines])];
        showToast('✅ Ordonnance scannée', 'success');
        updateSelectedList();
        openSearchModal();
      } else {
        showToast('❌ Aucun médicament détecté', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('❌ Erreur lors de l\'analyse', 'error');
    }
  }'''

    content = content.replace(old_ocr, "")

    # 2. Check updatePharmacies rendering. Ensure `renderPharmacyList` is called
    old_update = '''    // Update map markers
    addPharmacyMarkers(displayPharmacies, (pharm) => {
      // Zoom on marker
      leafletMap.flyTo([pharm.lat, pharm.lng], 16, { animate: true, duration: 1 });
      highlightPharmacyInList(pharm.id);
    });
  }'''
    
    new_update = '''    // Update map markers
    addPharmacyMarkers(displayPharmacies, (pharm) => {
      // Zoom on marker
      leafletMap.flyTo([pharm.lat, pharm.lng], 16, { animate: true, duration: 1 });
      highlightPharmacyInList(pharm.id);
    });

    // Update left panel ONLY IF there are no active requests
    if (activeRequestIds.length === 0) {
      renderPharmacyList(displayPharmacies);
    }
  }'''

    if 'renderPharmacyList(displayPharmacies);' not in content:
        content = content.replace(old_update, new_update)

    with open('js/app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed app.js")

fix_app_js()
