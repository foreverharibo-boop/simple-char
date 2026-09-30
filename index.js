import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const MODULE = 'simpleCharacter';
const THEMES = ['soft', 'paper', 'polaroid', 'circle', 'magazine', 'sticker', 'tcg', 'glass', 'crystal-glass-light', 'bubble-pink', 'bubble-sky', 'heart-pink', 'heart-sky', 'bare-white', 'bare-black'];
const BLOCK_ID = 'rm_print_characters_block';

const defaultSettings = {
    enabled: true,
    theme: 'soft',
    useCustomAccent: false,
    accentColor: '#c8a0e6',
    useCustomCardColor: false,
    cardColor: '#8a8aa0',
    cardMin: 105,
    avatarScale: 100,
};

function getSettings() {
    if (!extension_settings[MODULE]) {
        extension_settings[MODULE] = structuredClone(defaultSettings);
    }
    for (const key of Object.keys(defaultSettings)) {
        if (extension_settings[MODULE][key] === undefined) {
            extension_settings[MODULE][key] = defaultSettings[key];
        }
    }
    return extension_settings[MODULE];
}

/** Write a CSS var / class only when it actually changes (avoids needless style recalcs on every card). */
function setVar(el, name, val) {
    if (el.style.getPropertyValue(name) !== val) el.style.setProperty(name, val);
}
function clearVar(el, name) {
    if (el.style.getPropertyValue(name)) el.style.removeProperty(name);
}
function setClass(el, cls, on) {
    if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

/** Apply theme preset + custom colors to the character block. */
function applyTheme() {
    const settings = getSettings();
    const block = document.getElementById(BLOCK_ID);
    if (!block) return;
    for (const t of THEMES) {
        setClass(block, 'sc-theme-' + t, settings.theme === t);
    }
    if (settings.useCustomAccent && settings.accentColor) {
        setVar(block, '--sc-accent', settings.accentColor);
    } else {
        clearVar(block, '--sc-accent');
    }
    if (settings.useCustomCardColor && settings.cardColor) {
        setVar(block, '--sc-card-bg',
            `color-mix(in srgb, ${settings.cardColor} 20%, transparent)`);
        setVar(block, '--sc-card-bg-hover',
            `color-mix(in srgb, ${settings.cardColor} 32%, transparent)`);
    } else {
        clearVar(block, '--sc-card-bg');
        clearVar(block, '--sc-card-bg-hover');
    }
    setVar(block, '--sc-card-min', (settings.cardMin || 105) + 'px');
    setVar(block, '--sc-avatar-scale', (settings.avatarScale || 100) + '%');
    scheduleSize();
}

/**
 * Coalesce all "please re-measure" requests into ONE run per frame.
 * (Previously every mutation / resize / click ran a full pass, and each
 * pass forced a layout per card.)
 */
let sizeRaf = 0;
function scheduleSize() {
    if (sizeRaf) return;
    sizeRaf = requestAnimationFrame(() => {
        sizeRaf = 0;
        if (getSettings().enabled) sizeAvatars();
    });
}

/**
 * Pin avatar heights (px) from their rendered width. Magazine and Crystal
 * Glass Light also pin the card height. The latter is intentional: some
 * SillyTavern grid/list CSS combinations report only the label's intrinsic
 * height to the outer grid, which lets the square avatar overflow into the
 * following row.
 *
 * Done as a batched READ phase followed by a WRITE phase so the browser
 * lays out once, not once per card, and values that didn't change are
 * not rewritten.
 */
function sizeAvatars() {
    const block = document.getElementById(BLOCK_ID);
    if (!block || !block.classList.contains('sc-enabled')) return;
    const magazine = getSettings().theme === 'magazine';
    const crystalGlass = getSettings().theme === 'crystal-glass-light';
    const ratio = magazine ? 4 / 3 : 1; // h/w
    const cards = block.querySelectorAll('.entity_block');
    const n = cards.length;
    if (!n) return;

    // READ: no writes in this loop -> a single layout flush.
    const avs = new Array(n);
    const widths = new Array(n);
    const labelHeights = new Array(n);
    for (let i = 0; i < n; i++) {
        const av = cards[i].querySelector('.avatar');
        avs[i] = av;
        widths[i] = av ? av.offsetWidth : 0;
        const label = cards[i].querySelector('.character_select_container');
        labelHeights[i] = label ? label.offsetHeight : 0;
    }

    // WRITE: only touch styles whose value actually changes.
    for (let i = 0; i < n; i++) {
        const card = cards[i];
        const av = avs[i];
        const w = widths[i];
        const h = w > 0 ? Math.round(w * ratio) + 'px' : '';

        if (av) {
            if (h) {
                if (av.style.getPropertyValue('height') !== h) {
                    av.style.setProperty('height', h, 'important');
                }
            } else if (av.style.getPropertyValue('height')) {
                av.style.removeProperty('height');
            }
        }

        // Magazine is image-only with an overlay, so its card equals the
        // portrait height. Crystal Glass has in-flow labels below the image;
        // padding (26px) + gap (8px) = 34px around those two regions.
        if (magazine && h) {
            if (card.style.getPropertyValue('height') !== h) {
                card.style.setProperty('height', h, 'important');
            }
        } else if (crystalGlass && w > 0) {
            const labelHeight = Math.max(labelHeights[i], 20);
            const cardHeight = Math.ceil(w + labelHeight + 34) + 'px';
            if (card.style.getPropertyValue('height') !== cardHeight) {
                card.style.setProperty('height', cardHeight, 'important');
            }
        } else if (card.style.getPropertyValue('height')) {
            card.style.removeProperty('height');
        }
    }
}

/** Toggle the reskin on/off. */
function applyEnabledState() {
    const settings = getSettings();
    const block = document.getElementById(BLOCK_ID);
    if (!block) return;
    setClass(block, 'sc-enabled', !!settings.enabled);
    if (settings.enabled) {
        applyTheme();
    } else {
        // Reskin is off: drop the pixel heights we pinned so the native list isn't clipped.
        for (const el of block.querySelectorAll('.entity_block, .entity_block .avatar')) {
            if (el.style.getPropertyValue('height')) el.style.removeProperty('height');
        }
    }
}

/** The list re-renders on search / folder nav; keep classes applied. */
function observeBlock() {
    const block = document.getElementById(BLOCK_ID);
    if (!block) return;

    // List content (or our classes) changed. Only re-apply if something is
    // actually missing, then queue ONE coalesced re-measure.
    const mo = new MutationObserver(() => {
        const settings = getSettings();
        setClass(block, 'sc-enabled', !!settings.enabled);
        if (settings.enabled) {
            for (const t of THEMES) setClass(block, 'sc-theme-' + t, settings.theme === t);
            scheduleSize();
        }
    });
    mo.observe(block, {
        childList: true,
        attributes: true,
        attributeFilter: ['class'],
    });

    // Fires when the panel gains a size (i.e. when it opens) or its WIDTH
    // changes. Height changes are ignored on purpose: sizeAvatars itself
    // changes the block's height, which used to re-trigger this observer.
    if (window.ResizeObserver) {
        let lastWidth = -1;
        const ro = new ResizeObserver((entries) => {
            const w = Math.round(entries[entries.length - 1].contentRect.width);
            if (w === lastWidth) return;
            lastWidth = w;
            if (getSettings().enabled) scheduleSize();
        });
        ro.observe(block);
    }
}

async function addSettingsPanel() {
    if (document.getElementById('sc-enabled')) return;
    const settings = getSettings();
    const html = `
    <div class="simple-character-settings">
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Simple Character</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label" for="sc-enabled">
                    <input id="sc-enabled" type="checkbox">
                    <span>Enable card grid</span>
                </label>

                <div class="flex-container flexFlowColumn" style="margin-top:8px;">
                    <label for="sc-theme"><small>Theme preset</small></label>
                    <select id="sc-theme" class="text_pole">
                        <option value="soft">Soft (default)</option>
                        <option value="paper">Paper</option>
                        <option value="polaroid">Polaroid</option>
                        <option value="circle">Circle</option>
                        <option value="magazine">Magazine</option>
                        <option value="sticker">Sticker</option>
                        <option value="tcg">Trading Card</option>
                        <option value="glass">Glass</option>
                        <option value="crystal-glass-light">Crystal Glass Light</option>
                        <option value="bubble-pink">Bubble Pink 🫧💕</option>
                        <option value="bubble-sky">Bubble Sky 🫧💙</option>
                        <option value="heart-pink">Heart Pink 💕</option>
                        <option value="heart-sky">Heart Sky 💙</option>
                        <option value="bare-white">Bare White ⬜</option>
                        <option value="bare-black">Bare Black ⬛</option>
                    </select>
                </div>

                <label class="checkbox_label" for="sc-use-accent" style="margin-top:8px;">
                    <input id="sc-use-accent" type="checkbox">
                    <span>Custom selected-card color</span>
                </label>
                <div class="flex-container alignItemsCenter" style="gap:8px;">
                    <input id="sc-accent-color" type="color" style="width:42px;height:28px;padding:0;border:none;background:none;cursor:pointer;">
                    <small class="text_muted">Selected card (glow, border &amp; dot)</small>
                </div>

                <label class="checkbox_label" for="sc-use-card" style="margin-top:8px;">
                    <input id="sc-use-card" type="checkbox">
                    <span>Custom normal-card color</span>
                </label>
                <div class="flex-container alignItemsCenter" style="gap:8px;">
                    <input id="sc-card-color" type="color" style="width:42px;height:28px;padding:0;border:none;background:none;cursor:pointer;">
                    <small class="text_muted">All unselected cards</small>
                </div>

                <hr style="margin:10px 0; opacity:0.2;">
                <div class="flex-container flexFlowColumn" style="margin-top:4px;">
                    <label for="sc-card-min"><small>Size (small ↔ large)</small></label>
                    <input id="sc-card-min" type="range" min="30" max="200" step="5" class="text_pole" style="width:100%;">
                </div>

                <small class="text_muted" style="display:block;margin-top:8px;">
                    Restyles the native character list into a card grid.
                    All original features keep working.
                </small>
            </div>
        </div>
    </div>`;

    $('#extensions_settings2').append(html);

    const $enabled = $('#sc-enabled');
    const $theme = $('#sc-theme');
    const $useAccent = $('#sc-use-accent');
    const $accent = $('#sc-accent-color');
    const $useCard = $('#sc-use-card');
    const $card = $('#sc-card-color');

    $enabled.prop('checked', settings.enabled);
    $theme.val(settings.theme);
    $useAccent.prop('checked', settings.useCustomAccent);
    $accent.val(settings.accentColor).prop('disabled', !settings.useCustomAccent);
    $useCard.prop('checked', settings.useCustomCardColor);
    $card.val(settings.cardColor).prop('disabled', !settings.useCustomCardColor);

    $enabled.on('change', function () {
        settings.enabled = $(this).prop('checked');
        saveSettingsDebounced();
        applyEnabledState();
    });
    $theme.on('change', function () {
        settings.theme = $(this).val();
        saveSettingsDebounced();
        applyTheme();
    });
    $useAccent.on('change', function () {
        settings.useCustomAccent = $(this).prop('checked');
        $accent.prop('disabled', !settings.useCustomAccent);
        saveSettingsDebounced();
        applyTheme();
    });
    $accent.on('input', function () {
        settings.accentColor = $(this).val();
        saveSettingsDebounced();
        applyTheme();
    });
    $useCard.on('change', function () {
        settings.useCustomCardColor = $(this).prop('checked');
        $card.prop('disabled', !settings.useCustomCardColor);
        saveSettingsDebounced();
        applyTheme();
    });
    $card.on('input', function () {
        settings.cardColor = $(this).val();
        saveSettingsDebounced();
        applyTheme();
    });

    const $cardMin = $('#sc-card-min');
    $cardMin.val(settings.cardMin);
    $cardMin.on('input', function () {
        settings.cardMin = parseInt($(this).val(), 10);
        saveSettingsDebounced();
        applyTheme();
    });
}

export async function init() {
    if (window.__simpleCharacterInit) return;
    window.__simpleCharacterInit = true;

    getSettings();
    await addSettingsPanel();
    applyEnabledState();
    observeBlock();

    // Re-apply when the character list panel is opened.
    $(document).on('click', '#rightNavDrawerIcon, #rm_button_characters', () => {
        setTimeout(applyEnabledState, 60);
    });
}

jQuery(async () => {
    try {
        await init();
    } catch (e) {
        console.error('[Simple Character] init failed:', e);
    }
});
