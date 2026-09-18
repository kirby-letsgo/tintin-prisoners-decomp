import unittest
from actor_frames import *


class ActorFrameFormats(unittest.TestCase):
    def test_record_stride_endian_and_two_stage_bank_encoding(self):
        rom=bytearray(10*0x4000)
        offset=bank9_offset(RECORDS+RECORD_SIZE)
        record=bytes([254,3,7])+b''.join(bytes([5,0x10+i,0x42]) for i in range(16))
        rom[offset:offset+RECORD_SIZE]=record
        frame=decode_frame(rom,1)
        self.assertEqual(frame.metadata,bytes([254,3,7]))
        self.assertEqual(len(frame.tiles),16)
        self.assertEqual(frame.tiles[0].address,0x4210)
        self.assertEqual(frame.tiles[-1].address,0x421f)
        self.assertEqual(frame.tiles[0].upload_bank,7)
        self.assertEqual(frame.descriptor_bytes[:3],bytes([6,0x10,0x42]))
        self.assertEqual(TilePointer(255,0).upload_bank,1)
        self.assertEqual(TilePointer(254,0).upload_bank,0)

    def test_relative_sequence_lookup_and_phase(self):
        rom=bytearray(10*0x4000)
        offset=bank9_offset(DIRECTORY+4)
        rom[offset:offset+2]=bytes([0x20,0])
        address=SEQUENCES+0x20+6
        offset=bank9_offset(address)
        rom[offset:offset+2]=bytes([0x93,1])
        self.assertEqual(select_frame(rom,2,3),(0x193,address))

    def test_rejects_out_of_window_and_truncated_data(self):
        with self.assertRaises(ValueError):decode_frame(bytes(50),0)
        with self.assertRaises(ValueError):decode_frame(bytes(10*0x4000),1000)
        with self.assertRaises(ValueError):select_frame(bytes(10*0x4000),0,16)


if __name__=='__main__':unittest.main()
