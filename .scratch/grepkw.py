
import sys, re, html
t = open(sys.argv[1], encoding='utf-8', errors='replace').read()
t = re.sub(r'<script.*?</script>', ' ', t, flags=re.S|re.I)
t = re.sub(r'<style.*?</style>', ' ', t, flags=re.S|re.I)
t = re.sub(r'<[^>]+>', ' ', t)
t = html.unescape(t); t = re.sub(r'\s+', ' ', t)
for kw in sys.argv[2:]:
    for m in re.finditer(kw, t, flags=re.I):
        s = max(0, m.start()-160); e = min(len(t), m.end()+240)
        print('...[' + kw + ']... ' + t[s:e])
        print('---')
