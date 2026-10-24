import { CURRENCIES, currencySymbol, parseAmount, toInputValue } from '../domain/money.ts';
import type { AppData, Currency, Item, Theme } from '../domain/types.ts';
import { exportBackup, readBackup } from '../data/backup.ts';
import { addItem, eraseAll, loadSample, removeItem, replaceAll, updateItem, updateSettings } from '../data/store.ts';
import { confirmDialog } from '../ui/confirm.ts';
import { h, type Child } from '../ui/dom.ts';
import { icon } from '../ui/icons.ts';
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
        replaceAll(backup);
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
          h('button', {
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
                message: 'Everything on this phone will be deleted. You cannot get it back unless you saved a copy.',
                confirmLabel: 'Delete everything',
                danger: true,
              });
              if (ok) {
                eraseAll();
                toast('Everything deleted');
              }
            },
          }, icon('trash', 18), 'Delete everything'))),
    ),
    h('p', { class: 'about' }, `Capital Tracker · version ${__APP_VERSION__} · works without internet`),
  );
}
