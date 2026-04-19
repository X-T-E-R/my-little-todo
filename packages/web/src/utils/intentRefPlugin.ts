import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

const intentRefHighlightKey = new PluginKey('mlt-intent-ref-highlight');

const INLINE_RE = /\[\[intent:([a-z0-9][a-z0-9:_-]{0,127})\|([^\]]+)\]\]/g;

function buildDecorations(doc: Parameters<typeof DecorationSet.create>[0]): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = node.text;
    if (!text?.includes('[[intent:')) return;
    INLINE_RE.lastIndex = 0;
    let match = INLINE_RE.exec(text);
    while (match !== null) {
      const from = pos + match.index;
      const to = from + match[0].length;
      const intentId = match[1];
      const label = match[2];
      decos.push(
        Decoration.widget(from, () => {
          const chip = document.createElement('span');
          chip.className = 'milkdown-intent-ref';
          chip.dataset.intentRefId = intentId;
          chip.dataset.intentRefLabel = label;
          chip.title = `Intent: ${label}`;
          chip.textContent = label;
          chip.setAttribute('contenteditable', 'false');
          return chip;
        }),
      );
      decos.push(
        Decoration.inline(from, to, {
          class: 'milkdown-intent-ref-source',
        }),
      );
      match = INLINE_RE.exec(text);
    }
  });
  return DecorationSet.create(doc, decos);
}

export const intentRefHighlightPlugin = $prose(() => {
  return new Plugin({
    key: intentRefHighlightKey,
    state: {
      init(_, { doc }) {
        return buildDecorations(doc);
      },
      apply(tr, oldDeco, _old, newState) {
        if (!tr.docChanged) return oldDeco;
        return buildDecorations(newState.doc);
      },
    },
    props: {
      decorations(state) {
        return intentRefHighlightKey.getState(state);
      },
    },
  });
});
