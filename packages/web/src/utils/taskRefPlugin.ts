import { Plugin, PluginKey } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';

const taskRefHighlightKey = new PluginKey('mlt-task-ref-highlight');

const INLINE_RE = /\[\[task:([a-z0-9][a-z0-9_-]{1,31})\|([^\]]+)\]\]/g;

function buildDecorations(doc: Parameters<typeof DecorationSet.create>[0]): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const text = node.text;
    if (!text?.includes('[[task:')) return;
    INLINE_RE.lastIndex = 0;
    let match = INLINE_RE.exec(text);
    while (match !== null) {
      const from = pos + match.index;
      const to = from + match[0].length;
      const shortId = match[1].toLowerCase();
      const label = match[2];
      decos.push(
        Decoration.widget(from, () => {
          const chip = document.createElement('span');
          chip.className = 'milkdown-task-ref';
          chip.dataset.taskRefShortId = shortId;
          chip.dataset.taskRefLabel = label;
          chip.title = `Task: ${label}`;
          chip.textContent = label;
          chip.setAttribute('contenteditable', 'false');
          return chip;
        }),
      );
      decos.push(
        Decoration.inline(from, to, {
          class: 'milkdown-task-ref-source',
        }),
      );
      match = INLINE_RE.exec(text);
    }
  });
  return DecorationSet.create(doc, decos);
}

/** Highlights `[[task:ref-id|label]]` as inline chips in the editor. */
export const taskRefHighlightPlugin = $prose(() => {
  return new Plugin({
    key: taskRefHighlightKey,
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
        return taskRefHighlightKey.getState(state);
      },
    },
  });
});
