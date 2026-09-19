#pragma once
#include <stddef.h>
#include <stdint.h>
#include "gbrt.h"
#include "ppu.h"
#define TT_HD_PIXELS (320u * 288u)
#define TT_HD_BYTES (TT_HD_PIXELS * 4u)
#define TT_SPRITE_RECORD 1048u /* 16 tile bytes + 8 palette bytes + 16x16 RGBA */
#define TT_SPRITE_MAX (12u + 1024u * TT_SPRITE_RECORD)
int tt_sprites_load(const uint8_t *data, size_t length);
int tt_sprites_active(void);
void tt_sprites_clear(void);
void tt_sprites_reset(void);
void tt_sprites_background(unsigned x, unsigned y, uint32_t rgb);
void tt_sprites_dot(const GBPPU *ppu, const GBContext *ctx, uint32_t background,
                    uint8_t bg_raw, int bg_priority, int cgb_mode, uint32_t original);
void tt_sprites_finish(void);
const uint32_t *tt_sprites_frame(void);
