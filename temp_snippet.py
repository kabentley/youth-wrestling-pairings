from pathlib import Path
text=Path('src/app/meets/[meetId]/page.tsx').read_text(encoding='utf-8')
start=text.index('const [settings')
print(text[start-300:start+400])
