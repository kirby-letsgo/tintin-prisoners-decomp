#include "bridge.h"
#include "tintin.h"
#include "gbrt.h"
#include <string.h>

/* All entry points are serialized by the Rust mutex. No SDL window or embedded ROM. */
uint8_t g_joypad_buttons = 0xff;
uint8_t g_joypad_dpad = 0xff;
static GBContext *game;
static int16_t pcm[TT_AUDIO_FRAMES * 2];
static uint32_t samples;

static void audio_sample(GBContext *ctx, int16_t left, int16_t right) {
    (void)ctx;
    if (samples < TT_AUDIO_FRAMES) {
        pcm[samples * 2] = left;
        pcm[samples * 2 + 1] = right;
        samples++;
    }
}
void tt_close(void) {
    if (game) gb_context_destroy(game);
    game = NULL;
    g_joypad_buttons = g_joypad_dpad = 0xff;
    samples = 0;
}
int tt_load(const uint8_t *rom, size_t len) {
    if (!rom || len != 1048576) return 0;
    GBContext *next = gb_context_create(tintin_default_config());
    if (!next) return 0;
    if (!next->ppu || !next->apu || !gb_context_load_rom(next, rom, len)) {
        gb_context_destroy(next);
        return 0;
    }
    next->mbc_type = rom[0x147];
    gb_context_reset(next, true);
    GBPlatformCallbacks callbacks = {0};
    callbacks.on_audio_sample = audio_sample;
    gb_set_platform_callbacks(next, &callbacks);
    tt_close();
    game = next;
    return 1;
}
static void put32(uint8_t *p, uint32_t value) {
    for (unsigned i = 0; i < 4; i++) p[i] = (uint8_t)(value >> (8 * i));
}
size_t tt_tick(uint8_t pressed, uint8_t *packet, size_t capacity) {
    if (!game || !packet || capacity < TT_PACKET_MAX) return 0;
    samples = 0;
    uint8_t previous = gb_read8(game, 0xff00);
    g_joypad_dpad = (uint8_t)~(pressed & 15);
    g_joypad_buttons = (uint8_t)~(pressed >> 4);
    if (previous & (uint8_t)~gb_read8(game, 0xff00) & 15) game->io[0x0f] |= 0x10;
    /* One physical display interval, even while the guest LCD is off. Respect
       the scheduler's frame safepoints while bounding each command's work. */
    uint32_t remaining = 70224;
    while (remaining > 0) {
        if (game->frame_done) gb_reset_frame(game);
        /* The runtime budget is already in system (not CPU) cycles. */
        uint32_t spent = gb_run_cycles(game, remaining);
        if (!spent) break;
        remaining = spent >= remaining ? 0 : remaining - spent;
    }
    gbrt_audio_sync(game);
    put32(packet, samples);
    put32(packet + 4, (uint32_t)game->completed_frames);
    const uint32_t *pixels = gb_get_framebuffer(game);
    if (!pixels) return 0;
    for (unsigned i = 0; i < 160 * 144; i++) {
        uint32_t color = pixels[i];
        packet[8 + i * 4] = (uint8_t)(color >> 16);
        packet[9 + i * 4] = (uint8_t)(color >> 8);
        packet[10 + i * 4] = (uint8_t)color;
        packet[11 + i * 4] = 255;
    }
    for (unsigned i = 0; i < samples * 2; i++) {
        packet[8 + TT_PIXELS + i * 2] = (uint8_t)pcm[i];
        packet[9 + TT_PIXELS + i * 2] = (uint8_t)((uint16_t)pcm[i] >> 8);
    }
    return 8 + TT_PIXELS + samples * 4;
}

int tt_save(const char *path) { return game && gb_context_save_state_file(game, path); }
/* Loading upstream directly can mutate memory before a late APU failure.
   Validate/restore in an independent context, then swap only on full success. */
static GBContext *read_candidate(const char *path) {
    if (!game) return NULL;
    GBContext *candidate = gb_context_create(tintin_default_config());
    if (!candidate) return NULL;
    if (!candidate->ppu || !candidate->apu ||
        !gb_context_load_rom(candidate, game->rom, game->rom_size) ||
        !gb_context_load_state_file(candidate, path)) {
        gb_context_destroy(candidate); return NULL;
    }
    GBPlatformCallbacks callbacks = {0};
    callbacks.on_audio_sample = audio_sample;
    gb_set_platform_callbacks(candidate, &callbacks);
    return candidate;
}
int tt_validate(const char *path) {
    GBContext *candidate = read_candidate(path);
    if (!candidate) return 0;
    gb_context_destroy(candidate); return 1;
}
int tt_restore(const char *path) {
    GBContext *candidate = read_candidate(path);
    if (!candidate) return 0;
    gb_context_destroy(game); game = candidate;
    g_joypad_buttons = g_joypad_dpad = 0xff; samples = 0; return 1;
}
