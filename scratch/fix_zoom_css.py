content = open('css/delegue.css', 'r', encoding='utf-8').read()

zoom_css = """
/* Zoom controls positioning (below settings button) */
.leaflet-top.leaflet-right {
  top: 120px !important;
  right: 10px !important;
}
.leaflet-control-zoom {
  border: none !important;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
}
.leaflet-control-zoom a {
  background: var(--dark-800) !important;
  color: var(--dark-200) !important;
  border: 1px solid var(--glass-border) !important;
  width: 36px !important;
  height: 36px !important;
  line-height: 36px !important;
  font-size: 18px !important;
}
.leaflet-control-zoom a:hover {
  background: var(--dark-700) !important;
  color: white !important;
}
"""

if '.leaflet-top.leaflet-right' not in content:
    content += zoom_css

open('css/delegue.css', 'w', encoding='utf-8').write(content)
print("OK")
