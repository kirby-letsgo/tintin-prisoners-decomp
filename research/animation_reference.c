/* Semantic reference only; NOT linked into the game. Omits CPU flags, timing,
 * safepoints and register/stack effects. These are the recovered table operations,
 * not a replacement for all of 00:155C or its subsequent OAM layout setup. */
#include <stdint.h>

typedef struct {
    void *context;
    uint8_t (*read8)(void *, uint16_t);
    void (*write8)(void *, uint16_t, uint8_t);
} AnimationMemory;

static void select_rom_bank(AnimationMemory m, uint8_t bank) {
    m.write8(m.context, 0xff8f, bank);
    m.write8(m.context, 0x2000, bank);
}

static uint16_t read16(AnimationMemory m, uint16_t address) {
    uint16_t low = m.read8(m.context, address);
    return low | ((uint16_t)m.read8(m.context, (uint16_t)(address + 1)) << 8);
}

/* 00:357C: mapped_animation is the result of the still-unrecovered call to 6CE3.
 * phase is the high nibble of FFC7. The caller supplies those inputs here. */
void tintin_select_actor_frame_id_reference(AnimationMemory m,
                                           uint8_t mapped_animation,
                                           uint8_t phase) {
    select_rom_bank(m, 9);
    uint16_t relative = read16(m, 0x4000 + 2 * mapped_animation);
    uint16_t address = (uint16_t)(0x4084 + relative + 2 * (phase & 15));
    uint16_t frame = read16(m, address);
    m.write8(m.context, 0xdf73, (uint8_t)frame);
    m.write8(m.context, 0xdf74, (uint8_t)(frame >> 8));
    select_rom_bank(m, 1); /* Explicit bank 1, not the previous bank. */
}

/* Recovered record-copy portion of 00:155C, starting at 00:159D.
 * The full routine first checks DF72 & 7F == 0, handles previous-frame/facing
 * state, then executes this portion and continues with layout selection. */
void tintin_copy_actor_frame_record_reference(AnimationMemory m) {
    uint8_t saved_bank = m.read8(m.context, 0xff8f);
    uint16_t frame = read16(m, 0xdf73);
    m.write8(m.context, 0xc497, (uint8_t)frame);
    m.write8(m.context, 0xc498, (uint8_t)(frame >> 8));
    uint16_t source = (uint16_t)(0x4354 + frame * 51);
    select_rom_bank(m, 9);
    const uint16_t metadata_destinations[] = {0xc490, 0xc491, 0xc48d};
    for (unsigned i = 0; i < 3; ++i)
        m.write8(m.context, metadata_destinations[i], m.read8(m.context, source++));
    uint16_t destination = 0xde42;
    for (unsigned tile = 0; tile < 16; ++tile) {
        uint8_t encoded_bank = m.read8(m.context, source++);
        m.write8(m.context, destination++, (uint8_t)(encoded_bank + 1));
        m.write8(m.context, destination++, m.read8(m.context, source++));
        m.write8(m.context, destination++, m.read8(m.context, source++));
    }
    select_rom_bank(m, saved_bank);
}
