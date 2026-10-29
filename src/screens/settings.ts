import { formatUpdated } from '../domain/dates.ts';
import { CURRENCIES, currencySymbol, parseAmount, toInputValue } from '../domain/money.ts';
import type { AppData, Currency, Item, Theme } from '../domain/types.ts';
import { exportBackup, readBackup } from '../data/backup.ts';
import { lastSentAt, onShareState, shareNow, shareState, shopLink, startSharing, stopSharing } from '../data/share.ts';
import { addItem, eraseAll, loadSample, removeItem, replaceAll, updateItem, updateSettings } from '../data/store.ts';
import { confirmDialog } from '../ui/confirm.ts';
import { h, type Child } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
import { onDispose } from '../ui/lifecycle.ts';
import { toast } from '../ui/toast.ts';
import { money, screenHeader, segmented } from './shared.ts';

function section(title: string, description: string | null, ...children: Child[]): HTMLElement {
  return h('section', { class: 'card settings-section' },
    h('header', { class: 'card-header' },
      h('div', null, h('h2', { class: 'card-title' }, title), description && h('p', { class: 'card-subtitle' }, description))),
    children);
}

function field(label: string, id: string, control: HTMLElement, hint?: string): HTMLElement {
  return h('div', { class: 'field' },
    h('label', { class: 'field-label', for: id }, label),
    control,
    hint && h('p', { class: 'field-hint' }, hint));
}

function itemRow(item: Item): HTMLElement {
  const emoji = h('input', { id: `item-emoji-${item.id}`, class: 'emoji-input', value: item.emoji, maxlength: 8, 'aria-label': `Picture for ${item.name}` });
  emoji.addEventListener('change', () => updateItem(item.id, { emoji: emoji.value.trim() || '🛒' }));
  const name = h('input', { id: `item-name-${item.id}`, value: item.name, maxlength: 40, 'aria-label': 'Item name' });
  name.addEventListener('change', () => {
    const v = name.value.trim();
    if (v) updateItem(item.id, { name: v });
    else name.value = item.name;
  });
  const setQty = (d: number) => updateItem(item.id, { defaultQty: Math.max(0, Math.min(99, item.defaultQty + d)) });
  return h('li', { class: 'settings-item' },
    emoji,
    name,
    h('div', { class: 'stepper', role: 'group', 'aria-label': `Daily count of ${item.name}` },
      h('button', { id: `item-minus-${item.id}`, type: 'button', class: 'icon-btn', 'aria-label': 'Less', onClick: () => setQty(-1) }, icon('minus', 18)),
      h('output', { class: 'stepper-value' }, String(item.defaultQty)),
      h('button', { id: `item-plus-${item.id}`, type: 'button', class: 'icon-btn', 'aria-label': 'More', onClick: () => setQty(1) }, icon('plus', 18))),
    h('button', {
      type: 'button',
      class: 'icon-btn icon-btn-danger',
      'aria-label': `Remove ${item.name}`,
      onClick: async () => {
        const ok = await confirmDialog({
          title: `Remove ${item.name}?`,
          message: 'It will not show when you add what you bought. Old days keep it.',
          confirmLabel: 'Remove',
          danger: true,
        });
        if (ok) removeItem(item.id);
      },
    }, icon('trash', 18)));
}

async function copyText(text: string, input: HTMLInputElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // No clipboard API (e.g. plain http on the home Wi-Fi): fall back to the selected text.
    input.select();
    return document.execCommand('copy');
  }
}

/** Settings → Shop's page: make it, share the link, see when it last updated, stop it. */
function shopPageSection(data: AppData): HTMLElement {
  const { settings } = data;
  const name = h('input', { id: 'settings-share-name', value: settings.shareName, maxlength: 40, placeholder: 'e.g. Anbu', autocomplete: 'off' });
  name.addEventListener('change', () => updateSettings({ shareName: name.value.trim() }));
  const nameField = field('Your name (the shop sees this)', 'settings-share-name', name);

  if (!settings.shareId) {
    const make = h('button', { class: 'btn btn-primary', type: 'button' }, icon('store'), "Make the shop's page");
    make.addEventListener('click', async () => {
      make.disabled = true;
      const ok = await startSharing(name.value);
      toast(ok ? "The shop's page is ready. Send the link to the shop." : "Made. It will go online when you have internet.");
    });
    return section("Shop's page", 'Let the shop see, on their own phone, the money left and what you bought. They cannot change anything.',
      nameField,
      h('div', { class: 'btn-row btn-row-start share-actions' }, make));
  }

  const link = shopLink(settings.shareId);
  const linkInput = h('input', { id: 'settings-share-link', value: link, readonly: true, 'aria-label': "Shop's page link" });
  linkInput.addEventListener('focus', () => linkInput.select());

  const status = h('p', { class: 'share-status', role: 'status' });
  const paintStatus = () => {
    const state = shareState();
    const at = lastSentAt();
    status.replaceChildren(
      state === 'sending' ? "Updating the shop's page…"
      : state === 'waiting' ? 'No internet right now. It will update by itself.'
      : at ? `Shop's page updated ${formatUpdated(at)}` : "The shop's page is on.");
    status.classList.toggle('is-waiting', state === 'waiting');
    retry.hidden = state !== 'waiting';
  };
  const retry = h('button', { class: 'link-btn', type: 'button', onClick: () => void shareNow() }, 'Try again');
  onDispose(onShareState(paintStatus));
  paintStatus();

  const share = typeof navigator.share === 'function'
    ? h('button', {
        class: 'btn btn-secondary',
        type: 'button',
        onClick: () => navigator.share({ title: "Shop's page", text: 'My account at your shop:', url: link }).catch(() => {}),
      }, icon('send', 18), 'Send link')
    : null;

  return section("Shop's page", 'Send this link to the shop once. It only shows your list — you keep adding what you bought here, in this app. Their page updates by itself every time you save.',
    h('div', { class: 'share-status-row' }, status, retry),
    linkInput,
    h('div', { class: 'btn-row btn-row-start share-actions' },
      h('button', {
        class: 'btn btn-secondary',
        type: 'button',
        onClick: async () => toast((await copyText(link, linkInput)) ? 'Link copied' : 'Could not copy. Press and hold the link to copy it.'),
      }, icon('copy', 18), 'Copy link'),
      share,
      h('a', { class: 'btn btn-secondary', href: link, target: '_blank', rel: 'noopener' }, icon('open', 18), 'Open')),
    nameField,
    h('div', { class: 'btn-row btn-row-start share-actions' },
      h('button', {
        class: 'btn btn-danger-ghost',
        type: 'button',
        onClick: async () => {
          const ok = await confirmDialog({
            title: 'Stop sharing?',
            message: "The shop's page will be turned off and the link will stop working. Your list stays on this phone.",
            confirmLabel: 'Stop sharing',
            danger: true,
          });
          if (!ok) return;
          toast((await stopSharing()) ? "The shop's page is turned off" : 'Could not turn it off. Check the internet and try again.');
        },
      }, 'Stop sharing')));
}

export function settingsScreen(data: AppData): HTMLElement {
  const { settings } = data;

  // ----- Shop -----
  const shop = h('input', { id: 'settings-shop', value: settings.shopName, maxlength: 40, placeholder: 'e.g. Murugan Stores', autocomplete: 'off' });
  shop.addEventListener('change', () => updateSettings({ shopName: shop.value.trim() }));

  const currency = h('select', { id: 'settings-currency' },
    CURRENCIES.map((c) => h('option', { value: c.code, selected: c.code === settings.currency }, c.label)));
  currency.addEventListener('change', () => updateSettings({ currency: currency.value as Currency }));

  const low = h('input', { id: 'settings-low', inputmode: 'decimal', value: toInputValue(settings.lowBalance), autocomplete: 'off' });
  low.addEventListener('change', () => {
    const v = low.value.trim() === '0' ? 0 : parseAmount(low.value);
    if (v === null) low.value = toInputValue(settings.lowBalance);
    else updateSettings({ lowBalance: v });
  });

  // ----- Backup -----
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const backup = await readBackup(file);
      const ok = await confirmDialog({
        title: 'Bring back this copy?',
        message: `This copy has ${backup.entries.length} saved items. What is on this phone now (${data.entries.length} saved items) will be replaced by it.`,
        confirmLabel: 'Bring back',
        danger: data.entries.length > 0,
      });
      if (ok) {
        // A copy saved before sharing was turned on must not switch the shop's page off.
        const keep = !backup.settings.shareId && settings.shareId
          ? { shareId: settings.shareId, shareKey: settings.shareKey, shareName: backup.settings.shareName || settings.shareName }
          : {};
        replaceAll({ ...backup, settings: { ...backup.settings, ...keep } });
        toast(`Copy brought back: ${backup.entries.length} saved items`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not open that file.');
    }
  });

  const lastBackup = settings.lastBackupAt
    ? `Last copy saved: ${new Date(settings.lastBackupAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'No copy saved yet';

  const activeItems = data.items.filter((i) => !i.archived);

  return h(
    'div',
    { class: 'screen' },
    screenHeader('Settings'),
    h('div', { class: 'settings-grid' },
      section('Shop', null,
        field('Shop name', 'settings-shop', shop, 'Shown on the home screen.'),
        field('Money type', 'settings-currency', currency),
        field('Warn me when money left is this much or less', 'settings-low',
          h('div', { class: 'amount-input' }, h('span', { class: 'amount-prefix', 'aria-hidden': 'true' }, currencySymbol(settings.currency)), low),
          `Now: ${money(settings.lowBalance)}`)),

      shopPageSection(data),

      section('What I buy', 'How many I buy each day. It fills in by itself when I add what I bought.',
        activeItems.length
          ? h('ul', { class: 'settings-items' }, activeItems.map(itemRow))
          : h('p', { class: 'muted' }, 'No items. Only the money will be saved.'),
        h('button', {
          class: 'btn btn-secondary',
          type: 'button',
          onClick: () => {
            const item = addItem();
            requestAnimationFrame(() => document.getElementById(`item-name-${item.id}`)?.focus());
          },
        }, icon('plus'), 'Add item')),

      section('Screen', null,
        h('div', { class: 'field' },
          h('span', { class: 'field-label', id: 'theme-label' }, 'Colour'),
          segmented<Theme>('Colour', [
            { id: 'system', label: 'Auto' },
            { id: 'light', label: 'Light' },
            { id: 'dark', label: 'Dark' },
          ], settings.theme, (v) => updateSettings({ theme: v })))),

      section('Save a copy', 'Your list is kept only on this phone. Save a copy now and then, so you never lose it.',
        h('p', { class: 'muted' }, lastBackup),
        h('div', { class: 'btn-row btn-row-start' },
          h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => { exportBackup(); toast('Copy saved'); } }, icon('download'), 'Save a copy'),
          h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => fileInput.click() }, icon('upload'), 'Bring back a copy'),
          fileInput)),

      section('Start again', null,
        h('div', { class: 'btn-row btn-row-start' },
          !settings.shareId && h('button', {
            class: 'btn btn-secondary',
            type: 'button',
            onClick: async () => {
              if (data.entries.length) {
                const ok = await confirmDialog({
                  title: 'Show an example?',
                  message: `Your ${data.entries.length} saved items will be replaced by two months of example days.`,
                  confirmLabel: 'Replace',
                  danger: true,
                });
                if (!ok) return;
              }
              loadSample();
              toast('Example added');
            },
          }, 'Show an example'),
          h('button', {
            class: 'btn btn-danger-ghost',
            type: 'button',
            onClick: async () => {
              const ok = await confirmDialog({
                title: 'Delete everything?',
                message: settings.shareId
                  ? "Everything on this phone will be deleted and the shop's page turned off. You cannot get it back unless you saved a copy."
                  : 'Everything on this phone will be deleted. You cannot get it back unless you saved a copy.',
                confirmLabel: 'Delete everything',
                danger: true,
              });
              if (!ok) return;
              if (settings.shareId && !(await stopSharing())) {
                toast("Connect to the internet first, so the shop's page can be turned off too.");
                return;
              }
              eraseAll();
              toast('Everything deleted');
            },
          }, icon('trash', 18), 'Delete everything'))),
    ),
    h('p', { class: 'about' }, `Capital Tracker · version ${__APP_VERSION__} · works without internet`),
  );
}
