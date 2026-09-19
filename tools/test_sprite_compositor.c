/* Synthetic, ROM-free tests for presentation priority and 2x sampling. */
#include "sprites.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static GBContext ctx;
static GBPPU ppu;
static uint8_t vram[16384], oam[160];
static uint8_t pack[12 + TT_SPRITE_RECORD];
static int bg_priority;
static const uint32_t bg = 0xff123456;
static uint32_t pixel(unsigned x, unsigned y) { const uint32_t *p=tt_sprites_frame(); assert(p); return p[y*320+x]; }
static void render(void) {
    for (unsigned y=0;y<144;y++) for(unsigned x=0;x<160;x++) tt_sprites_background(x,y,bg);
    ppu.ly=20;
    for(unsigned x=0;x<160;x++) { ppu.draw_x=x; tt_sprites_dot(&ppu,&ctx,bg,1,bg_priority,1,0xff000000); }
    tt_sprites_finish();
}
static void rgba(unsigned x,unsigned y,uint8_t r,uint8_t g,uint8_t b,uint8_t a) {
    uint8_t *p=pack+12+24+(y*16+x)*4;p[0]=r;p[1]=g;p[2]=b;p[3]=a;
}
int main(void) {
    ctx.vram=vram;ctx.oam=oam;
    memcpy(pack,"TTSPK001",8);pack[8]=1;
    for(unsigned y=0;y<8;y++) ctx.vram[y*2]=255; /* raw 1 */
    ppu.obj_palette_ram[2]=31; /* red */
    ppu.obj_palette_ram[8+2]=0; ppu.obj_palette_ram[8+3]=124; /* blue */
    memcpy(pack+12,ctx.vram,16);memcpy(pack+28,ppu.obj_palette_ram,8);
    rgba(0,0,0,255,0,255);rgba(1,0,255,255,0,255);
    assert(tt_sprites_load(pack,sizeof(pack)));
    assert(!tt_sprites_load(pack,sizeof(pack)-1));assert(tt_sprites_active());
    rgba(0,0,0,255,0,128);assert(!tt_sprites_load(pack,sizeof(pack)));rgba(0,0,0,255,0,255);
    ppu.lcdc=LCDC_OBJ_ENABLE|LCDC_BG_ENABLE|LCDC_LCD_ENABLE;
    ppu.line_sprite_height=8;ppu.visible_sprite_count=1;
    ppu.visible_sprite_indices[0]=0;ppu.visible_sprite_x[0]=18;ppu.visible_sprite_y[0]=36;
    render();assert(pixel(20,40)==0xff00ff00);assert(pixel(21,40)==0xffffff00);
    assert(pixel(22,40)==bg); /* transparent art removes original opaque pixels */
    ctx.oam[3]=OAM_FLIP_X;render();assert(pixel(35,40)==0xff00ff00);assert(pixel(34,40)==0xffffff00);
    assert(pixel(20,40)==bg);
    /* 8x16 Y flip selects the second tile and reverses subpixel order. */
    ppu.line_sprite_height=16;ctx.oam[3]=OAM_FLIP_Y;
    memcpy(ctx.vram+16,ctx.vram,16);rgba(0,15,255,0,255,255);
    assert(tt_sprites_load(pack,sizeof(pack)));render();assert(pixel(20,40)==0xffff00ff);
    ppu.line_sprite_height=8;ctx.oam[3]=0;
    ppu.visible_sprite_count=2;ppu.visible_sprite_indices[1]=1;
    ppu.visible_sprite_x[1]=18;ppu.visible_sprite_y[1]=36;ctx.oam[7]=1;
    render();assert(pixel(20,40)==0xff00ff00);assert(pixel(22,40)==0xff0000ff);
    /* The winning object is hidden by the background; object 1 must not leak through. */
    ctx.oam[3]=OAM_PRIORITY;render();assert(pixel(20,40)==bg);
    /* Disabling CGB BG priority allows that same object to show. */
    ppu.lcdc &= ~LCDC_BG_ENABLE;render();assert(pixel(20,40)==0xff00ff00);
    ppu.lcdc |= LCDC_BG_ENABLE;ctx.oam[3]=0;
    ppu.lcdc &= ~LCDC_OBJ_ENABLE;render();assert(pixel(20,40)==bg);
    ppu.lcdc |= LCDC_OBJ_ENABLE;
    bg_priority=1;render();assert(pixel(20,40)==bg);bg_priority=0;
    ctx.oam[3]=0;ppu.visible_sprite_x[1]=17;ppu.opri=0;
    render();assert(pixel(20,40)==0xff00ff00);ppu.opri=1;
    render();assert(pixel(20,40)==0xff0000ff);ppu.opri=0;
    /* A palette write invalidates a cached key and falls back to the live palette. */
    ppu.visible_sprite_count=1;ppu.obj_palette_ram[2]=3;render();assert(pixel(20,40)==0xff180000);
    ppu.obj_palette_ram[2]=31;render();assert(pixel(20,40)==0xff00ff00);
    /* A VRAM write must invalidate the cached pattern too. */
    ctx.vram[0]=0;ctx.vram[1]=255;ppu.obj_palette_ram[4]=0xe0;ppu.obj_palette_ram[5]=3;
    render();assert(pixel(20,40)==0xff00ff00); /* fallback raw 2 = green */
    assert(pixel(21,40)==0xff00ff00); /* not yellow replacement */
    /* Replacement art may fill an originally transparent pixel; left-edge clipping
       still samples the correct source coordinate. */
    ppu.visible_sprite_x[0]=4;ctx.vram[0]=ctx.vram[1]=0;
    memcpy(pack+12,ctx.vram,16);memcpy(pack+28,ppu.obj_palette_ram,8);
    rgba(8,0,0,255,255,255);assert(tt_sprites_load(pack,sizeof(pack)));
    render();assert(pixel(0,40)==0xff00ffff);
    tt_sprites_background(0,20,bg);assert(pixel(0,40)==0xff00ffff); /* completed buffer is stable */
    uint8_t duplicate[12+TT_SPRITE_RECORD*2];
    memcpy(duplicate,pack,sizeof(pack));duplicate[8]=2;
    memcpy(duplicate+12+TT_SPRITE_RECORD,pack+12,TT_SPRITE_RECORD);
    assert(!tt_sprites_load(duplicate,sizeof(duplicate)));assert(tt_sprites_active());
    tt_sprites_reset();tt_sprites_background(0,0,bg);tt_sprites_finish();assert(!tt_sprites_frame());
    tt_sprites_clear();assert(!tt_sprites_active());
    puts("Sprite compositor: sampling, transparency, flips, overlap, priority, fallback and partial-frame checks passed.");
}
