from pathlib import Path
root=Path(__file__).resolve().parent.parent
index=root/'index.html'
src=(root/'js/game.js').read_text(encoding='utf-8')
html=index.read_text(encoding='utf-8')
start=html.index('<script type="module">')
end=html.index('</script>',start)+len('</script>')
html=html[:start]+'<script type="module">\n'+src+'\n</script>'+html[end:]
index.write_text(html,encoding='utf-8')
print('index.html atualizado')
