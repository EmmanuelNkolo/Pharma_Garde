import re

content = open('css/delegue.css', 'r', encoding='utf-8').read()

repl = """#bottom-sheet.stats-fullscreen {
  width: 90vw !important;
  max-width: 1200px !important;
  aspect-ratio: 4 / 3 !important;
  height: auto !important;
  max-height: 90vh !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  border-radius: 20px !important;
  border: 1px solid var(--glass-border) !important;
  box-shadow: 0 30px 60px rgba(0,0,0,0.7) !important;
  z-index: 2000 !important;
  background: var(--dark-950) !important;
  bottom: auto !important;
  right: auto !important;
}
#bottom-sheet.stats-fullscreen .sheet-handle-area {
  display: none !important;
}

#bottom-sheet.stats-fullscreen #panel-stats {
  height: calc(100% - 60px);
  max-height: calc(90vh - 80px);
  overflow-y: auto;
  padding: 0 10px;
}"""

content = re.sub(
    r'#bottom-sheet\.stats-fullscreen \{.*?#bottom-sheet\.stats-fullscreen #panel-stats \{\s*height: calc\(100vh - 120px\);\s*overflow-y: auto;\s*\}',
    repl,
    content,
    flags=re.DOTALL
)

open('css/delegue.css', 'w', encoding='utf-8').write(content)
