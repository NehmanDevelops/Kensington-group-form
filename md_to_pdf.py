import markdown
import sys
import os
import subprocess

src = sys.argv[1] if len(sys.argv) > 1 else 'PHASE7_DATA_FLOW.md'
base = os.path.splitext(src)[0]
html_out = base + '.html'
pdf_out = base + '.pdf'
title = base.replace('_', ' ').title()

with open(src, 'r', encoding='utf-8') as f:
    md_text = f.read()

html_body = markdown.markdown(md_text, extensions=['tables', 'fenced_code'])

html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>{title}</title>
<style>
@page {{ size: letter; margin: 0.5in; }}
body {{ font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; color: #222; line-height: 1.5; max-width: 100%; }}
h1 {{ color: #8B6F47; border-bottom: 2px solid #8B6F47; padding-bottom: 6px; font-size: 20pt; }}
h2 {{ color: #8B6F47; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 20px; font-size: 14pt; }}
h3 {{ color: #555; font-size: 11.5pt; margin-top: 14px; }}
table {{ border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 9pt; }}
th {{ background: #8B6F47; color: white; padding: 6px 8px; text-align: left; }}
td {{ border: 1px solid #ddd; padding: 5px 8px; vertical-align: top; }}
tr:nth-child(even) {{ background: #f9f9f9; }}
code {{ background: #f4f4f4; padding: 2px 5px; border-radius: 3px; font-family: Consolas, monospace; font-size: 9.5pt; }}
pre {{ background: #f4f4f4; padding: 10px; border-radius: 4px; font-size: 8.5pt; white-space: pre-wrap; }}
hr {{ border: none; border-top: 1px solid #ddd; margin: 16px 0; }}
ul, ol {{ margin: 8px 0; padding-left: 24px; }}
li {{ margin: 3px 0; }}
strong {{ color: #000; }}
blockquote {{ border-left: 4px solid #8B6F47; padding: 4px 12px; margin: 10px 0; background: #f9f5f0; color: #555; font-style: italic; }}
</style>
</head>
<body>
{html_body}
</body>
</html>"""

with open(html_out, 'w', encoding='utf-8') as f:
    f.write(html)

# Use Edge headless
edge = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not os.path.exists(edge):
    edge = r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"

html_abs = os.path.abspath(html_out)
pdf_abs = os.path.abspath(pdf_out)

subprocess.run([edge, '--headless', '--disable-gpu', '--no-pdf-header-footer',
                f'--print-to-pdf={pdf_abs}', f'file:///{html_abs}'],
               capture_output=True, timeout=30)

print(f"Generated: {pdf_out}")
