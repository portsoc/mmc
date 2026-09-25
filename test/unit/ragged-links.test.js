import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_BULLET,
  BULLET_PALETTE,
  DEFAULT_BULLET_STYLES,
  parseLine,
  serializeLine,
  ensureBullets,
  RaggedLinksController
} from '../../js/ragged-links.js';

describe('emoji bullet system & drag association', () => {
  it('DEFAULT_BULLET is black circle emoji', () => {
    assert.equal(DEFAULT_BULLET, '⚫');
  });

  it('BULLET_PALETTE defines foreground and background swatches', () => {
    assert.ok(BULLET_PALETTE.length >= 8);
    for (const swatch of BULLET_PALETTE) {
      assert.ok(swatch.id);
      assert.ok(swatch.bg !== undefined);
      assert.ok(swatch.fg !== undefined);
    }
  });

  it('DEFAULT_BULLET_STYLES provides out-of-the-box color associations', () => {
    assert.ok(DEFAULT_BULLET_STYLES['🟢']);
    assert.ok(DEFAULT_BULLET_STYLES['🟣']);
    assert.ok(DEFAULT_BULLET_STYLES['🔵']);
    assert.ok(DEFAULT_BULLET_STYLES['🔴']);
    assert.ok(DEFAULT_BULLET_STYLES['🟠']);
    assert.equal(DEFAULT_BULLET_STYLES['⚫'].bg, 'transparent');
  });

  it('parseLine extracts leading emoji bullet and text', () => {
    const res1 = parseLine('⚫ Standard bullet line');
    assert.equal(res1.bullet, '⚫');
    assert.equal(res1.text, 'Standard bullet line');

    const res2 = parseLine('🚑 Frontline paramedics');
    assert.equal(res2.bullet, '🚑');
    assert.equal(res2.text, 'Frontline paramedics');

    const res3 = parseLine('⭐ Key milestone');
    assert.equal(res3.bullet, '⭐');
    assert.equal(res3.text, 'Key milestone');

    const res4 = parseLine('🟢 Eco-friendly transport');
    assert.equal(res4.bullet, '🟢');
    assert.equal(res4.text, 'Eco-friendly transport');
  });

  it('parseLine assigns default bullet to lines without an emoji bullet', () => {
    const res = parseLine('Plain text without bullet');
    assert.equal(res.bullet, '⚫');
    assert.equal(res.text, 'Plain text without bullet');
  });

  it('parseLine does not treat brackets or punctuation as bullets', () => {
    const res1 = parseLine('[ 1,2,6] Tip: Colour code each value proposition');
    assert.equal(res1.bullet, '⚫');
    assert.equal(res1.text, '[ 1,2,6] Tip: Colour code each value proposition');

    const res2 = parseLine('[1] First priority response');
    assert.equal(res2.bullet, '⚫');
    assert.equal(res2.text, '[1] First priority response');

    const res3 = parseLine('(Parenthetical note)');
    assert.equal(res3.bullet, '⚫');
    assert.equal(res3.text, '(Parenthetical note)');

    const res4 = parseLine('"Quoted statement"');
    assert.equal(res4.bullet, '⚫');
    assert.equal(res4.text, '"Quoted statement"');
  });

  it('parseLine handles empty or whitespace lines gracefully', () => {
    const res1 = parseLine('');
    assert.equal(res1.bullet, '⚫');
    assert.equal(res1.text, '');

    const res2 = parseLine('   ');
    assert.equal(res2.bullet, '⚫');
    assert.equal(res2.text, '');

    const res3 = parseLine(null);
    assert.equal(res3.bullet, '⚫');
    assert.equal(res3.text, '');
  });

  it('serializeLine formats bullet and text properly', () => {
    assert.equal(serializeLine('⚫', 'Sample text'), '⚫ Sample text');
    assert.equal(serializeLine('🚑', 'Hospital unit'), '🚑 Hospital unit');
    assert.equal(serializeLine('⚫', ''), '⚫');
    assert.equal(serializeLine(null, 'No bullet specified'), '⚫ No bullet specified');
  });

  it('round-trip parsing and serialization preserves bullet and text', () => {
    const original = '🚑 Rapid response vital telemetry';
    const { bullet, text } = parseLine(original);
    const serialized = serializeLine(bullet, text);
    assert.equal(serialized, original);
  });

  it('serializeSection formats li elements with bullets into newline-separated text', () => {
    const mockSection = {
      querySelector: (sel) => {
        if (sel === '.canvas-list') {
          return {
            querySelectorAll: () => [
              { getAttribute: (attr) => attr === 'data-bullet' ? '🚑' : null, textContent: 'Rapid response' },
              { getAttribute: () => null, textContent: 'Routine check' },
              { getAttribute: (attr) => attr === 'data-bullet' ? '🟢' : null, textContent: 'Electric vehicle' }
            ]
          };
        }
        return null;
      }
    };

    const ctrl = new RaggedLinksController({}, null);
    const serialized = ctrl.serializeSection(mockSection);
    assert.equal(serialized, '🚑 Rapid response\n⚫ Routine check\n🟢 Electric vehicle');
  });

  it('_isBulletHit detects clicks or touches within the bullet hit target zone', () => {
    const ctrl = new RaggedLinksController({}, null);
    const mockLi = {
      getBoundingClientRect: () => ({ left: 10, top: 100, right: 300, bottom: 130 }),
      closest: () => null
    };

    // ClientX at 20 (relX = 10, within bulletZone) and clientY within row
    assert.equal(ctrl._isBulletHit(20, 115, mockLi), true);

    // ClientX at 24 (relX = 14, within bulletZone)
    assert.equal(ctrl._isBulletHit(24, 115, mockLi), true);

    // ClientX at 50 (relX = 40, text editing area past 1em padding)
    assert.equal(ctrl._isBulletHit(50, 115, mockLi), false);

    // ClientX at 150 (relX = 140, text editing area > bulletZone)
    assert.equal(ctrl._isBulletHit(150, 115, mockLi), false);

    // ClientY outside row bounds (above top)
    assert.equal(ctrl._isBulletHit(20, 80, mockLi), false);

    // ClientY outside row bounds (below bottom)
    assert.equal(ctrl._isBulletHit(20, 150, mockLi), false);

    // Negative relX < -10
    assert.equal(ctrl._isBulletHit(-20, 115, mockLi), false);

    // When inside a read-only list
    const readOnlyLi = {
      getBoundingClientRect: () => ({ left: 10, top: 100, right: 300, bottom: 130 }),
      closest: (sel) => sel.includes('contenteditable="false"') ? true : null
    };
    assert.equal(ctrl._isBulletHit(20, 115, readOnlyLi), false);

    // Null or invalid element
    assert.equal(ctrl._isBulletHit(20, 115, null), false);
  });

  it('parseLine strips legacy markdown list markers while assigning default bullet', () => {
    const dash = parseLine('- Legacy item with dash');
    assert.equal(dash.bullet, '⚫');
    assert.equal(dash.text, 'Legacy item with dash');

    const star = parseLine('* Legacy item with asterisk');
    assert.equal(star.bullet, '⚫');
    assert.equal(star.text, 'Legacy item with asterisk');

    const bullet = parseLine('• Legacy item with unicode bullet');
    assert.equal(bullet.bullet, '⚫');
    assert.equal(bullet.text, 'Legacy item with unicode bullet');
  });

  it('ensureBullets adds default emoji bullets to unbulleted lines and skips empty lines', () => {
    const raw = `First activity
Second activity

Third activity`;
    const res = ensureBullets(raw);
    assert.equal(res, '⚫ First activity\n⚫ Second activity\n⚫ Third activity');
  });

  it('ensureBullets preserves existing emoji bullets while adding bullets to plain lines', () => {
    const mixed = `⚫ First item
🟢 Second green item
Third plain item
🚑 Emergency item`;
    const res = ensureBullets(mixed);
    assert.equal(res, '⚫ First item\n🟢 Second green item\n⚫ Third plain item\n🚑 Emergency item');
  });

  it('ensureBullets handles empty or whitespace text gracefully', () => {
    assert.equal(ensureBullets(''), '');
    assert.equal(ensureBullets('   \n\n   '), '');
    assert.equal(ensureBullets(null), '');
  });

  it('serializeSectionItems serializes li elements into structured CanvasItem objects', () => {
    const mockSection = {
      id: 'ekp',
      querySelector: (sel) => {
        if (sel === '.canvas-list') {
          return {
            querySelectorAll: () => [
              {
                dataset: { id: 'i_kp_001' },
                textContent: 'Coast Guard Unit',
                getAttribute: (attr) => {
                  if (attr === 'data-bullet') return '🚑';
                  if (attr === 'data-color') return 'coral';
                  if (attr === 'data-assoc') return 'assoc_emergency';
                  return null;
                },
                style: {
                  getPropertyValue: (prop) => {
                    if (prop === '--row-bg') return '#FFE4E6';
                    if (prop === '--row-fg') return '#BE123C';
                    return '';
                  }
                }
              },
              {
                dataset: {},
                textContent: 'Volunteer Network',
                getAttribute: () => null,
                style: { getPropertyValue: () => '' }
              }
            ]
          };
        }
        return null;
      }
    };

    const ctrl = new RaggedLinksController({}, null);
    const items = ctrl.serializeSectionItems(mockSection);
    assert.equal(items.length, 2);
    assert.equal(items[0].id, 'i_kp_001');
    assert.equal(items[0].text, 'Coast Guard Unit');
    assert.equal(items[0].bullet, '🚑');
    assert.equal(items[0].color, 'coral');
    assert.equal(items[0].bg, '#FFE4E6');
    assert.equal(items[0].fg, '#BE123C');
    assert.equal(items[0].assocId, 'assoc_emergency');

    assert.ok(items[1].id.startsWith('i_kp_'));
    assert.equal(items[1].text, 'Volunteer Network');
    assert.equal(items[1].bullet, '⚫');
    assert.equal(items[1].color, '');
    assert.equal(items[1].assocId, '');
  });

  it('_createItem configures attributes, dataset, and styles from CanvasItem', () => {
    const mockLi = {
      dataset: {},
      style: {
        props: {},
        setProperty(k, v) { this.props[k] = v; },
        removeProperty(k) { delete this.props[k]; },
        getPropertyValue(k) { return this.props[k] || ''; }
      },
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      removeAttribute(k) { delete this.attrs[k]; },
      getAttribute(k) { return this.attrs[k] || null; }
    };
    globalThis.document = {
      createElement: () => mockLi
    };

    const ctrl = new RaggedLinksController({}, null);
    const item = {
      id: 'i_vp_123',
      text: 'Low carbon logistics',
      bullet: '🟢',
      color: 'emerald',
      bg: '#D1FAE5',
      fg: '#047857',
      assocId: 'assoc_green'
    };
    const li = ctrl._createItem(item, null, 'vp');
    assert.equal(li.dataset.id, 'i_vp_123');
    assert.equal(li.textContent, 'Low carbon logistics');
    assert.equal(li.getAttribute('data-bullet'), '🟢');
    assert.equal(li.getAttribute('data-color'), 'emerald');
    assert.equal(li.getAttribute('data-assoc'), 'assoc_green');
    // Named colours are left to the stylesheet (which has dark-mode variants).
    assert.equal(li.style.getPropertyValue('--row-bg'), '');
    assert.equal(li.style.getPropertyValue('--row-fg'), '');

    delete globalThis.document;
  });

  it('setSectionItems populates canvas-list with structured items', () => {
    const mockUl = {
      className: '',
      attrs: {},
      children: [],
      setAttribute(k, v) { this.attrs[k] = v; },
      replaceChildren() { this.children = []; },
      appendChild(child) { this.children.push(child); }
    };

    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'ul') return mockUl;
        return {
          tag,
          dataset: {},
          style: {
            props: {},
            setProperty(k, v) { this.props[k] = v; },
            removeProperty(k) { delete this.props[k]; },
            getPropertyValue(k) { return this.props[k] || ''; }
          },
          attrs: {},
          setAttribute(k, v) { this.attrs[k] = v; },
          removeAttribute(k) { delete this.attrs[k]; },
          getAttribute(k) { return this.attrs[k] || null; }
        };
      }
    };

    const mockSection = {
      id: 'eka',
      getAttribute: () => 'true',
      querySelector: (sel) => (sel === '.canvas-list' ? mockUl : null),
      replaceChildren(child) { mockUl.children = [child]; }
    };

    const ctrl = new RaggedLinksController({}, null);
    const items = [
      { id: 'i_ka_1', text: 'Water purification', bullet: '⚫', color: '', assocId: '' },
      { id: 'i_ka_2', text: 'Telemetry uplink', bullet: '⚡', color: 'azure', bg: '#E0F2FE', fg: '#0369A1', assocId: 'a_link' }
    ];

    ctrl.setSectionItems(mockSection, items);
    assert.equal(mockUl.children.length, 2);
    assert.equal(mockUl.children[0].textContent, 'Water purification');
    assert.equal(mockUl.children[1].textContent, 'Telemetry uplink');
    assert.equal(mockUl.children[1].getAttribute('data-bullet'), '⚡');
    assert.equal(mockUl.children[1].getAttribute('data-color'), 'azure');
    assert.equal(mockUl.children[1].getAttribute('data-assoc'), 'a_link');

    delete globalThis.document;
  });

  it('openPopup sets targetLi and displays popup anchored near the item, and toggles closed', () => {
    const mockPopup = {
      style: {},
      hidden: true,
      innerHTML: '',
      contains: () => false,
      querySelector: (sel) => ({
        focus() {},
        select() {},
        addEventListener() {}
      }),
      querySelectorAll: () => []
    };

    const ctrl = new RaggedLinksController({}, null);
    ctrl.popup = mockPopup;

    const mockLi = {
      getBoundingClientRect: () => ({ left: 50, top: 120, bottom: 150 }),
      getAttribute: (attr) => attr === 'data-bullet' ? '⚡' : null
    };
    globalThis.window = { scrollX: 0, scrollY: 0, innerWidth: 1024, innerHeight: 768 };

    ctrl.openPopup(mockLi);
    assert.equal(ctrl.targetLi, mockLi);
    assert.equal(mockPopup.hidden, false);
    assert.ok(mockPopup.innerHTML.includes('Bullet Character'));
    assert.ok(mockPopup.innerHTML.includes('⚡'));

    // Toggle close if clicked again after delay
    ctrl._openedAt = Date.now() - 200;
    ctrl.openPopup(mockLi);
    assert.equal(mockPopup.hidden, true);

    delete globalThis.window;
  });

  describe('linked item synchronization & cluster merging', () => {
    function createMockSection(fieldId, itemsData) {
      const lis = [];
      const section = {
        id: `e${fieldId}`,
        querySelector(sel) {
          if (sel === '.canvas-list') {
            return {
              querySelectorAll: () => lis
            };
          }
          return null;
        },
        querySelectorAll(sel) {
          if (sel === '.canvas-list li') return lis;
          return [];
        }
      };

      for (const item of itemsData) {
        const attrs = {
          'data-bullet': item.bullet && item.bullet !== DEFAULT_BULLET ? item.bullet : null,
          'data-color': item.color || null,
          'data-assoc': item.assocId || null
        };
        const styles = {
          '--row-bg': item.bg || '',
          '--row-fg': item.fg || ''
        };
        const li = {
          dataset: { id: item.id },
          textContent: item.text,
          getAttribute(k) { return attrs[k] ?? null; },
          setAttribute(k, v) { attrs[k] = v; },
          removeAttribute(k) { delete attrs[k]; },
          style: {
            getPropertyValue(k) { return styles[k] || ''; },
            setProperty(k, v) { styles[k] = v; },
            removeProperty(k) { delete styles[k]; }
          },
          closest(sel) {
            if (sel === '.e') return section;
            return null;
          }
        };
        lis.push(li);
      }

      return { section, lis };
    }

    it('getLinkedRows finds rows sharing data-assoc across sections', () => {
      const secKp = createMockSection('kp', [
        { id: 'i_kp_1', text: 'Partner 1', bullet: '🟢', color: 'emerald', assocId: 'assoc_link1' },
        { id: 'i_kp_2', text: 'Partner 2', bullet: '⚫' }
      ]);
      const secVp = createMockSection('vp', [
        { id: 'i_vp_1', text: 'Value 1', bullet: '🟢', color: 'emerald', assocId: 'assoc_link1' }
      ]);

      const ctrl = new RaggedLinksController({ kp: secKp.section, vp: secVp.section }, null);
      const linked = ctrl.getLinkedRows(secKp.lis[0]);

      assert.equal(linked.length, 2);
      assert.ok(linked.includes(secKp.lis[0]));
      assert.ok(linked.includes(secVp.lis[0]));
    });

    it('getLinkedRows detects matching non-default bullets without prior assocId', () => {
      const secKp = createMockSection('kp', [
        { id: 'i_kp_1', text: 'Partner 1', bullet: '🎯' }
      ]);
      const secBe = createMockSection('be', [
        { id: 'i_be_1', text: 'Beneficiary 1', bullet: '🎯' }
      ]);

      const ctrl = new RaggedLinksController({ kp: secKp.section, be: secBe.section }, null);
      const linked = ctrl.getLinkedRows(secKp.lis[0]);

      assert.equal(linked.length, 2);
      assert.ok(linked.includes(secKp.lis[0]));
      assert.ok(linked.includes(secBe.lis[0]));
    });

    it('getLinkedRows does not group rows with default black bullet ⚫', () => {
      const secKp = createMockSection('kp', [
        { id: 'i_kp_1', text: 'Partner 1', bullet: '⚫' },
        { id: 'i_kp_2', text: 'Partner 2', bullet: '⚫' }
      ]);

      const ctrl = new RaggedLinksController({ kp: secKp.section }, null);
      const linked = ctrl.getLinkedRows(secKp.lis[0]);

      assert.equal(linked.length, 1);
      assert.equal(linked[0], secKp.lis[0]);
    });

    it('applyStyleToLinked propagates emoji and color changes to all linked rows and notifies each section', () => {
      const notified = [];
      const secKp = createMockSection('kp', [
        { id: 'i_kp_1', text: 'Partner 1', bullet: '🟢', color: 'emerald', bg: '#D1FAE5', fg: '#047857', assocId: 'assoc_shared' }
      ]);
      const secVp = createMockSection('vp', [
        { id: 'i_vp_1', text: 'Value 1', bullet: '🟢', color: 'emerald', bg: '#D1FAE5', fg: '#047857', assocId: 'assoc_shared' }
      ]);

      const ctrl = new RaggedLinksController(
        { kp: secKp.section, vp: secVp.section },
        (fieldId) => notified.push(fieldId)
      );

      // User changes bullet to ⚡ and color to azure
      ctrl.applyStyleToLinked(secKp.lis[0], '⚡', '#E0F2FE', '#0369A1', 'azure');

      // Both items must have updated bullet and color
      assert.equal(secKp.lis[0].getAttribute('data-bullet'), '⚡');
      assert.equal(secKp.lis[0].getAttribute('data-color'), 'azure');
      assert.equal(secKp.lis[0].style.getPropertyValue('--row-bg'), '');
      assert.equal(secKp.lis[0].getAttribute('data-assoc'), 'assoc_shared');

      assert.equal(secVp.lis[0].getAttribute('data-bullet'), '⚡');
      assert.equal(secVp.lis[0].getAttribute('data-color'), 'azure');
      assert.equal(secVp.lis[0].style.getPropertyValue('--row-bg'), '');
      assert.equal(secVp.lis[0].getAttribute('data-assoc'), 'assoc_shared');

      // Both sections kp and vp must be notified so they save to Firestore / Yjs
      assert.ok(notified.includes('kp'));
      assert.ok(notified.includes('vp'));
    });

    it('selecting clear color swatch clears background but preserves data-assoc on linked rows', () => {
      const secKp = createMockSection('kp', [
        { id: 'i_kp_1', text: 'Partner 1', bullet: '🚑', color: 'coral', bg: '#FFE4E6', fg: '#BE123C', assocId: 'assoc_med' }
      ]);
      const secBe = createMockSection('be', [
        { id: 'i_be_1', text: 'Patient Group', bullet: '🚑', color: 'coral', bg: '#FFE4E6', fg: '#BE123C', assocId: 'assoc_med' }
      ]);

      const ctrl = new RaggedLinksController({ kp: secKp.section, be: secBe.section }, null);

      // User selects clear swatch (bg: transparent, fg: inherit, color: clear)
      ctrl.applyStyleToLinked(secKp.lis[0], '🚑', 'transparent', 'inherit', 'clear');

      // Association and bullet must still be intact
      assert.equal(secKp.lis[0].getAttribute('data-assoc'), 'assoc_med');
      assert.equal(secBe.lis[0].getAttribute('data-assoc'), 'assoc_med');
      assert.equal(secKp.lis[0].getAttribute('data-bullet'), '🚑');
      assert.equal(secBe.lis[0].getAttribute('data-bullet'), '🚑');

      // Background color is cleared
      assert.equal(secKp.lis[0].style.getPropertyValue('--row-bg'), '');
      assert.equal(secBe.lis[0].style.getPropertyValue('--row-bg'), '');
    });

    it('associateRows merges target cluster into source cluster when dragging', () => {
      const notified = [];
      const secKp = createMockSection('kp', [
        { id: 'i_kp_1', text: 'Source Item', bullet: '⭐', color: 'amber', bg: '#FEF3C7', fg: '#B45309', assocId: 'assoc_star' }
      ]);
      const secVp = createMockSection('vp', [
        { id: 'i_vp_1', text: 'Target Item 1', bullet: '🟢', color: 'emerald', bg: '#D1FAE5', fg: '#047857', assocId: 'assoc_green' },
        { id: 'i_vp_2', text: 'Target Item 2', bullet: '🟢', color: 'emerald', bg: '#D1FAE5', fg: '#047857', assocId: 'assoc_green' }
      ]);

      // Mock document.querySelectorAll for safe query inside associateRows
      globalThis.document = {
        querySelectorAll: (sel) => {
          if (sel.includes('assoc_green')) {
            return [secVp.lis[0], secVp.lis[1]];
          }
          return [];
        }
      };

      const ctrl = new RaggedLinksController(
        { kp: secKp.section, vp: secVp.section },
        (fieldId) => notified.push(fieldId)
      );

      // Drag Source onto Target Item 1
      ctrl.associateRows(secKp.lis[0], secVp.lis[0]);

      // Both target items must now belong to assoc_star and have the star bullet & color
      assert.equal(secVp.lis[0].getAttribute('data-assoc'), 'assoc_star');
      assert.equal(secVp.lis[0].getAttribute('data-bullet'), '⭐');
      assert.equal(secVp.lis[0].getAttribute('data-color'), 'amber');

      assert.equal(secVp.lis[1].getAttribute('data-assoc'), 'assoc_star');
      assert.equal(secVp.lis[1].getAttribute('data-bullet'), '⭐');
      assert.equal(secVp.lis[1].getAttribute('data-color'), 'amber');

      assert.ok(notified.includes('vp'));

      delete globalThis.document;
    });

    it('_createItem keeps default items transparent/white without data-color or row-bg', () => {
      const mockLi = {
        dataset: {},
        attrs: {},
        styles: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        removeAttribute(k) { delete this.attrs[k]; },
        getAttribute(k) { return this.attrs[k] || null; },
        style: {
          setProperty(k, v) { mockLi.styles[k] = v; },
          removeProperty(k) { delete mockLi.styles[k]; },
          getPropertyValue(k) { return mockLi.styles[k] || ''; }
        }
      };

      globalThis.document = { createElement: () => mockLi };

      // Simulate a controller where bulletStyles['⚫'] had been contaminated with azure
      const ctrl = new RaggedLinksController({}, null, {
        '⚫': { bg: '#E0F2FE', fg: '#0369A1', color: 'azure' }
      });

      const li = ctrl._createItem({ id: 'i_kp_1', text: 'Regular white item', bullet: '⚫' }, null, 'kp');

      assert.equal(li.getAttribute('data-color'), null, 'Default item must not have data-color');
      assert.equal(li.style.getPropertyValue('--row-bg'), '', 'Default item must have transparent/white row-bg');

      delete globalThis.document;
    });
  });

  describe('dynamic in-use combinations and main menu list filtering', () => {
    function createMockLi(bullet, color, bg, fg, assocId, text = 'Text') {
      const attrs = { 'data-bullet': bullet, 'data-color': color, 'data-assoc': assocId };
      const styles = { '--row-bg': bg, '--row-fg': fg };
      return {
        textContent: text,
        dataset: {},
        attrs,
        styles,
        getAttribute(k) { return this.attrs[k] || null; },
        setAttribute(k, v) { this.attrs[k] = v; },
        removeAttribute(k) { delete this.attrs[k]; },
        style: {
          getPropertyValue(k) { return styles[k] || ''; },
          setProperty(k, v) { styles[k] = v; },
          removeProperty(k) { delete styles[k]; }
        }
      };
    }

    it('getInUseCombinations returns empty array when canvas has only default items', () => {
      const li1 = createMockLi('⚫', '', '', '', '');
      const li2 = createMockLi('⚫', 'clear', 'transparent', 'inherit', '');
      const mockSec = {
        querySelector: () => ({ querySelectorAll: () => [li1, li2] })
      };
      const ctrl = new RaggedLinksController({ kp: mockSec }, null);

      const inUse = ctrl.getInUseCombinations();
      assert.equal(inUse.length, 0);

      const available = ctrl.getAvailablePresets();
      assert.ok(available.length >= 10);
      assert.ok(available.some(p => p.bullet === '🟢'));
    });

    it('Used color/emoji combination is removed from available presets and added to in-use list', () => {
      const li1 = createMockLi('🟢', 'emerald', '#D1FAE5', '#047857', 'assoc_green', 'Target goal');
      const li2 = createMockLi('⚫', '', '', '', '', 'Plain item');
      const mockSec = {
        querySelector: () => ({ querySelectorAll: () => [li1, li2] })
      };
      const ctrl = new RaggedLinksController({ kp: mockSec }, null);

      const inUse = ctrl.getInUseCombinations();
      assert.equal(inUse.length, 1);
      assert.equal(inUse[0].bullet, '🟢');
      assert.equal(inUse[0].color, 'emerald');
      assert.equal(inUse[0].assocId, 'assoc_green');
      assert.equal(inUse[0].count, 1);

      // Removed from available presets (main menu list)
      const available = ctrl.getAvailablePresets();
      assert.equal(available.some(p => p.bullet === '🟢'), false, '🟢 must be removed from available presets');
      assert.ok(available.some(p => p.bullet === '🟣'), 'Unused presets like 🟣 remain available');
    });

    it('Multiple used combinations are both removed from main menu list and aggregated in in-use list', () => {
      const li1 = createMockLi('🟢', 'emerald', '#D1FAE5', '#047857', 'assoc_green', 'Item 1');
      const li2 = createMockLi('🟢', 'emerald', '#D1FAE5', '#047857', 'assoc_green', 'Item 2');
      const li3 = createMockLi('⚡', 'azure', '#E0F2FE', '#0369A1', 'assoc_bolt', 'Item 3');

      const mockSec = {
        querySelector: () => ({ querySelectorAll: () => [li1, li2, li3] })
      };
      const ctrl = new RaggedLinksController({ kp: mockSec }, null);

      const inUse = ctrl.getInUseCombinations();
      assert.equal(inUse.length, 2);

      const greenCombo = inUse.find(c => c.bullet === '🟢');
      assert.ok(greenCombo);
      assert.equal(greenCombo.count, 2);

      const boltCombo = inUse.find(c => c.bullet === '⚡');
      assert.ok(boltCombo);
      assert.equal(boltCombo.count, 1);

      const available = ctrl.getAvailablePresets();
      assert.equal(available.some(p => p.bullet === '🟢'), false);
      assert.equal(available.some(p => p.bullet === '⚡'), false);
      assert.ok(available.some(p => p.bullet === '🎯'), '🎯 remains available');
    });

    it('Clearing or resetting an item restores it back to available presets', () => {
      const li1 = createMockLi('🟢', 'emerald', '#D1FAE5', '#047857', 'assoc_green', 'Item 1');
      const mockSec = {
        querySelector: () => ({ querySelectorAll: () => [li1] })
      };
      const ctrl = new RaggedLinksController({ kp: mockSec }, null);

      assert.equal(ctrl.getAvailablePresets().some(p => p.bullet === '🟢'), false);

      // Reset li1 to default
      li1.attrs['data-bullet'] = '⚫';
      li1.attrs['data-color'] = 'clear';
      li1.styles['--row-bg'] = 'transparent';

      assert.equal(ctrl.getInUseCombinations().length, 0);
      assert.equal(ctrl.getAvailablePresets().some(p => p.bullet === '🟢'), true, '🟢 returned to available presets');
    });

    it('Custom user emoji and color combination is captured in in-use list', () => {
      const customLi = createMockLi('🚀', 'teal', '#CCFBF1', '#0F766E', 'assoc_rocket', 'Deployment rocket');
      const mockSec = {
        querySelector: () => ({ querySelectorAll: () => [customLi] })
      };
      const ctrl = new RaggedLinksController({ de: mockSec }, null);

      const inUse = ctrl.getInUseCombinations();
      assert.equal(inUse.length, 1);
      assert.equal(inUse[0].bullet, '🚀');
      assert.equal(inUse[0].color, 'teal');
      assert.equal(inUse[0].assocId, 'assoc_rocket');
    });

    it('openPopup renders Available presets excluding in-use and In Use list at the end of the menu', () => {
      const li1 = createMockLi('🟢', 'emerald', '#D1FAE5', '#047857', 'assoc_green', 'Target goal');
      const li2 = createMockLi('⚫', '', '', '', '', 'Second item');
      const mockSec = {
        querySelector: () => ({ querySelectorAll: () => [li1, li2] })
      };

      const mockPopup = {
        style: {},
        hidden: true,
        innerHTML: '',
        contains: () => false,
        querySelector: () => ({
          focus() {},
          select() {},
          addEventListener() {}
        }),
        querySelectorAll: () => []
      };

      const ctrl = new RaggedLinksController({ kp: mockSec }, null);
      ctrl.popup = mockPopup;

      li2.getBoundingClientRect = () => ({ left: 40, top: 100, bottom: 130 });
      globalThis.window = { scrollX: 0, scrollY: 0, innerWidth: 1024, innerHeight: 768 };

      ctrl.openPopup(li2);

      assert.equal(mockPopup.hidden, false);
      // Popup has Available title and In Use title
      assert.ok(mockPopup.innerHTML.includes('Available'));
      assert.ok(mockPopup.innerHTML.includes('In Use'));

      // In the Available section, 🟢 is not present
      const availableSectionHtml = mockPopup.innerHTML.split('Available')[1].split('Block Color')[0];
      assert.equal(availableSectionHtml.includes('🟢'), false, '🟢 should not be in Available list');
      assert.ok(availableSectionHtml.includes('🟣'), '🟣 should be in Available list');

      // In the In Use section, 🟢 is present
      const inUseSectionHtml = mockPopup.innerHTML.split('In Use')[1];
      assert.ok(inUseSectionHtml.includes('🟢'), '🟢 should be in In Use list at end of menu');

      delete globalThis.window;
    });

    it('openPopup on an entry that already has style/links does not throw and renders remove action button', () => {
      const li1 = createMockLi('🟢', 'emerald', '#D1FAE5', '#047857', 'assoc_green', 'Target goal');
      const mockSec = {
        querySelector: () => ({ querySelectorAll: () => [li1] })
      };

      const mockPopup = {
        style: {},
        hidden: true,
        innerHTML: '',
        contains: () => false,
        querySelector: () => ({
          focus() {},
          select() {},
          addEventListener() {}
        }),
        querySelectorAll: () => []
      };

      const ctrl = new RaggedLinksController({ kp: mockSec }, null);
      ctrl.popup = mockPopup;

      li1.getBoundingClientRect = () => ({ left: 40, top: 100, bottom: 130 });
      globalThis.window = { scrollX: 0, scrollY: 0, innerWidth: 1024, innerHeight: 768 };

      // Should open without error on styled entry
      assert.doesNotThrow(() => {
        ctrl.openPopup(li1);
      });

      assert.equal(mockPopup.hidden, false);
      assert.ok(mockPopup.innerHTML.includes('Remove style &amp; association'));
      assert.ok(mockPopup.innerHTML.includes('data-action="reset-item"'));

      delete globalThis.window;
    });

    it('clearRowStyle removes custom bullet, color, and association from a row', () => {
      let notified = false;
      const ctrl = new RaggedLinksController({}, () => { notified = true; });
      const li = createMockLi('🟢', 'emerald', '#D1FAE5', '#047857', 'assoc_test', 'Item text');
      const mockSec = {
        id: 'ekp',
        querySelector: () => ({ querySelectorAll: () => [li] })
      };
      li.closest = (sel) => (sel === '.e' ? mockSec : null);

      ctrl.clearRowStyle(li, true);

      assert.equal(li.getAttribute('data-bullet'), '⚫');
      assert.equal(li.getAttribute('data-color'), null);
      assert.equal(li.getAttribute('data-assoc'), null);
      assert.equal(li.style.getPropertyValue('--row-bg'), '');
      assert.equal(li.style.getPropertyValue('--row-fg'), '');
      assert.equal(notified, true);
    });

    it('clearCluster removes style and association from all linked rows', () => {
      const changedSections = [];
      const li1 = createMockLi('⭐', 'amber', '#FEF3C7', '#B45309', 'shared_assoc', 'Goal A');
      const li2 = createMockLi('⭐', 'amber', '#FEF3C7', '#B45309', 'shared_assoc', 'Goal B');
      const secKp = { id: 'ekp', querySelector: () => ({ querySelectorAll: () => [li1] }) };
      const secKa = { id: 'eka', querySelector: () => ({ querySelectorAll: () => [li2] }) };
      li1.closest = (sel) => (sel === '.e' ? secKp : null);
      li2.closest = (sel) => (sel === '.e' ? secKa : null);

      const ctrl = new RaggedLinksController({ kp: secKp, ka: secKa }, (fieldId) => { changedSections.push(fieldId); });

      // Mock querySelectorAll for document
      globalThis.document = {
        querySelectorAll: (sel) => {
          if (sel.includes('.canvas-list li')) return [li1, li2];
          return [];
        }
      };

      ctrl.clearCluster(li1);

      assert.equal(li1.getAttribute('data-bullet'), '⚫');
      assert.equal(li1.getAttribute('data-assoc'), null);
      assert.equal(li2.getAttribute('data-bullet'), '⚫');
      assert.equal(li2.getAttribute('data-assoc'), null);
      assert.ok(changedSections.includes('kp'));
      assert.ok(changedSections.includes('ka'));

      delete globalThis.document;
    });
  });
});
