"""Reproducible, seamless original PBR microtextures. No downloaded assets."""
from pathlib import Path
import numpy as np
from PIL import Image

out = Path(__file__).resolve().parents[1] / 'public' / 'materials'
out.mkdir(exist_ok=True)
n = 512
y, x = np.mgrid[:n, :n] / n
rng = np.random.default_rng(6126)

def noise(scale, terms=30):
    result = np.zeros((n, n))
    for _ in range(terms):
        k, l = rng.integers(1, scale+1, 2)
        result += np.sin(2*np.pi*(k*x+l*y)+rng.uniform(0, 2*np.pi)) / terms**.5
    return result

for kind in ['fabric', 'leather', 'steel', 'skin']:
    fine, broad = noise(180), noise(12)
    if kind == 'fabric':
        warp, weft = np.cos(x*2*np.pi*64), np.cos(y*2*np.pi*64)
        relief = .18*warp + .18*weft + .12*np.sin(x*2*np.pi*32)*np.sin(y*2*np.pi*32) + fine*.035
        value = .87 + relief*.13 + broad*.008
        rough = .89 + relief*.05
    elif kind == 'leather':
        relief = np.sin(noise(32)*4)*.15 + fine*.055 + broad*.07
        value = .86 + relief*.11 + broad*.015
        rough = .78 + relief*.12
    elif kind == 'steel':
        relief = noise(210)*.025 + np.sin(y*2*np.pi*193)*.022
        value = .91 + relief*.2 + broad*.01
        rough = .73 + broad*.025 + fine*.02
    else:
        relief = np.minimum(fine-.55, 0)*.035 + broad*.014
        value = .94 + relief*.11 + broad*.009
        rough = .88 + fine*.012
    color = np.repeat(np.clip(value[..., None], 0, 1), 3, axis=2)
    if kind == 'skin':
        color[..., 1] *= .985
        color[..., 2] *= .97
    dx = np.roll(relief, -1, 1) - np.roll(relief, 1, 1)
    dy = np.roll(relief, -1, 0) - np.roll(relief, 1, 0)
    normal = np.stack([-dx*1.5, -dy*1.5, np.ones_like(dx)], axis=2)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    arm = np.stack([np.clip(.95+relief*.09, .75, 1), np.clip(rough, 0, 1), np.full_like(dx, 1 if kind == 'steel' else 0)], axis=2)
    for channel, data in [('color', color), ('normal', normal*.5+.5), ('arm', arm)]:
        Image.fromarray(np.uint8(np.clip(data, 0, 1)*255)).save(out / f'{kind}-{channel}.jpg', quality=93, subsampling=0)
print('Created 12 seamless 512×512 character maps.')
