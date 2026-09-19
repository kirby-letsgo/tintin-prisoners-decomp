#pragma once
#include <stddef.h>
#include <stdint.h>
#define TT_PIXELS (160u * 144u * 4u)
#define TT_AUDIO_FRAMES 4096u
#define TT_PACKET_MAX (8u + TT_PIXELS + TT_AUDIO_FRAMES * 4u)
int tt_load(const uint8_t *rom, size_t len);
void tt_close(void);
size_t tt_tick(uint8_t pressed, uint8_t *packet, size_t capacity);
size_t tt_hd_frame(uint8_t *out, size_t capacity);

int tt_save(const char *path);
int tt_restore(const char *path);
int tt_validate(const char *path);
