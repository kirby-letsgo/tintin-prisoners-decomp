import struct
import unittest
from PIL import Image
from sprite_pack import compile_entries, tile_image

class SpritePackTests(unittest.TestCase):
    def setUp(self):
        self.key = bytes([255,0]*8) + bytes([0,0,31,0,0,124,255,127])
        self.entry = dict(key=self.key.hex(),x=0,y=0,label='first')
    def test_identity_pack_and_shared_edit(self):
        sheet=Image.new('RGBA',(32,16));tile=tile_image(self.key)
        sheet.paste(tile,(0,0));sheet.paste(tile,(16,0))
        duplicate=dict(self.entry,x=16,label='duplicate')
        native,chosen=compile_entries(sheet,[self.entry,duplicate])
        self.assertEqual(native[:12],b'TTSPK001'+struct.pack('<I',1))
        self.assertEqual(native[36:],tile.tobytes())
        sheet.putpixel((16,0),(0,255,0,255))
        native,chosen=compile_entries(sheet,[self.entry,duplicate])
        self.assertEqual(chosen[0]['label'],'duplicate')
        self.assertEqual(native[36:40],bytes([0,255,0,255]))
        sheet.putpixel((0,0),(0,0,255,255))
        with self.assertRaisesRegex(ValueError,'Conflicting'): compile_entries(sheet,[self.entry,duplicate])
    def test_flip_mapping(self):
        sheet=tile_image(self.key);sheet.putpixel((15,15),(1,2,3,255))
        native,_=compile_entries(sheet,[dict(self.entry,flipX=True,flipY=True)])
        self.assertEqual(native[36:40],bytes([1,2,3,255]))
    def test_invalid_mapping_and_alpha(self):
        sheet=tile_image(self.key)
        for entry in (dict(self.entry,x=-1),dict(self.entry,y=1),dict(self.entry,key='00')):
            with self.assertRaises(ValueError): compile_entries(sheet,[entry])
        sheet.putpixel((0,0),(1,2,3,127))
        with self.assertRaisesRegex(ValueError,'antialiasing'):compile_entries(sheet,[self.entry])

if __name__=='__main__':unittest.main()
