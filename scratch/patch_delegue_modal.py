import re

content = open('delegue.html', 'r', encoding='utf-8').read()

repl = """        <div id="promo-buttons-container" style="display: flex; gap: 12px; margin-top: 24px; flex-direction: column;">
          <button id="btn-save-promo-all" class="btn btn-primary" style="width: 100%;">Diffuser à toutes les pharmacies (Rayon)</button>
          <button id="btn-save-promo-specific" class="btn btn-outline" style="width: 100%; color: var(--green-400); border-color: var(--green-400);">Choisir une pharmacie spécifique</button>
          <button class="btn btn-outline" style="width: 100%; border-color: var(--dark-400); color: var(--dark-400);" id="btn-cancel-promo">Annuler</button>
        </div>
        <div id="promo-specific-container" style="display: none; margin-top: 24px; flex-direction: column; gap: 12px;">
          <label style="font-size: 13px; font-weight: 600; color: var(--dark-200);">Sélectionnez la pharmacie cible :</label>
          <select id="promo-specific-pharmacy" class="input-field"></select>
          <button id="btn-save-promo-specific-confirm" class="btn btn-primary" style="width: 100%;">Confirmer l'envoi</button>
          <button class="btn btn-outline" style="width: 100%; border-color: var(--dark-400); color: var(--dark-400);" id="btn-cancel-specific">Retour</button>
        </div>"""

content = re.sub(
    r'<div style="display: flex; gap: 12px; margin-top: 24px; flex-direction: column;">.*?</div>',
    repl,
    content,
    flags=re.DOTALL
)

open('delegue.html', 'w', encoding='utf-8').write(content)
print("delegue.html patched")
