import re

content = open('delegue.html', 'r', encoding='utf-8').read()

repl = """        <div style="display: flex; gap: 12px; margin-top: 24px; flex-direction: column;">
          <button id="btn-save-promo-all" class="btn btn-primary" style="width: 100%;">Diffuser à toutes les pharmacies (Rayon)</button>
          <button id="btn-save-promo-specific" class="btn btn-outline" style="width: 100%; color: var(--green-400); border-color: var(--green-400);">Choisir une pharmacie spécifique</button>
          <button class="btn btn-outline" style="width: 100%; border-color: var(--dark-400); color: var(--dark-400);" id="btn-cancel-promo">Annuler</button>
        </div>"""

content = re.sub(
    r'<div style="display: flex; gap: 12px; margin-top: 24px;">\s*<button class="btn btn-outline" style="flex: 1;" id="btn-cancel-promo">Annuler</button>\s*<button id="btn-save-promo" class="btn btn-primary" style="flex: 1;">Enregistrer</button>\s*</div>',
    repl,
    content,
    flags=re.DOTALL
)

# And make sure panel-promotions is styled for table scrolling
content = re.sub(
    r'<div id="panel-promotions" class="sheet-panel" style="display: none;">',
    '<div id="panel-promotions" class="sheet-panel" style="display: none; overflow-x: auto;">',
    content
)


open('delegue.html', 'w', encoding='utf-8').write(content)
print("delegue.html patched")
