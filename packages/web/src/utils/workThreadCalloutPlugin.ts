import { Plugin, PluginKey } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { $prose } from '@milkdown/utils';
import {
  extractWorkThreadCalloutDescriptors,
  type WorkThreadCalloutDescriptor,
} from './workThreadDocSyntax';

const calloutHighlightKey = new PluginKey<WorkThreadCalloutDescriptor[]>(
  'mlt-work-thread-callout-highlight',
);

function clearEnhancedCallouts(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('[data-thread-callout-enhanced="true"]').forEach((node) => {
    node.classList.remove(
      'milkdown-callout',
      'milkdown-callout--intent',
      'milkdown-callout--spark',
      'milkdown-callout--block',
      'milkdown-callout--explore',
      'milkdown-callout--waiting',
      'milkdown-callout--interrupt',
      'milkdown-callout--collapsed',
      'milkdown-callout--active',
      'milkdown-callout--editing-header',
    );
    delete node.dataset.threadCalloutEnhanced;
    delete node.dataset.calloutKind;
    delete node.dataset.calloutTitle;
    delete node.dataset.calloutPath;
    delete node.dataset.calloutCollapsed;
    delete node.dataset.calloutToggle;
  });

  root.querySelectorAll<HTMLElement>('[data-thread-callout-header="true"]').forEach((node) => {
    node.classList.remove('milkdown-callout-header');
    delete node.dataset.threadCalloutHeader;
    delete node.dataset.calloutBadge;
    delete node.dataset.calloutTitle;
  });

  root.querySelectorAll<HTMLElement>('.milkdown-callout-toggle').forEach((node) => node.remove());
}

function firstParagraphChild(blockquote: HTMLElement): HTMLElement | null {
  for (const child of Array.from(blockquote.children)) {
    if (!(child instanceof HTMLElement)) continue;
    if (child.tagName.toLowerCase() === 'p') return child;
  }
  return null;
}

function applyDescriptor(view: EditorView, descriptor: WorkThreadCalloutDescriptor, selectionFrom: number) {
  const dom = view.nodeDOM(descriptor.pos);
  if (!(dom instanceof HTMLElement) || dom.tagName.toLowerCase() !== 'blockquote') return;

  dom.dataset.threadCalloutEnhanced = 'true';
  dom.dataset.calloutKind = descriptor.kind;
  dom.dataset.calloutTitle = descriptor.title || descriptor.badgeLabel;
  dom.dataset.calloutPath = descriptor.path ?? '';
  dom.dataset.calloutCollapsed = descriptor.collapsed ? 'true' : 'false';
  dom.dataset.calloutToggle = descriptor.collapsed ? '▸' : '▾';
  dom.classList.add('milkdown-callout', `milkdown-callout--${descriptor.kind}`);

  if (descriptor.collapsed) {
    dom.classList.add('milkdown-callout--collapsed');
  }
  if (selectionFrom >= descriptor.pos && selectionFrom <= descriptor.end) {
    dom.classList.add('milkdown-callout--active');
  }

  const header = firstParagraphChild(dom);
  if (header) {
    header.dataset.threadCalloutHeader = 'true';
    header.dataset.calloutBadge = descriptor.badgeLabel;
    header.dataset.calloutTitle = descriptor.title || descriptor.badgeLabel;
    header.classList.add('milkdown-callout-header');
    if (selectionFrom >= descriptor.headerFrom && selectionFrom <= descriptor.headerTo) {
      dom.classList.add('milkdown-callout--editing-header');
    }
  }

  if (descriptor.markerFrom != null && descriptor.markerTo != null) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'milkdown-callout-toggle';
    toggle.dataset.calloutMarkerFrom = String(descriptor.markerFrom);
    toggle.dataset.calloutMarkerTo = String(descriptor.markerTo);
    toggle.dataset.calloutCollapsed = descriptor.collapsed ? 'true' : 'false';
    toggle.setAttribute('contenteditable', 'false');
    toggle.setAttribute('aria-label', descriptor.collapsed ? 'Expand callout' : 'Collapse callout');
    toggle.textContent = descriptor.collapsed ? '▸' : '▾';
    dom.appendChild(toggle);
  }
}

function syncEnhancedCallouts(view: EditorView) {
  const root = view.dom as HTMLElement;
  clearEnhancedCallouts(root);
  const descriptors = calloutHighlightKey.getState(view.state) ?? [];
  const selectionFrom = view.state.selection.from;
  descriptors.forEach((descriptor) => applyDescriptor(view, descriptor, selectionFrom));
}

export const workThreadCalloutHighlightPlugin = $prose(() => {
  return new Plugin<WorkThreadCalloutDescriptor[]>({
    key: calloutHighlightKey,
    state: {
      init(_, { doc }) {
        return extractWorkThreadCalloutDescriptors(doc);
      },
      apply(tr, value, _old, newState) {
        if (!tr.docChanged) return value;
        return extractWorkThreadCalloutDescriptors(newState.doc);
      },
    },
    view(view) {
      syncEnhancedCallouts(view);
      return {
        update(nextView, prevState) {
          if (
            prevState.doc.eq(nextView.state.doc) &&
            prevState.selection.eq(nextView.state.selection)
          ) {
            return;
          }
          syncEnhancedCallouts(nextView);
        },
        destroy() {
          clearEnhancedCallouts(view.dom as HTMLElement);
        },
      };
    },
  });
});
