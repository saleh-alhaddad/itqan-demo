import math

def oklch_to_srgb(L, C, h_deg):
    h = math.radians(h_deg)
    a, b = C*math.cos(h), C*math.sin(h)
    l_ = L + 0.3963377774*a + 0.2158037573*b
    m_ = L - 0.1055613458*a - 0.0638541728*b
    s_ = L - 0.0894841775*a - 1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    r = +4.0767416621*l - 3.3077115913*m + 0.2309699292*s
    g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
    bb = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    def enc(x):
        x = max(0.0, min(1.0, x))
        return 12.92*x if x <= 0.0031308 else 1.055*(x**(1/2.4)) - 0.055
    return tuple(enc(v) for v in (r, g, bb))

def rel_lum(rgb):
    def lin(c):
        return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4
    r, g, b = (lin(c) for c in rgb)
    return 0.2126*r + 0.7152*g + 0.0722*b

def contrast(fg, bg):
    a, b = rel_lum(fg), rel_lum(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)

def hexof(rgb):
    return '#' + ''.join(f'{round(c*255):02x}' for c in rgb)

def ratio(fg_oklch, bg_oklch):
    return contrast(oklch_to_srgb(*fg_oklch), oklch_to_srgb(*bg_oklch))

# ---------------------------------------------------------------------------
# Kept beside design.md so its contrast claims stay checkable rather than
# taken on trust. OKLCH -> sRGB -> relative luminance -> WCAG ratio.
# Validated against black-on-white = 21.00 exactly.
#
#   python3 -c "from contrast import *; print(ratio((0.522,0.15,264),(0.965,0.025,264)))"
#
# Every ink/surface pair in design.md's token table lands at 5.00-5.04; the
# due-date badges clear 4.5 against all five tints simultaneously.
# ---------------------------------------------------------------------------
