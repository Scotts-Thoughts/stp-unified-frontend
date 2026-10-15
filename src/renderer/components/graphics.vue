<template>
    <div>
        <img class="canvas" ref="background_texture" :src="currentBackground" :style="backgroundStyle" />
        <img class="canvas" ref="old_background_texture" style="opacity: 0" />
        <img class="canvas" style="top: -160px;" :src="'images/elements/floor/pokeball.webp'" />
        <!-- The species art (core/overlay/player/SpeciesArt.ts): Yellow's, and Red/Blue's own pictures; a new picture cross-fades. -->
        <species-art :show="meta.game == 'Yellow'" img-class="pokemon_art" v-bind="artLook" transition="species-art-fade" :src="`images/pokemon/${pokemonArt}.webp`"></species-art>
        <species-art v-if="meta.game == 'Red and Blue'" img-class="pokemon_art2" v-bind="artLook" transition="species-art-fade" :src="`images/pokemon/Red_and_Blue/${pokemonArt}.webp`"></species-art>
        <div class="tinted-box" style="--drop-shadow: 0px 0px 1px #000000; --url: url(images/ui/stats.svg)"></div>
        <div class="tinted-box" style="--drop-shadow: 0px 0px 1px #000000; --url: url(images/ui/moveset.svg)"></div>
        <img class="svg" :src="'images/ui/current_hp_spd_stats_backgrounds.svg'"/>
        <img class="svg" style="opacity: .8; filter: drop-shadow(0px 0px 2px #000000);" :src="'images/ui/gamearea.svg'"/>
        <div class="genericLabels timerLabel" style="z-index: 200000; font-size: 16px;">time played at 4x game speed</div>
    </div>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import { textures } from '~/data/textures';
import { backgroundTextureStyle } from '~/core/overlay/backgroundTexture';
import { SpeciesArt } from '~/core/overlay/player/SpeciesArt';
import { lookAfterTextureChange, texturePath } from '~/core/overlay/textureLooks';
import { transition } from "../utils/transition";
import { useMetaStore } from "~/stores/metaStore";
import { useGameSpeciesData } from "~/stores/useGameSpeciesData";
import { storeToRefs } from "pinia";
const { artwork, background } = storeToRefs(useGameSpeciesData());
const meta = useMetaStore();

const background_texture = ref<HTMLImageElement | null>(null);
const old_background_texture = ref<HTMLImageElement | null>(null);

const currentBackground = computed(() => {
    return textures[background.value.texture] ?? textures['Bug 1'];
});

// Scaled up to cover the canvas when an offset or blur would show its edge (core/overlay/backgroundTexture.ts).
const backgroundStyle = computed(() => {
    const b = background.value;
    return backgroundTextureStyle({
        blur: b.blur, hue: b.hue, brightness: b.brightness, contrast: b.contrast, saturation: b.saturation,
        scale: b.scale, flip: b.flip, flipY: b.flip_y, offsetX: b.offset_x, offsetY: b.offset_y,
    });
});

// The art's saved adjustments, as SpeciesArt's props.
const artLook = computed(() => {
    const a = artwork.value;
    return { scale: a.scale, flip: a.flip, offsetX: a.offset_x, offsetY: a.offset_y, rotation: a.rotation, saturation: a.saturation };
});

const pokemonArt = computed(() => {
    return meta.currentSpecies === 'Backport'
        ? meta.starter
        : meta.currentSpecies || meta.starter;
});

// Picking a texture shows it in its default look unless the filters were styled by hand (core/overlay/textureLooks.ts).
watch(() => background.value.texture, (newTexture, oldTexture) => {
    const b = background.value;
    const look = lookAfterTextureChange(texturePath(textures, oldTexture), texturePath(textures, newTexture), b);
    if (look) Object.assign(b, look);
});

// Cross-fade between background textures whenever the texture changes (e.g. when switching species).
watch(currentBackground, async (newTexture, oldTexture) => {
    if (!oldTexture || newTexture === oldTexture || !old_background_texture.value) {
        return;
    }
    old_background_texture.value.src = oldTexture;
    old_background_texture.value.style.opacity = '1';
    await transition(
        (t) => {
            if (old_background_texture.value) {
                old_background_texture.value.style.opacity = String(1 - t);
            }
        },
        500
    );
    if (old_background_texture.value) {
        old_background_texture.value.src = '';
    }
});
</script>
