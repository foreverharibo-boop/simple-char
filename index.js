import { extension_settings } from '../../../extensions.js';
import { saveSettingsDebounced } from '../../../../script.js';

const MODULE = 'simpleCharacter';
const THEMES = ['soft', 'paper', 'polaroid', 'circle', 'magazine', 'sticker', 'tcg', 'glass'];
const BLOCK_ID = 'rm_print_characters_block';

const defaultSettings = {
    enabled: true,
    theme: 'soft',
    useCustomAccent: false,
    accentColor: '#c8a0e6',
    useCustomCardColor: false,
    cardColor: '#8a8aa0',
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

/** Apply theme preset + custom colors to the character block. */
function applyTheme() {
    const settings = getSettings();
    const block = document.getElementById(BLOCK_ID);
    if (!block) return;
    for (const t of THEMES) {
        block.classList.toggle('sc-theme-' + t, settings.theme === t);
    }
    if (settings.useCustomAccent && settings.accentColor) {
        block.style.setProperty('--sc-accent', settings.accentColor);
    } else {
        block.style.removeProperty('--sc-accent');
    }
    if (settings.useCustomCardColor && settings.cardColor) {
        block.style.setProperty('--sc-card-bg',
            `color-mix(in srgb, ${settings.cardColor} 20%, transparent)`);
        block.style.setProperty('--sc-card-bg-hover',
            `color-mix(in srgb, ${settings.cardColor} 32%, transparent)`);
    } else {
        block.style.removeProperty('--sc-card-bg');
        block.style.removeProperty('--sc-card-bg-hover');
    }
    sizeAvatars();
}

/**
 * Set each avatar's height in px from its rendered width.
 * CSS aspect-ratio / padding-% don't grow the grid row when the
 * avatar width is a percentage (treated as 0 during intrinsic row
 * sizing), so the card clips the photo. An explicit px height fixes it.
 */
function sizeAvatars() {
    const block = document.getElementById(BLOCK_ID);
    if (!block || !block.classList.contains('sc-enabled')) return;
    const ratio = getSettings().theme === 'magazine' ? 4 / 3 : 1; // h/w
    block.querySelectorAll('.entity_block .avatar').forEach((av) => {
        const w = av.offsetWidth;
        if (w > 0) {
            av.style.setProperty('height', Math.round(w * ratio) + 'px', 'important');
        }
    });
}

/** Toggle the reskin on/off. */
function applyEnabledState() {
    const settings = getSettings();
    const block = document.getElementById(BLOCK_ID);
    if (!block) return;
    block.classList.toggle('sc-enabled', !!settings.enabled);
    if (settings.enabled) applyTheme();
}

/** The list re-renders on search / folder nav; keep classes applied. */
function observeBlock() {
    const block = document.getElementById(BLOCK_ID);
    if (!block) return;

    // Re-apply classes + resize avatars when the list content changes.
    const mo = new MutationObserver(() => {
        const settings = getSettings();
        block.classList.toggle('sc-enabled', !!settings.enabled);
        if (settings.enabled) applyTheme();
    });
    mo.observe(block, {
        childList: true,
        attributes: true,
        attributeFilter: ['class'],
    });

    // Fires when the panel actually gains a size (i.e. when it opens),
    // which is exactly when avatar widths become measurable. This is
    // the reliable trigger the click/mutation handlers were missing.
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => {
            if (getSettings().enabled) sizeAvatars();
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

    // Avatar heights are pixel-based, so recompute on resize.
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(sizeAvatars, 120);
    });
}

jQuery(async () => {
    try {
        await init();
    } catch (e) {
        console.error('[Simple Character] init failed:', e);
    }
});
