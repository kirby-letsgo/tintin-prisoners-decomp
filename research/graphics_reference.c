/* Readable semantic reference for ROM 00:1314 and its four continuations.
 * NOT linked into the app. This intentionally omits instruction timing, flags,
 * register clobbers, interrupt safepoints and guest-stack mechanics.
 * The real entry points remain the timing-preserving generated C.
 */
#include <stdint.h>

typedef struct {
    void *context;
    uint8_t (*read8)(void *context, uint16_t address);
    void (*write8)(void *context, uint16_t address, uint8_t value);
} TintinMemory;

enum {
    ACTOR_TILE_POINTERS = 0xde42, /* 16 triples: bank-1, address low, address high */
    ACTOR_SLOT_HIGH = 0xc48c,    /* zero: tile 1; nonzero: tile 17 */
    TILE_UPLOAD_PHASE = 0xdf72,
    ROM_BANK_MIRROR = 0xff8f,
    ROM_BANK_SELECT = 0x2000,
    VRAM_BANK_MIRROR = 0xfffc,
    VRAM_BANK_SELECT = 0xff4f
};

void tintin_upload_actor_tile_quarter_reference(TintinMemory memory) {
    uint8_t saved_vram_bank = memory.read8(memory.context, VRAM_BANK_MIRROR);
    memory.write8(memory.context, VRAM_BANK_MIRROR, 1);
    memory.write8(memory.context, VRAM_BANK_SELECT, 1);

    uint8_t phase = memory.read8(memory.context, TILE_UPLOAD_PHASE) & 0x7f;
    /* Exact dispatcher branches: 0 -> final quarter, 1 -> first, 2 -> second,
       everything else -> third. Do not replace this with phase modulo four. */
    unsigned quarter = phase == 0 ? 3 : phase == 1 ? 0 : phase == 2 ? 1 : 2;
    uint16_t destination = memory.read8(memory.context, ACTOR_SLOT_HIGH) ? 0x8110 : 0x8010;
    destination += (uint16_t)(quarter * 64);
    uint16_t descriptor = ACTOR_TILE_POINTERS + (uint16_t)(quarter * 12);

    for (unsigned tile = 0; tile < 4; ++tile) {
        uint8_t bank = (uint8_t)(memory.read8(memory.context, descriptor++) + 1);
        memory.write8(memory.context, ROM_BANK_MIRROR, bank);
        memory.write8(memory.context, ROM_BANK_SELECT, bank);
        uint16_t source = memory.read8(memory.context, descriptor++);
        source |= (uint16_t)memory.read8(memory.context, descriptor++) << 8;
        for (unsigned byte = 0; byte < 16; ++byte) {
            uint8_t pixel_planes = memory.read8(memory.context, source++);
            memory.write8(memory.context, destination++, pixel_planes);
        }
    }
    memory.write8(memory.context, VRAM_BANK_MIRROR, saved_vram_bank);
    memory.write8(memory.context, VRAM_BANK_SELECT, saved_vram_bank);
    /* ROM banking is restored by the caller at 00:0EC0, not by this routine. */
}
