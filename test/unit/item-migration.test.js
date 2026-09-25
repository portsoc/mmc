import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_BULLET,
  parseLegacyLine,
  normalizeSection,
  itemsToPlainText,
  itemsToSyncText,
  normalizeCanvas,
  CANVAS_SECTIONS
} from '../../js/item-migration.js';

describe('item-migration', () => {
  describe('parseLegacyLine', () => {
    it('parses lines with standard emoji bullets', () => {
      const item = parseLegacyLine('🟢 Sustainable energy generation', 'vp');
      assert.equal(item.bullet, '🟢');
      assert.equal(item.text, 'Sustainable energy generation');
      assert.equal(item.color, 'emerald');
      assert.ok(item.id.startsWith('i_vp_'));
    });

    it('parses lines without bullets and assigns default bullet', () => {
      const item = parseLegacyLine('Clean drinking water supply', 'ka');
      assert.equal(item.bullet, DEFAULT_BULLET);
      assert.equal(item.text, 'Clean drinking water supply');
      assert.equal(item.color, '');
    });

    it('parses legacy markdown list markers (-, *, •)', () => {
      const dash = parseLegacyLine('- Regional healthcare trust', 'kp');
      assert.equal(dash.bullet, DEFAULT_BULLET);
      assert.equal(dash.text, 'Regional healthcare trust');

      const star = parseLegacyLine('* Emergency responders', 'be');
      assert.equal(star.bullet, DEFAULT_BULLET);
      assert.equal(star.text, 'Emergency responders');

      const bullet = parseLegacyLine('• University researchers', 'kr');
      assert.equal(bullet.bullet, DEFAULT_BULLET);
      assert.equal(bullet.text, 'University researchers');
    });

    it('extracts legacy bracketed associations ([1], [team-a]) into assocId', () => {
      const item1 = parseLegacyLine('[1] Rapid disaster response', 'vp');
      assert.equal(item1.assocId, '1');
      assert.equal(item1.text, 'Rapid disaster response');
      assert.equal(item1.bullet, DEFAULT_BULLET);

      const item2 = parseLegacyLine('[cohort-a] 🌿 Solar micro-grids', 'ka');
      assert.equal(item2.assocId, 'cohort-a');
      assert.equal(item2.bullet, '🌿');
      assert.equal(item2.text, 'Solar micro-grids');
    });

    it('handles empty or whitespace lines gracefully', () => {
      const item = parseLegacyLine('   ', 'mb');
      assert.equal(item.text, '');
      assert.equal(item.bullet, DEFAULT_BULLET);
    });
  });

  describe('normalizeSection', () => {
    it('normalizes multi-line plain text strings into CanvasItem array', () => {
      const raw = `⚫ First partner
🟢 Second partner
- Third partner
[alpha] Fourth partner`;
      const items = normalizeSection(raw, 'kp');
      assert.equal(items.length, 4);
      assert.equal(items[0].text, 'First partner');
      assert.equal(items[0].bullet, '⚫');

      assert.equal(items[1].text, 'Second partner');
      assert.equal(items[1].bullet, '🟢');
      assert.equal(items[1].color, 'emerald');

      assert.equal(items[2].text, 'Third partner');
      assert.equal(items[2].bullet, '⚫');

      assert.equal(items[3].text, 'Fourth partner');
      assert.equal(items[3].assocId, 'alpha');
    });

    it('validates existing item array and preserves attributes', () => {
      const input = [
        { id: 'i_custom_1', text: 'Existing item', bullet: '🟣', color: 'violet', assocId: 'g1' },
        { text: 'Item without id', bullet: '⚫' }
      ];
      const items = normalizeSection(input, 'ka');
      assert.equal(items.length, 2);
      assert.equal(items[0].id, 'i_custom_1');
      assert.equal(items[0].assocId, 'g1');
      assert.equal(items[0].color, 'violet');
      assert.ok(items[1].id.startsWith('i_ka_'));
    });

    it('returns empty array for empty or null content', () => {
      assert.deepEqual(normalizeSection('', 'vp'), []);
      assert.deepEqual(normalizeSection(null, 'vp'), []);
      assert.deepEqual(normalizeSection(undefined, 'vp'), []);
    });
  });

  describe('itemsToPlainText', () => {
    it('serializes items back to newline-delimited text', () => {
      const items = [
        { bullet: '⚫', text: 'First activity' },
        { bullet: '⚡', text: 'Second activity' }
      ];
      const text = itemsToPlainText(items);
      assert.equal(text, '⚫ First activity\n⚡ Second activity');
    });
  });

  describe('itemsToSyncText', () => {
    it('tags linked items so links survive a round trip through the shared text', () => {
      const items = [
        { bullet: '🟢', text: 'Coast Guard', assocId: 'assoc_ab12cd' },
        { bullet: '⚫', text: 'Unlinked', assocId: '' }
      ];
      const text = itemsToSyncText(items);
      assert.equal(text, '[assoc_ab12cd] 🟢 Coast Guard\n⚫ Unlinked');
      const back = normalizeSection(text, 'kp');
      assert.deepEqual(back.map((i) => [i.bullet, i.text, i.assocId]), [
        ['🟢', 'Coast Guard', 'assoc_ab12cd'],
        ['⚫', 'Unlinked', '']
      ]);
    });
  });

  describe('normalizeCanvas', () => {
    it('upgrades legacy canvas with only fields into modern canvas with items', () => {
      const legacy = {
        title: 'Disaster Relief Canvas',
        by: 'Portsmouth Team',
        fields: {
          title: 'Disaster Relief Canvas',
          by: 'Portsmouth Team',
          kp: '⚫ Local Authorities\n🟢 Coast Guard',
          vp: '⚫ Fast triage deployment'
        }
      };

      const normalized = normalizeCanvas(legacy);
      assert.equal(normalized.title, 'Disaster Relief Canvas');
      assert.equal(normalized.by, 'Portsmouth Team');
      assert.ok(Array.isArray(normalized.items.kp));
      assert.equal(normalized.items.kp.length, 2);
      assert.equal(normalized.items.kp[0].text, 'Local Authorities');
      assert.equal(normalized.items.kp[1].text, 'Coast Guard');
      assert.equal(normalized.items.kp[1].color, 'emerald');

      // Unset sections default to empty arrays
      assert.deepEqual(normalized.items.mb, []);
      for (const section of CANVAS_SECTIONS) {
        assert.ok(Array.isArray(normalized.items[section]));
      }
    });

    it('preserves existing items when already present', () => {
      const modern = {
        title: 'Modern Canvas',
        by: 'Team Modern',
        items: {
          kp: [{ id: 'i_kp_1', text: 'Partner A', bullet: '⭐', color: 'amber', assocId: 'star_group' }]
        },
        fields: {
          kp: '⭐ Partner A'
        }
      };

      const normalized = normalizeCanvas(modern);
      assert.equal(normalized.items.kp[0].id, 'i_kp_1');
      assert.equal(normalized.items.kp[0].assocId, 'star_group');
      assert.equal(normalized.items.kp[0].color, 'amber');
    });

    it('auto-groups items sharing non-default bullets across sections into a shared assocId', () => {
      const legacy = {
        fields: {
          kp: '🟢 Port Authority\n⚫ Regular item',
          vp: '🟢 Fast water transport',
          be: '🟢 Coastal residents'
        }
      };

      const normalized = normalizeCanvas(legacy);
      const kpGreen = normalized.items.kp.find((it) => it.bullet === '🟢');
      const vpGreen = normalized.items.vp.find((it) => it.bullet === '🟢');
      const beGreen = normalized.items.be.find((it) => it.bullet === '🟢');
      const kpDefault = normalized.items.kp.find((it) => it.bullet === '⚫');

      assert.ok(kpGreen.assocId, 'Green item in kp should have an assocId');
      assert.equal(kpGreen.assocId, vpGreen.assocId, 'kp and vp green items should share assocId');
      assert.equal(kpGreen.assocId, beGreen.assocId, 'kp and be green items should share assocId');
      assert.equal(kpDefault.assocId, '', 'Default bullet item should not have assocId');
    });

    it('items with assocId or default bullets do not default to azure or blue background', () => {
      const lineWithAssoc = parseLegacyLine('[team-1] Clean energy research', 'kp');
      assert.equal(lineWithAssoc.assocId, 'team-1');
      assert.equal(lineWithAssoc.color, '', 'Associated item without explicit color must have empty color');

      const regularLine = parseLegacyLine('⚫ Regular white item', 'vp');
      assert.equal(regularLine.color, '');

      const legacyWithAzureDefault = {
        items: {
          kp: [{ id: 'i_1', text: 'Accidental blue item', bullet: '⚫', color: 'azure', bg: '#E0F2FE' }]
        }
      };
      const cleaned = normalizeCanvas(legacyWithAzureDefault);
      assert.equal(cleaned.items.kp[0].color, '', 'Default bullet item with legacy azure must be sanitized');
      assert.equal(cleaned.items.kp[0].bg, '');
    });
  });
});
