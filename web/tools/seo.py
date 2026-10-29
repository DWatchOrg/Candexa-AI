import re, sys, html, pathlib
D = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'public')
TAG = 'The AI-first evaluation & training platform for knowledge work'
HOME_T = 'Candexa | ' + TAG
HOME_D = TAG + '. Build AI simulations from your own workflows to assess candidate AI fluency and upskill your team.'
SLUG = {'index': '/', '404': None, 'success': None}
for f in sorted(p for p in D.glob('*.html') if not p.name.endswith('.dc.html')):
    s = f.read_text()
    name = f.stem
    if name == 'index':
        s = re.sub(r'(<helmet>.*?<title>).*?(</title>)', lambda m: m.group(1) + html.escape(HOME_T, quote=False) + m.group(2), s, count=1, flags=re.S)
        s = re.sub(r'(<helmet>.*?<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + html.escape(HOME_D) + m.group(2), s, count=1, flags=re.S)
    t = re.search(r'<helmet>.*?<title>(.*?)</title>', s, re.S)
    d = re.search(r'<helmet>.*?<meta name="description" content="([^"]*)"', s, re.S)
    title = html.unescape(t.group(1)) if t else HOME_T
    desc = html.unescape(d.group(1)) if d else HOME_D
    url = 'https://candexa.ai' + (SLUG.get(name, '/' + name) or '/')
    e = lambda v: html.escape(v)
    block = ('<!--seo-->\n'
             f'<title>{html.escape(title, quote=False)}</title>\n'
             f'<meta name="description" content="{e(desc)}">\n'
             '<link rel="icon" type="image/png" href="/favicon.png">\n'
             + (f'<link rel="canonical" href="{url}">\n' if name not in ('404', 'success') else '<meta name="robots" content="noindex">\n') +
             '<meta property="og:type" content="website">\n'
             '<meta property="og:site_name" content="Candexa">\n'
             f'<meta property="og:title" content="{e(title)}">\n'
             f'<meta property="og:description" content="{e(desc)}">\n'
             f'<meta property="og:url" content="{url}">\n'
             '<meta property="og:image" content="https://candexa.ai/assets/og-image.jpg">\n'
             '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
             '<meta name="twitter:card" content="summary_large_image">\n'
             f'<meta name="twitter:title" content="{e(title)}">\n'
             f'<meta name="twitter:description" content="{e(desc)}">\n'
             '<meta name="twitter:image" content="https://candexa.ai/assets/og-image.jpg">\n'
             '<!--/seo-->')
    s = re.sub(r'\n?<!--seo-->.*?<!--/seo-->', '', s, flags=re.S)
    s = s.replace('<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="viewport" content="width=device-width, initial-scale=1">\n' + block, 1)
    f.write_text(s)
    print(name, '|', title)
