"""Verified ROM-bank-9 animation tables. Pure data decoding; no ROM modifications."""
from dataclasses import dataclass

DIRECTORY = 0x4000
SEQUENCES = 0x4084
RECORDS = 0x4354
RECORD_SIZE = 51
BANK = 9


def bank9_offset(address):
    if not 0x4000 <= address < 0x8000:
        raise ValueError('Address is outside the bank-9 ROM window')
    return BANK * 0x4000 + address - 0x4000


def read_bank9(rom, address, size):
    offset = bank9_offset(address)
    if size < 0 or address + size > 0x8000 or offset + size > len(rom):
        raise ValueError('Incomplete bank-9 data')
    return rom[offset:offset+size]


def select_frame(rom, mapped_animation, phase):
    if not 0 <= mapped_animation < 256 or not 0 <= phase < 16:
        raise ValueError('Invalid animation selector or phase')
    relative = int.from_bytes(read_bank9(rom, DIRECTORY + 2*mapped_animation, 2), 'little')
    address = (SEQUENCES + relative + 2*phase) & 65535
    frame = int.from_bytes(read_bank9(rom, address, 2), 'little')
    return frame, address


@dataclass(frozen=True)
class TilePointer:
    encoded_bank: int
    address: int

    @property
    def upload_bank(self):
        # Frame staging adds one; the VRAM uploader adds one again.
        return (self.encoded_bank + 2) & 255


@dataclass(frozen=True)
class ActorFrame:
    index: int
    metadata: bytes
    tiles: tuple

    @property
    def descriptor_bytes(self):
        return b''.join(bytes([(t.encoded_bank + 1) & 255]) + t.address.to_bytes(2,'little') for t in self.tiles)


def decode_frame(rom, index):
    if index < 0:
        raise ValueError('Negative frame index')
    record = read_bank9(rom, RECORDS + index*RECORD_SIZE, RECORD_SIZE)
    tiles = tuple(TilePointer(record[i],int.from_bytes(record[i+1:i+3],'little'))
                  for i in range(3,RECORD_SIZE,3))
    return ActorFrame(index,bytes(record[:3]),tiles)
