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
  const emoji = h('input', { id: `item-emoji-${item.id}`, class: 'emoji-input', value: item.emoji, maxlength: 8, 'aria-label': `Emoji for ${item.name}` });
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
    h('div', { class: 'stepper', role: 'group', 'aria-label': `Usual quantity of ${item.name}` },
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
          message: 'It will no longer appear when you log a purchase. Past entries keep it.',
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
        title: 'Restore this backup?',
        message: `It has ${backup.entries.length} entries. Everything currently on this device (${data.entries.length} entries) will be replaced.`,
        confirmLabel: 'Restore',
        danger: data.entries.length > 0,
      });
      if (ok) {
        replaceAll(backup);
        toast(`Restored ${backup.entries.length} entries`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not read that file.');
    }
  });

  const lastBackup = settings.lastBackupAt
    ? `Last backup: ${new Date(settings.lastBackupAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'No backup yet';

  const activeItems = data.items.filter((i) => !i.archived);

  return h(
    'div',
    { class: 'screen' },
    screenHeader('Settings'),
    h('div', { class: 'settings-grid' },
      section('Shop', null,
        field('Shop name', 'settings-shop', shop, 'Shown on the home screen.'),
        field('Currency', 'settings-currency', currency),
        field('Warn me when the balance is at or below', 'settings-low',
          h('div', { class: 'amount-input' }, h('span', { class: 'amount-prefix', 'aria-hidden': 'true' }, currencySymbol(settings.currency)), low),
          `Currently ${money(settings.lowBalance)}.`)),

      section('What I buy', 'The usual quantity is filled in when you log a purchase.',
        activeItems.length
          ? h('ul', { class: 'settings-items' }, activeItems.map(itemRow))
          : h('p', { class: 'muted' }, 'No items. Purchases will only record the amount.'),
        h('button', {
          class: 'btn btn-secondary',
          type: 'button',
          onClick: () => {
            const item = addItem();
            requestAnimationFrame(() => document.getElementById(`item-name-${item.id}`)?.focus());
          },
        }, icon('plus'), 'Add item')),

      section('Appearance', null,
        h('div', { class: 'field' },
          h('span', { class: 'field-label', id: 'theme-label' }, 'Theme'),
          segmented<Theme>('Theme', [
            { id: 'system', label: 'System' },
            { id: 'light', label: 'Light' },
            { id: 'dark', label: 'Dark' },
          ], settings.theme, (v) => updateSettings({ theme: v })))),

      section('Backup', 'Your data is saved only in this browser on this device. Download a backup now and then.',
        h('p', { class: 'muted' }, lastBackup),
        h('div', { class: 'btn-row btn-row-start' },
          h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => { exportBackup(); toast('Backup downloaded'); } }, icon('download'), 'Download backup'),
          h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => fileInput.click() }, icon('upload'), 'Restore from file'),
          fileInput)),

      section('Data', null,
        h('div', { class: 'btn-row btn-row-start' },
          h('button', {
            class: 'btn btn-secondary',
            type: 'button',
            onClick: async () => {
              if (data.entries.length) {
                const ok = await confirmDialog({
                  title: 'Replace with sample data?',
                  message: `Your ${data.entries.length} entries will be replaced by about two months of example data.`,
                  confirmLabel: 'Replace',
                  danger: true,
                });
                if (!ok) return;
              }
              loadSample();
              toast('Sample data loaded');
            },
          }, 'Load sample data'),
          h('button', {
            class: 'btn btn-danger-ghost',
            type: 'button',
            onClick: async () => {
              const ok = await confirmDialog({
                title: 'Erase everything?',
                message: 'All entries, items and settings on this device will be deleted. This cannot be undone unless you have a backup.',
                confirmLabel: 'Erase everything',
                danger: true,
              });
              if (ok) {
                eraseAll();
                toast('All data erased');
              }
            },
          }, icon('trash', 18), 'Erase everything'))),
    ),
    h('p', { class: 'about' }, 'Capital Tracker 1.0 · works offline · no account, no tracking'),
  );
}
