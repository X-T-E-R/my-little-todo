import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

const sparkRefHighlightKey = new PluginKey('mlt-spark-ref-highlight');

const INLINE_RE = /\[\[spark:([a-z0-9][a-z0-9:_-]{0,127})\|([^\]]+)\]\]/g;

function buildDecorations(doc: Parameters<typeof DecorationSet.create>[0]): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = node.text;
    if (!text?.includes('[[spark:')) return;
    INLINE_RE.lastIndex = 0;
    let match = INLINE_RE.exec(text);
    while (match !== null) {
      const from = pos + match.index;
      const to = from + match[0].length;
      const entryId = match[1];
      const label = match[2];
      decos.push(
        Decoration.widget(from, () => {
          const chip = document.createElement('span');
          chip.className = 'milkdown-spark-ref';
          chip.dataset.sparkRefId = entryId;
          chip.dataset.sparkRefLabel = label;
          chip.title = `Spark: ${label}`;
          chip.textContent = label;
          chip.setAttribute('contenteditable', 'false');
          return chip;
        }),
      );
      decos.push(
        Decoration.inline(from, to, {
          class: 'milkdown-spark-ref-source',
        }),
      );
      match = INLINE_RE.exec(text);
    }
  });
  return DecorationSet.create(doc, decos);
}

export const sparkRefHighlightPlugin = $prose(() => {
  return new Plugin({
    key: sparkRefHighlightKey,
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
        return sparkRefHighlightKey.getState(state);
      },
    },
  });
});
