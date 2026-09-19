/* Host-only presentation. Never writes guest memory, PPU state, or CPU timing. */
#include "sprites.h"
#include <stdlib.h>
#include <string.h>

static uint8_t *entries;
static size_t count;
static uint32_t drawing[TT_HD_PIXELS], completed[TT_HD_PIXELS];
static uint8_t covered[160 * 144];
static unsigned coverage;
static int ready;
typedef struct { uint8_t key[24]; int index; } Cache;
static Cache cache[512 * 8];

void tt_sprites_reset(void) {
    memset(covered, 0, sizeof(covered));
    coverage = 0; ready = 0;
    for (size_t i = 0; i < 512 * 8; ++i) cache[i].index = -2;
}
int tt_sprites_active(void) { return entries != NULL; }
void tt_sprites_clear(void) { free(entries); entries = NULL; count = 0; tt_sprites_reset(); }
int tt_sprites_load(const uint8_t *data, size_t length) {
    if (!data || length < 12 || length > TT_SPRITE_MAX || memcmp(data, "TTSPK001", 8)) return 0;
    uint32_t n = (uint32_t)data[8] | ((uint32_t)data[9] << 8) |
                 ((uint32_t)data[10] << 16) | ((uint32_t)data[11] << 24);
    if (!n || n > 1024 || length != 12 + (size_t)n * TT_SPRITE_RECORD) return 0;
    for (size_t i = 0; i < n; ++i) {
        const uint8_t *entry = data + 12 + i * TT_SPRITE_RECORD;
        if (i && memcmp(entry - TT_SPRITE_RECORD, entry, 24) >= 0) return 0;
        for (size_t p = 27; p < TT_SPRITE_RECORD; p += 4)
            if (entry[p] != 0 && entry[p] != 255) return 0;
    }
    uint8_t *next = malloc(length - 12);
    if (!next) return 0;
    memcpy(next, data + 12, length - 12);
    free(entries); entries = next; count = n; tt_sprites_reset(); return 1;
}
static const uint8_t *lookup(const GBContext *ctx, const GBPPU *ppu,
                             unsigned bank, unsigned tile, unsigned palette) {
    uint8_t key[24];
    memcpy(key, ctx->vram + bank * 8192 + tile * 16, 16);
    memcpy(key + 16, ppu->obj_palette_ram + palette * 8, 8);
    Cache *c = &cache[(bank * 256 + tile) * 8 + palette];
    /* Validate the key on every use: games rewrite VRAM/palettes mid-frame. */
    if (c->index == -2 || memcmp(c->key, key, 24)) {
        memcpy(c->key, key, 24); c->index = -1;
        size_t lo = 0, hi = count;
        while (lo < hi) {
            size_t mid = lo + (hi - lo) / 2;
            int order = memcmp(key, entries + mid * TT_SPRITE_RECORD, 24);
            if (!order) { c->index = (int)mid; break; }
            if (order < 0) hi = mid; else lo = mid + 1;
        }
    }
    return c->index < 0 ? NULL : entries + (size_t)c->index * TT_SPRITE_RECORD + 24;
}
static uint32_t rgb555(const uint8_t *bytes) {
    unsigned v = bytes[0] | ((unsigned)bytes[1] << 8);
    return 0xff000000u | (((v & 31) * 255 / 31) << 16) |
           ((((v >> 5) & 31) * 255 / 31) << 8) | (((v >> 10) & 31) * 255 / 31);
}
static void mark(unsigned x, unsigned y) {
    unsigned index = y * 160 + x;
    if (!covered[index]) { covered[index] = 1; ++coverage; }
}
void tt_sprites_background(unsigned x, unsigned y, uint32_t rgb) {
    if (!entries || x >= 160 || y >= 144) return;
    unsigned i = y * 2 * 320 + x * 2;
    drawing[i] = drawing[i + 1] = drawing[i + 320] = drawing[i + 321] = rgb;
    mark(x, y);
}
void tt_sprites_dot(const GBPPU *ppu, const GBContext *ctx, uint32_t background,
                    uint8_t bg_raw, int bg_priority, int cgb_mode, uint32_t original) {
    unsigned x = ppu->draw_x, y = ppu->ly;
    if (!entries || x >= 160 || y >= 144) return;
    if (!cgb_mode) { tt_sprites_background(x, y, original); return; }
    uint32_t colors[4] = {background, background, background, background};
    int selected[4] = {256,256,256,256}, selected_x[4] = {256,256,256,256};
    if (ppu->lcdc & LCDC_OBJ_ENABLE) {
        for (unsigned slot = 0; slot < ppu->visible_sprite_count; ++slot) {
            unsigned index = ppu->visible_sprite_indices[slot];
            int left = (int)ppu->visible_sprite_x[slot] - 8;
            int px = (int)x - left;
            int py = (int)y - ((int)ppu->visible_sprite_y[slot] - 16);
            if (px < 0 || px >= 8 || py < 0 || py >= ppu->line_sprite_height) continue;
            unsigned flags = ctx->oam[index * 4 + 3];
            unsigned tile = ctx->oam[index * 4 + 2];
            if (ppu->line_sprite_height == 16) tile &= 254;
            if (flags & OAM_FLIP_Y) py = ppu->line_sprite_height - 1 - py;
            if (flags & OAM_FLIP_X) px = 7 - px;
            tile += (unsigned)py / 8; py &= 7;
            unsigned bank = (flags & OAM_CGB_BANK) ? 1 : 0, pal = flags & 7;
            const uint8_t *art = lookup(ctx, ppu, bank, tile, pal);
            const uint8_t *row = ctx->vram + bank * 8192 + tile * 16 + py * 2;
            unsigned raw = ((row[0] >> (7-px)) & 1) | (((row[1] >> (7-px)) & 1) << 1);
            for (unsigned sy = 0; sy < 2; ++sy) for (unsigned sx = 0; sx < 2; ++sx) {
                unsigned sub = sy * 2 + sx;
                uint32_t color;
                if (art) {
                    unsigned ax = px * 2 + ((flags & OAM_FLIP_X) ? 1-sx : sx);
                    unsigned ay = py * 2 + ((flags & OAM_FLIP_Y) ? 1-sy : sy);
                    const uint8_t *pixel = art + (ay * 16 + ax) * 4;
                    if (!pixel[3]) continue;
                    color = 0xff000000u | ((uint32_t)pixel[0] << 16) | ((uint32_t)pixel[1] << 8) | pixel[2];
                } else {
                    if (!raw) continue;
                    color = rgb555(ppu->obj_palette_ram + pal * 8 + raw * 2);
                }
                int wins = selected[sub] == 256 || (ppu->opri
                    ? left < selected_x[sub] || (left == selected_x[sub] && (int)index < selected[sub])
                    : (int)index < selected[sub]);
                if (!wins) continue;
                selected[sub] = (int)index; selected_x[sub] = left;
                /* Choose the object first, THEN apply BG priority. A hidden winning
                   object must not reveal a lower-priority object through it. */
                int hidden = bg_raw && (ppu->lcdc & LCDC_BG_ENABLE) &&
                             (bg_priority || (flags & OAM_PRIORITY));
                colors[sub] = hidden ? background : color;
            }
        }
    }
    unsigned dest = y * 2 * 320 + x * 2;
    drawing[dest] = colors[0]; drawing[dest+1] = colors[1];
    drawing[dest+320] = colors[2]; drawing[dest+321] = colors[3];
    mark(x, y);
}
void tt_sprites_finish(void) {
    if (!entries) return;
    /* Never publish partial frames after import, reset, LCD changes or restore. */
    ready = coverage == 160 * 144;
    if (ready) memcpy(completed, drawing, sizeof(completed));
    coverage = 0; memset(covered, 0, sizeof(covered));
}
const uint32_t *tt_sprites_frame(void) { return ready && entries ? completed : NULL; }
