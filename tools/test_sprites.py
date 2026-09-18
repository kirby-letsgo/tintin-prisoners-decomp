import tempfile
import unittest
from pathlib import Path
from PIL import Image
from sprites import decode_2bpp, encode_2bpp, indexed, colors, objects, snapshot, groups, GRAY


class SpriteFormats(unittest.TestCase):
    def test_documented_bitplane_example(self):
        self.assertEqual(decode_2bpp(bytes([0x3c, 0x7e]+[0]*14))[:8], [0,2,3,3,3,3,2,0])

    def test_indexed_png_roundtrip(self):
        raw = bytes((n*37) & 255 for n in range(32))
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)/'sprite.png'
            indexed(decode_2bpp(raw), (8,16), GRAY).save(path)
            with Image.open(path) as image:
                self.assertEqual(encode_2bpp(image), raw)
                self.assertEqual(image.info['transparency'], 0)

    def test_rejects_incompatible_edits(self):
        with self.assertRaises(ValueError): encode_2bpp(Image.new('RGBA',(8,8)))
        image = indexed([0]*64,(8,8),GRAY)
        image.putpixel((0,0),4)
        with self.assertRaises(ValueError): encode_2bpp(image)

    def test_cgb_bank_pair_and_full_object_flip(self):
        vram = bytearray(16384)
        vram[8192+2*16] = 128  # Top-left pixel of even tile 2.
        oam = bytearray(160)
        oam[:4] = bytes([16,8,3,0x68])  # Odd ID masks to 2; bank 1; X+Y flip.
        items = objects(dict(lcdc=6,vram=vram,oam=oam,obj=bytes(64)))
        self.assertEqual(len(items),1)
        item = items[0]
        self.assertEqual((item['tile'],item['bank'],item['image'].size),(2,1,(8,16)))
        self.assertEqual(item['placed'].getpixel((7,15)),1)
        self.assertEqual(item['placed'].getpixel((0,0)),0)

    def test_disabled_boundary_keeps_loaded_sprites(self):
        vram=bytearray(16384); vram[0]=128
        oam=bytearray(160); oam[:4]=bytes([16,8,0,0])
        self.assertEqual(len(objects(dict(lcdc=0,vram=vram,oam=oam,obj=bytes(64)))),1)

    def test_assembly_keeps_multiple_palettes_but_separates_other_grid(self):
        image=Image.new('P',(8,8))
        a=dict(x=3,y=1,bank=1,pal=b'a',placed=image)
        b=dict(x=3,y=9,bank=1,pal=b'b',placed=image)
        c=dict(x=8,y=8,bank=0,pal=b'c',placed=image)
        self.assertEqual([len(g) for g in groups([a,b,c])],[2,1])

    def test_rgb555_and_truncated_capture(self):
        self.assertEqual(colors(bytes([31,0,224,3,0,124])),[(255,0,0),(0,255,0),(0,0,255)])
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'bad.bin'
            path.write_bytes(b'TTVRAM01')
            with self.assertRaises(ValueError): snapshot(path)


if __name__ == '__main__': unittest.main()
