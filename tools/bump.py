# Stamp every local module import with a build version so browsers can't run stale cached copies.
# Usage: python3 tools/bump.py   (run before publishing)
import re, glob, time
v = str(int(time.time()))
for f in glob.glob('src/*.js'):
    s = open(f).read()
    s2 = re.sub(r"""(from\s+'\./[\w-]+\.js)(\?v=\d+)?'""", lambda m: f"{m.group(1)}?v={v}'", s)
    if s2 != s: open(f, 'w').write(s2)
s = open('index.html').read()
s = re.sub(r'src="\./src/main\.js(\?v=\d+)?"', f'src="./src/main.js?v={v}"', s)
open('index.html', 'w').write(s)
print('version', v)
