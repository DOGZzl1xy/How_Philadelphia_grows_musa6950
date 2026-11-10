"""report.md -> report.tex (xelatex), used to render report/report.pdf. Usage: python report/tools/report2tex.py report/report.md <out.tex> report; then xelatex twice. Needs Times New Roman (ttf-mscorefonts-installer on Linux)."""
import re
import sys

src, dst, rdir = sys.argv[1], sys.argv[2], sys.argv[3].replace('\\', '/').rstrip('/') + '/'
lines = open(src, encoding='utf-8').read().split('\n')

WIDTH = {'story_schematic': 0.78, 'split_map': 0.45, 'method_flow': 1.0, 'height_example': 0.95,
         'round2_scatter': 0.95, 'rq2_maps_250m': 0.85, 'rq2_when_transit_income': 0.8,
         'rq3_time_to_detection': 0.58}


def esc(s):
    for a, b in [('&', r'\&'), ('%', r'\%'), ('#', r'\#'), ('_', r'\_')]:
        s = s.replace(a, b)
    return s


def inline(s):
    keep = []

    def stash(x):
        keep.append(x)
        return f'\x00{len(keep) - 1}\x00'
    s = re.sub(r'`([^`]+)`', lambda m: stash(r'\nolinkurl{' + m.group(1) + '}'), s)
    s = re.sub(r'https?://\S+', lambda m: stash(r'\url{' + m.group(0) + '}'), s)
    s = esc(s)
    s = re.sub(r'(\d) (?=(m|km|km²|m²|M|GB|pts)\b)', r'\1~', s)
    s = re.sub(r'\*\*(.+?)\*\*', r'\\textbf{\1}', s)
    s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'\\emph{\1}', s)
    s = re.sub(r'"(.+?)"', r"``\1''", s)
    s = re.sub('\x00(\\d+)\x00', lambda m: keep[int(m.group(1))], s)
    return s


# group into blocks separated by blank lines
blocks, cur = [], []
for ln in lines:
    if ln.strip():
        cur.append(ln.rstrip())
    elif cur:
        blocks.append(cur)
        cur = []
if cur:
    blocks.append(cur)

out = [r"""\documentclass[11pt]{article}
\usepackage[letterpaper,margin=1in]{geometry}
\usepackage{fontspec}\setmainfont{Times New Roman}
\usepackage{graphicx,booktabs,tabularx,enumitem,xurl,titlesec,array,ragged2e}
\usepackage[hidelinks]{hyperref}
\graphicspath{{""" + rdir + r"""}}
\titleformat{\section}{\normalfont\Large\bfseries}{}{0em}{}
\titleformat{\subsection}{\normalfont\large\bfseries}{}{0em}{}
\titlespacing*{\section}{0pt}{14pt}{6pt}
\titlespacing*{\subsection}{0pt}{10pt}{4pt}
\setlength{\parindent}{0pt}\setlength{\parskip}{6pt}
\setlist{itemsep=2pt,topsep=2pt}
\renewcommand{\arraystretch}{1.15}\renewcommand{\topfraction}{0.85}\renewcommand{\textfraction}{0.1}\renewcommand{\floatpagefraction}{0.75}\setlength{\textfloatsep}{10pt plus 2pt}
\begin{document}"""]

i = 0
in_refs = False
while i < len(blocks):
    b = blocks[i]
    first = b[0]
    if first.startswith('# '):
        out.append(r'\begin{center}{\LARGE\bfseries ' + inline(first[2:]) + r'\par}\vspace{8pt}')
        i += 1
        out.append('{\\large ' + inline(' '.join(blocks[i]).replace('**', '')) + r'\par}\end{center}')
    elif first == '---':
        pass
    elif first.startswith('## '):
        in_refs = first[3:].lower().startswith('references')
        out.append(r'\section*{' + inline(first[3:]) + '}')
        rest = b[1:]
        if rest:
            blocks.insert(i + 1, rest)
    elif first.startswith('### '):
        out.append(r'\subsection*{' + inline(first[4:]) + '}')
    elif first.startswith('!['):
        path = re.match(r'!\[.*\]\((.+)\)', first).group(1)
        key = path.split('/')[-1].rsplit('.', 1)[0]
        cap = ''
        if i + 1 < len(blocks) and blocks[i + 1][0].startswith('*Figure'):
            i += 1
            cap = ' '.join(blocks[i]).strip('*')
        out.append(r'\begin{figure}[!htbp]\centering\includegraphics[width=' + str(WIDTH.get(key, 0.9))
                   + r'\linewidth]{' + path + r'}\par\vspace{4pt}{\small ' + inline(cap) + r'\par}\end{figure}')
    elif first.startswith('|'):
        rows = [[c.strip() for c in r.strip().strip('|').split('|')] for r in b]
        rows = [r for r in rows if not set(''.join(r)) <= set('-: ')]
        n = len(rows[0])
        w0 = 1.5 if n > 2 else 0.7
        wr = (n - w0) / (n - 1)
        spec = (r'@{}>{\raggedright\hsize=' + f'{w0:.3f}' + r'\hsize}X'
                + (r'>{\raggedright\arraybackslash\hsize=' + f'{wr:.3f}' + r'\hsize}X') * (n - 1) + '@{}')
        out.append(r'{\small\begin{tabularx}{\linewidth}{' + spec + r'}\toprule')
        for k, r in enumerate(rows):
            out.append(' & '.join(inline(x) for x in r) + r' \\' + (r' \midrule' if k == 0 else ''))
        out.append(r'\bottomrule\end{tabularx}\par}')
    elif first.startswith('- '):
        items = []
        for ln in b:
            if ln.startswith('- '):
                items.append(ln[2:])
            else:
                items[-1] += ' ' + ln.strip()
        out.append(r'\begin{itemize}' + ''.join(r'\item ' + inline(x) for x in items) + r'\end{itemize}')
    elif in_refs and re.match(r'\d+\. ', first):
        out.append(r'{\small\begin{enumerate}[label={[\arabic*]},leftmargin=2.2em,itemsep=1pt]'
                   + ''.join(r'\item ' + inline(re.sub(r'^\d+\. ', '', x)) for x in b)
                   + r'\end{enumerate}\par}')
    else:
        out.append(inline(' '.join(x.strip() for x in b)))
    i += 1
out.append(r'\end{document}')
open(dst, 'w', encoding='utf-8').write('\n\n'.join(out))
