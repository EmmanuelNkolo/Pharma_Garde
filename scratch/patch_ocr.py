import sys

def modify_html():
    with open('index.html', 'r', encoding='utf-8') as f:
        content = f.read()

    ocr_modal = '''
    <!-- ════════════════════════════════════════════════════════
         OCR MODAL
         ════════════════════════════════════════════════════════ -->
    <div id="ocr-modal" class="modal-overlay" style="display: none;">
      <div class="modal-content" style="max-width: 320px; text-align: center;">
        <div class="modal-header">
          <h3>Scanner une Ordonnance</h3>
          <button class="btn btn--icon" onclick="document.getElementById('ocr-modal').style.display='none'">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; gap: 12px; padding-bottom: 24px;">
          <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">Choisissez la source de votre ordonnance.</p>
          
          <button id="ocr-btn-camera" class="btn btn--primary btn--block">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
            Prendre une photo
          </button>
          <input type="file" id="ocr-input-camera" accept="image/*" capture="environment" style="display: none;">
          
          <button id="ocr-btn-gallery" class="btn btn--secondary btn--block">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Importer un fichier
          </button>
          <input type="file" id="ocr-input-gallery" accept="image/*,application/pdf" style="display: none;">
        </div>
      </div>
      <div id="ocr-backdrop" style="position: absolute; inset: 0; z-index: -1; background: rgba(0,0,0,0.5);"></div>
    </div>
'''

    if 'id=\"ocr-modal\"' not in content:
        content = content.replace('    <div class=\"toast-container\">', ocr_modal + '\n    <div class=\"toast-container\">')
        with open('index.html', 'w', encoding='utf-8') as f:
            f.write(content)
        print('Updated index.html')

def modify_js():
    with open('js/app.js', 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the btn-ordonnance logic
    if 'setupOCRModal' in content:
        # We need to bind btn-ordonnance to openOCRModal in bindEvents
        old_bind = '''    // Listeners for bottom sheet actions
    const btnOrdonnance = $('#btn-ordonnance');
    if (btnOrdonnance) btnOrdonnance.addEventListener('click', openSearchModal);'''
        new_bind = '''    // Listeners for bottom sheet actions
    const btnOrdonnance = $('#btn-ordonnance');
    if (btnOrdonnance) btnOrdonnance.addEventListener('click', openOCRModal);'''
        
        content = content.replace(old_bind, new_bind)

        with open('js/app.js', 'w', encoding='utf-8') as f:
            f.write(content)
        print('Updated app.js')

modify_html()
modify_js()
