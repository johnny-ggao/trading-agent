import sys, re, html
raw = sys.stdin.buffer.read()
t = raw.decode('utf-8', errors='replace')
t = re.sub(r'<script.*?</script>', ' ', t, flags=re.S|re.I)
t = re.sub(r'<style.*?</style>', ' ', t, flags=re.S|re.I)
t = re.sub(r'<[^>]+>', ' ', t)
t = html.unescape(t)
t = re.sub(r'\s+', ' ', t)
limit = int(sys.argv[1]) if len(sys.argv) > 1 else 20000
print(t[:limit])
