from PIL import Image, ImageDraw, ImageFont, ImageFilter
A = __import__('os').environ.get('ASSETS', __import__('os').path.dirname(__file__)+'/../../public/assets/')
W, H = 1200, 630
INK, ORANGE, MUTED, BG = (32, 25, 29), (195, 84, 15), (92, 82, 88), (254, 249, 245)

def font(path, size, wght, opsz=None):
    f = ImageFont.truetype(path, size)
    vals = []
    for a in f.get_variation_axes():
        n = a['name'] if isinstance(a['name'], str) else a['name'].decode()
        n = n.lower()
        v = wght if 'weight' in n or n == 'wght' else min(max(opsz or size, a['minimum']), a['maximum'])
        vals.append(v)
    f.set_variation_by_axes(vals)
    return f

serif = lambda s, w=700: font(__import__('os').path.dirname(__file__)+'/serif.ttf', s, w)
sans = lambda s, w=300: font(__import__('os').path.dirname(__file__)+'/sans.ttf', s, w)

img = Image.new('RGB', (W, H), BG)
glow = Image.new('RGB', (W, H), BG)
gd = ImageDraw.Draw(glow)
gd.ellipse((150, 380, 1050, 900), fill=(250, 222, 200))
gd.ellipse((-200, -300, 500, 200), fill=(253, 238, 226))
img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(120)), 1)
d = ImageDraw.Draw(img)

def tw(t, f, tr): return f.getlength(t) + tr * max(len(t) - 1, 0)
def draw_t(x, y, t, f, c, tr):
    for i, ch in enumerate(t):
        d.text((x + f.getlength(t[:i]) + tr * i, y), ch, font=f, fill=c, anchor='ls')

def circle(path, size, ring=5):
    im = Image.open(path).convert('RGBA')
    s = min(im.size); im = im.crop(((im.width - s) // 2, 0, (im.width + s) // 2, s)).resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size + 2 * ring,) * 2, (0, 0, 0, 0))
    m = Image.new('L', out.size, 0); ImageDraw.Draw(m).ellipse((0, 0, *out.size), fill=255)
    out.paste((255, 255, 255, 255), (0, 0), m)
    m2 = Image.new('L', (size, size), 0); ImageDraw.Draw(m2).ellipse((0, 0, size, size), fill=255)
    out.paste(im, (ring, ring), m2)
    return out

FS = 82
faces = [circle(A + f, 74) for f in ('hero-face-1c.png', 'hero-face-2c.png', 'hero-face-3b.png')]
FACE_W = faces[0].width * 3 - 2 * 26
lines = [
    [('Hire people', serif(FS), INK, -1.5), ('  ', sans(FS), INK, 0), ('FACES',), ('  ', sans(FS), INK, 0), ('smarter', serif(FS), INK, -1.5)],
    [('than your AI agents,', sans(FS), INK, -3.2)],
    [('then keep', serif(FS), ORANGE, -1.5), (' them that way.', sans(FS), INK, -3.2)],
]
y = 238
for ln in lines:
    widths = [FACE_W if s[0] == 'FACES' else tw(s[0], s[1], s[3]) for s in ln]
    x = (W - sum(widths)) / 2
    for s, w in zip(ln, widths):
        if s[0] == 'FACES':
            fx = int(x)
            for i, fc in enumerate(faces):
                img.paste(fc, (fx + i * (fc.width - 26), y - 70), fc)
        else:
            draw_t(x, y, s[0], s[1], s[2], s[3])
        x += w
    y += 92

sub = sans(27, 400)
for i, t in enumerate(['AI simulations built on your own workflows to assess', 'candidate AI fluency and upskill your team.']):
    d.text((W / 2, 488 + i * 38), t, font=sub, fill=MUTED, anchor='ms')

fl = Image.open(A + 'candexa-flower.png').convert('RGBA'); fl.thumbnail((40, 40), Image.LANCZOS)
img.paste(fl, (64, 52), fl)
d.text((114, 82), 'Candexa AI', font=sans(28, 600), fill=INK, anchor='ls')
pf = sans(20, 500); label = 'Early access'
pw = pf.getlength(label) + 40
d.rounded_rectangle((W - 64 - pw, 50, W - 64, 88), radius=19, fill=ORANGE)
d.text((W - 64 - pw / 2, 76), label, font=pf, fill=(255, 255, 255), anchor='ms')
d.text((W / 2, 590), 'candexa.ai', font=sans(24, 600), fill=ORANGE, anchor='ms')

img.save(A + 'og-image.jpg', 'JPEG', quality=88, optimize=True, progressive=True)
print('saved', img.size)
