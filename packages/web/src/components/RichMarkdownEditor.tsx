import { Crepe, CrepeFeature } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { editorViewCtx } from '@milkdown/core';
import type { Ctx } from '@milkdown/ctx';
import type { Node as ProseMirrorNode } from '@milkdown/prose/model';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react';
import { markdownToSlice } from '@milkdown/utils';
import { type Task, displayTaskTitle, taskRoleIds } from '@my-little-todo/core';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useRoleStore, useStreamStore, useTaskStore } from '../stores';
import { taskRefHighlightPlugin } from '../utils/taskRefPlugin';
import { isMilkdownSlashMenuClassName } from '../utils/richMarkdownNativeSlash';
import {
  findTaskRefDeleteRange,
  formatTaskRefMarkdown,
  resolveTaskRefToId,
} from '../utils/taskRefs';

export type MarkdownEditorVariant = 'compact' | 'standard' | 'immersive';
export type MarkdownTaskRefMode = 'inline-chip' | 'mini-card' | 'highlight-only';

export type RichMarkdownEditorHandle = {
  insertText: (text: string) => void;
  replaceTextRange: (
    from: number,
    to: number,
    text: string,
    selection?: {
      start: number;
      end?: number;
    },
  ) => void;
  replaceMarkdownRange: (
    from: number,
    to: number,
    markdown: string,
    selection?: {
      text?: string;
      fallback?: 'start' | 'end';
    },
  ) => void;
  focus: () => void;
};

export type MarkdownSlashCommand = {
  id: string;
  title: string;
  description?: string;
  keywords?: string[];
};

export type MarkdownSlashCommandSelection = {
  command: MarkdownSlashCommand;
  query: string;
  replaceFrom: number;
  replaceTo: number;
  anchor: {
    left: number;
    top: number;
  };
};

type RichMarkdownEditorProps = {
  editorId: string;
  initialMarkdown: string;
  onMarkdownChange: (markdown: string) => void;
  variant?: MarkdownEditorVariant;
  topBar?: boolean;
  toolbar?: boolean;
  blockEdit?: boolean;
  taskRefs?: boolean;
  taskRefMode?: MarkdownTaskRefMode;
  className?: string;
  autoFocus?: boolean;
  onSubmitShortcut?: () => void;
  onPasteCapture?: (event: ClipboardEvent) => void;
  taskRefAutocomplete?: boolean;
  slashCommands?: MarkdownSlashCommand[];
  onSlashCommand?: (payload: MarkdownSlashCommandSelection) => void;
  nativeSlashUi?: 'auto' | 'off';
};

type AutocompleteCandidate = {
  id: string;
  title: string;
  roleMatch: boolean;
  updatedAt: number;
};

type TaskRefAutocompleteState = {
  open: boolean;
  query: string;
  replaceFrom: number;
  replaceTo: number;
  left: number;
  top: number;
  selectedIndex: number;
};

type SlashCommandState = {
  open: boolean;
  query: string;
  replaceFrom: number;
  replaceTo: number;
  left: number;
  top: number;
  selectedIndex: number;
};

const EMPTY_AUTOCOMPLETE: TaskRefAutocompleteState = {
  open: false,
  query: '',
  replaceFrom: 0,
  replaceTo: 0,
  left: 0,
  top: 0,
  selectedIndex: 0,
};

const EMPTY_SLASH_MENU: SlashCommandState = {
  open: false,
  query: '',
  replaceFrom: 0,
  replaceTo: 0,
  left: 0,
  top: 0,
  selectedIndex: 0,
};

const variantClassMap: Record<MarkdownEditorVariant, string> = {
  compact: 'markdown-editor markdown-editor--compact',
  standard: 'markdown-editor markdown-editor--standard',
  immersive: 'markdown-editor markdown-editor--immersive',
};

function clampOverlayPosition(
  left: number,
  top: number,
  wrapperRect: DOMRect | undefined,
  panelWidth: number,
  panelHeight: number,
): { left: number; top: number } {
  if (!wrapperRect) {
    return {
      left: Math.max(12, left),
      top: Math.max(24, top),
    };
  }

  const maxLeft = Math.max(12, wrapperRect.width - panelWidth - 12);
  const maxTop = Math.max(24, wrapperRect.height - panelHeight - 12);
  return {
    left: Math.max(12, Math.min(left, maxLeft)),
    top: Math.max(24, Math.min(top, maxTop)),
  };
}

function getEditorView(ctx: Ctx): EditorView {
  return ctx.get(editorViewCtx);
}

function findTextSelectionInRange(
  doc: ProseMirrorNode,
  from: number,
  to: number,
  text: string,
): { start: number; end: number } | null {
  if (!text) return null;
  let match: { start: number; end: number } | null = null;
  doc.nodesBetween(from, to, (node, pos) => {
    if (match || !node.isText || !node.text) return;
    const index = node.text.indexOf(text);
    if (index < 0) return;
    match = {
      start: pos + index,
      end: pos + index + text.length,
    };
  });
  return match;
}

function buildAutocompleteCandidates(
  tasks: Task[],
  currentRoleId: string | null,
  query: string,
): AutocompleteCandidate[] {
  const normalizedQuery = query.trim().toLowerCase();
  return tasks
    .filter((task) => task.status !== 'archived')
    .map((task) => ({
      id: task.id,
      title: displayTaskTitle(task).trim(),
      roleMatch: currentRoleId ? taskRoleIds(task).includes(currentRoleId) : false,
      updatedAt: task.updatedAt.getTime(),
    }))
    .filter((candidate) => candidate.title.length > 0)
    .filter((candidate) =>
      normalizedQuery.length === 0 ? true : candidate.title.toLowerCase().includes(normalizedQuery),
    )
    .sort((a, b) => {
      if (a.roleMatch !== b.roleMatch) return a.roleMatch ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, 8);
}

function getAutocompleteContext(view: EditorView): {
  query: string;
  replaceFrom: number;
  replaceTo: number;
  left: number;
  top: number;
} | null {
  const { state } = view;
  const { from, to } = state.selection;
  if (from !== to) return null;
  const windowStart = Math.max(1, from - 120);
  const textBefore = state.doc.textBetween(windowStart, from, '\n', '\0');
  const markerIndex = textBefore.lastIndexOf('[[');
  if (markerIndex < 0) return null;
  const trailing = textBefore.slice(markerIndex + 2);
  if (trailing.includes(']]') || trailing.includes('\n') || trailing.includes('\0')) return null;
  const replaceFrom = from - (textBefore.length - markerIndex);
  const coords = view.coordsAtPos(from);
  return {
    query: trailing.trim(),
    replaceFrom,
    replaceTo: to,
    left: coords.left,
    top: coords.bottom + 8,
  };
}

function deleteTaskRefAtCursor(view: EditorView, direction: 'backward' | 'forward'): boolean {
  const { from, to } = view.state.selection;
  if (from !== to) return false;
  const windowStart = Math.max(1, from - 160);
  const windowEnd = Math.min(view.state.doc.content.size, from + 160);
  const textWindow = view.state.doc.textBetween(windowStart, windowEnd, '\n', '\0');
  const relativeCursor = from - windowStart;
  const range = findTaskRefDeleteRange(textWindow, relativeCursor, direction);
  if (!range) return false;
  view.dispatch(view.state.tr.delete(windowStart + range.from, windowStart + range.to));
  view.focus();
  return true;
}

function getSlashCommandContext(view: EditorView): {
  query: string;
  replaceFrom: number;
  replaceTo: number;
  left: number;
  top: number;
} | null {
  const { state } = view;
  const { from, to } = state.selection;
  if (from !== to) return null;
  const windowStart = Math.max(1, from - 120);
  const textBefore = state.doc.textBetween(windowStart, from, '\n', '\0');
  const markerIndex = textBefore.lastIndexOf('/');
  if (markerIndex < 0) return null;
  const previousChar = textBefore[markerIndex - 1];
  if (previousChar && !/\s|\0/.test(previousChar)) return null;
  const trailing = textBefore.slice(markerIndex + 1);
  if (trailing.includes('\n') || trailing.includes('\0') || /\s/.test(trailing)) return null;
  const replaceFrom = from - (textBefore.length - markerIndex);
  const coords = view.coordsAtPos(from);
  return {
    query: trailing.trim().toLowerCase(),
    replaceFrom,
    replaceTo: to,
    left: coords.left,
    top: coords.bottom + 8,
  };
}

function filterSlashCommands(
  commands: MarkdownSlashCommand[],
  query: string,
): MarkdownSlashCommand[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return commands;
  return commands.filter((command) =>
    [command.title, command.description ?? '', ...(command.keywords ?? [])]
      .join(' ')
      .toLowerCase()
      .includes(normalized),
  );
}

const RichMarkdownEditorInner = forwardRef<RichMarkdownEditorHandle, RichMarkdownEditorProps>(
  function RichMarkdownEditorInner(
    {
      editorId,
      initialMarkdown,
      onMarkdownChange,
      variant = 'standard',
      topBar = true,
      toolbar = false,
      blockEdit = false,
      taskRefs = false,
      taskRefMode = 'inline-chip',
      className = '',
      autoFocus = false,
      onSubmitShortcut,
      onPasteCapture,
      taskRefAutocomplete = false,
      slashCommands = [],
      onSlashCommand,
      nativeSlashUi = 'auto',
    },
    ref,
  ) {
    const { t } = useTranslation('think');
    const cbRef = useRef(onMarkdownChange);
    cbRef.current = onMarkdownChange;
    const submitShortcutRef = useRef(onSubmitShortcut);
    submitShortcutRef.current = onSubmitShortcut;
    const pasteCaptureRef = useRef(onPasteCapture);
    pasteCaptureRef.current = onPasteCapture;
    const slashCommandRef = useRef(onSlashCommand);
    slashCommandRef.current = onSlashCommand;

    const [, getEditor] = useInstance();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const syncAutocompleteRef = useRef<(() => void) | null>(null);
    const autocompleteRef = useRef<TaskRefAutocompleteState>(EMPTY_AUTOCOMPLETE);
    const [autocomplete, setAutocomplete] = useState<TaskRefAutocompleteState>(EMPTY_AUTOCOMPLETE);
    const slashMenuRef = useRef<SlashCommandState>(EMPTY_SLASH_MENU);
    const [slashMenu, setSlashMenu] = useState<SlashCommandState>(EMPTY_SLASH_MENU);
    const [isCreatingTask, setIsCreatingTask] = useState(false);

    const tasks = useTaskStore((s) => s.tasks);
    const addEntry = useStreamStore((s) => s.addEntry);
    const currentRoleId = useRoleStore((s) => s.currentRoleId);
    const tasksRef = useRef(tasks);
    tasksRef.current = tasks;
    const currentRoleIdRef = useRef(currentRoleId);
    currentRoleIdRef.current = currentRoleId;

    const autocompleteCandidates = useMemo(
      () => buildAutocompleteCandidates(tasks, currentRoleId, autocomplete.query),
      [autocomplete.query, currentRoleId, tasks],
    );
    const visibleSlashCommands = useMemo(
      () => filterSlashCommands(slashCommands, slashMenu.query),
      [slashCommands, slashMenu.query],
    );

    useEffect(() => {
      autocompleteRef.current = autocomplete;
    }, [autocomplete]);

    useEffect(() => {
      slashMenuRef.current = slashMenu;
    }, [slashMenu]);

    useEffect(() => {
      const wrapper = wrapperRef.current;
      if (!wrapper || nativeSlashUi !== 'off' || typeof MutationObserver === 'undefined') return;

      const hideSlashMenu = (element: HTMLElement) => {
        element.style.display = 'none';
        element.style.visibility = 'hidden';
        element.style.pointerEvents = 'none';
        element.setAttribute('data-native-slash-hidden', 'true');
      };

      const hideNativeSlashMenus = (root: ParentNode) => {
        root.querySelectorAll<HTMLElement>('.milkdown-slash-menu').forEach(hideSlashMenu);
      };

      hideNativeSlashMenus(wrapper);

      const observer = new MutationObserver((records) => {
        for (const record of records) {
          record.addedNodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) return;
            if (isMilkdownSlashMenuClassName(node.className)) {
              hideSlashMenu(node);
            }
            hideNativeSlashMenus(node);
          });
        }
      });

      observer.observe(wrapper, {
        childList: true,
        subtree: true,
      });

      return () => observer.disconnect();
    }, [nativeSlashUi]);

    useEffect(() => {
      if (!autocomplete.open) return;
      setAutocomplete((prev) => ({
        ...prev,
        selectedIndex:
          autocompleteCandidates.length === 0
            ? 0
            : Math.min(prev.selectedIndex, autocompleteCandidates.length - 1),
      }));
    }, [autocomplete.open, autocompleteCandidates.length]);

    const closeAutocomplete = useCallback(() => {
      autocompleteRef.current = EMPTY_AUTOCOMPLETE;
      setAutocomplete(EMPTY_AUTOCOMPLETE);
    }, []);

    const closeSlashMenu = useCallback(() => {
      slashMenuRef.current = EMPTY_SLASH_MENU;
      setSlashMenu(EMPTY_SLASH_MENU);
    }, []);

    const withEditorView = useCallback(
      <T,>(run: (view: EditorView) => T): T | undefined => {
        const editor = getEditor();
        if (!editor) return undefined;
        return editor.action((ctx) => run(getEditorView(ctx)));
      },
      [getEditor],
    );

    const replaceTextRange = useCallback(
      (
        from: number,
        to: number,
        text: string,
        selection?: {
          start: number;
          end?: number;
        },
      ) => {
        withEditorView((view) => {
          const tr = view.state.tr.insertText(text, from, to);
          const selectionStartOffset = Math.max(
            0,
            Math.min(selection?.start ?? text.length, text.length),
          );
          const selectionEndOffset = Math.max(
            selectionStartOffset,
            Math.min(selection?.end ?? selectionStartOffset, text.length),
          );
          tr.setSelection(
            TextSelection.create(tr.doc, from + selectionStartOffset, from + selectionEndOffset),
          );
          view.dispatch(tr);
          view.focus();
        });
      },
      [withEditorView],
    );

    const replaceAutocompleteRange = useCallback(
      (replacement: string) => {
        const { replaceFrom, replaceTo } = autocompleteRef.current;
        replaceTextRange(replaceFrom, replaceTo, replacement);
        closeAutocomplete();
      },
      [closeAutocomplete, replaceTextRange],
    );

    const replaceMarkdownRange = useCallback(
      (
        from: number,
        to: number,
        markdown: string,
        selection?: {
          text?: string;
          fallback?: 'start' | 'end';
        },
      ) => {
        const editor = getEditor();
        if (!editor) return;
        editor.action((ctx) => {
          const view = getEditorView(ctx);
          const slice = markdownToSlice(markdown)(ctx);
          const tr = view.state.tr.replace(from, to, slice);
          const insertedTo = Math.min(tr.doc.content.size, from + slice.content.size);
          const selectedRange =
            selection?.text && insertedTo > from
              ? findTextSelectionInRange(tr.doc, from, insertedTo, selection.text)
              : null;

          if (selectedRange) {
            tr.setSelection(TextSelection.create(tr.doc, selectedRange.start, selectedRange.end));
          } else {
            const fallbackPos = selection?.fallback === 'start' ? from : insertedTo;
            tr.setSelection(TextSelection.create(tr.doc, fallbackPos));
          }

          view.dispatch(tr);
          view.focus();
        });
      },
      [getEditor],
    );

    const insertCandidateById = useCallback(
      (taskId: string) => {
        const task = tasksRef.current.find((item) => item.id === taskId);
        if (!task) return;
        replaceAutocompleteRange(formatTaskRefMarkdown(task));
      },
      [replaceAutocompleteRange],
    );

    const handleCreateTaskFromAutocomplete = useCallback(async () => {
      const title = autocompleteRef.current.query.trim();
      if (!title || isCreatingTask) return;
      setIsCreatingTask(true);
      try {
        const entry = await addEntry(title, true, {
          roleId: currentRoleIdRef.current ?? undefined,
        });
        const taskId = entry.extractedTaskId ?? entry.id;
        const task =
          useTaskStore.getState().tasks.find((item) => item.id === taskId) ??
          ({
            id: taskId,
            title: '',
            body: title,
            titleCustomized: false,
          } as const);
        replaceAutocompleteRange(formatTaskRefMarkdown(task));
      } finally {
        setIsCreatingTask(false);
      }
    }, [addEntry, isCreatingTask, replaceAutocompleteRange]);
    const insertCandidateByIdRef = useRef(insertCandidateById);
    insertCandidateByIdRef.current = insertCandidateById;
    const createTaskFromAutocompleteRef = useRef(handleCreateTaskFromAutocomplete);
    createTaskFromAutocompleteRef.current = handleCreateTaskFromAutocomplete;

    useEditor(
      (root) => {
        const crepe = new Crepe({
          root,
          defaultValue: initialMarkdown || '',
          features: {
            [CrepeFeature.TopBar]: topBar,
            [CrepeFeature.Toolbar]: toolbar,
            [CrepeFeature.BlockEdit]: blockEdit,
            [CrepeFeature.ImageBlock]: false,
            [CrepeFeature.Table]: false,
            [CrepeFeature.Latex]: false,
            [CrepeFeature.CodeMirror]: false,
          },
        });

        if (taskRefs) {
          crepe.editor.use(taskRefHighlightPlugin);
        }

        const syncAutocomplete = () => {
          const editorElement = root.querySelector<HTMLElement>('.ProseMirror');
          if (!editorElement || document.activeElement !== editorElement) {
            closeAutocomplete();
            closeSlashMenu();
            return;
          }
          const editor = getEditor();
          if (!editor) return;
          const wrapperRect = wrapperRef.current?.getBoundingClientRect();
          if (taskRefAutocomplete) {
            const next = editor.action((ctx) => getAutocompleteContext(getEditorView(ctx)));
            if (!next) {
              closeAutocomplete();
            } else {
              const position = clampOverlayPosition(
                next.left - (wrapperRect?.left ?? 0),
                next.top - (wrapperRect?.top ?? 0),
                wrapperRect,
                540,
                300,
              );
              const nextState: TaskRefAutocompleteState = {
                open: true,
                query: next.query,
                replaceFrom: next.replaceFrom,
                replaceTo: next.replaceTo,
                left: position.left,
                top: position.top,
                selectedIndex:
                  autocompleteRef.current.open && autocompleteRef.current.query === next.query
                    ? autocompleteRef.current.selectedIndex
                    : 0,
              };
              autocompleteRef.current = nextState;
              setAutocomplete(nextState);
            }
          }
          if (slashCommands.length > 0 && slashCommandRef.current) {
            const nextSlash = editor.action((ctx) => getSlashCommandContext(getEditorView(ctx)));
            if (!nextSlash) {
              closeSlashMenu();
            } else {
              const position = clampOverlayPosition(
                nextSlash.left - (wrapperRect?.left ?? 0),
                nextSlash.top - (wrapperRect?.top ?? 0),
                wrapperRect,
                320,
                240,
              );
              const nextState: SlashCommandState = {
                open: true,
                query: nextSlash.query,
                replaceFrom: nextSlash.replaceFrom,
                replaceTo: nextSlash.replaceTo,
                left: position.left,
                top: position.top,
                selectedIndex:
                  slashMenuRef.current.open && slashMenuRef.current.query === nextSlash.query
                    ? slashMenuRef.current.selectedIndex
                    : 0,
              };
              slashMenuRef.current = nextState;
              setSlashMenu(nextState);
            }
          }
        };

        syncAutocompleteRef.current = syncAutocomplete;

        crepe.on((listener) => {
          listener.markdownUpdated((_ctx, markdown) => {
            cbRef.current(markdown);
            if (taskRefAutocomplete) {
              window.requestAnimationFrame(() => syncAutocompleteRef.current?.());
            }
          });
        });

        const scheduleSyncAutocomplete = () => {
          if (!taskRefAutocomplete) return;
          window.requestAnimationFrame(() => syncAutocompleteRef.current?.());
        };

        const handleKeydown = (event: KeyboardEvent) => {
          const activeAutocomplete = autocompleteRef.current;
          const activeCandidates = buildAutocompleteCandidates(
            tasksRef.current,
            currentRoleIdRef.current,
            activeAutocomplete.query,
          );
          if (taskRefAutocomplete && activeAutocomplete.open) {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              const nextIndex =
                activeCandidates.length === 0
                  ? 0
                  : (activeAutocomplete.selectedIndex + 1) % activeCandidates.length;
              autocompleteRef.current = { ...activeAutocomplete, selectedIndex: nextIndex };
              setAutocomplete(autocompleteRef.current);
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              const nextIndex =
                activeCandidates.length === 0
                  ? 0
                  : (activeAutocomplete.selectedIndex - 1 + activeCandidates.length) %
                    activeCandidates.length;
              autocompleteRef.current = { ...activeAutocomplete, selectedIndex: nextIndex };
              setAutocomplete(autocompleteRef.current);
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              closeAutocomplete();
              return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              void createTaskFromAutocompleteRef.current();
              return;
            }
            if (event.key === 'Enter') {
              const selected = activeCandidates[activeAutocomplete.selectedIndex];
              if (!selected) return;
              event.preventDefault();
              insertCandidateByIdRef.current(selected.id);
              return;
            }
          }
          const activeSlashMenu = slashMenuRef.current;
          const activeSlashCommands = filterSlashCommands(slashCommands, activeSlashMenu.query);
          if (activeSlashMenu.open) {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              const nextIndex =
                activeSlashCommands.length === 0
                  ? 0
                  : (activeSlashMenu.selectedIndex + 1) % activeSlashCommands.length;
              slashMenuRef.current = { ...activeSlashMenu, selectedIndex: nextIndex };
              setSlashMenu(slashMenuRef.current);
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              const nextIndex =
                activeSlashCommands.length === 0
                  ? 0
                  : (activeSlashMenu.selectedIndex - 1 + activeSlashCommands.length) %
                    activeSlashCommands.length;
              slashMenuRef.current = { ...activeSlashMenu, selectedIndex: nextIndex };
              setSlashMenu(slashMenuRef.current);
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              closeSlashMenu();
              return;
            }
            if (event.key === 'Enter') {
              const selected = activeSlashCommands[activeSlashMenu.selectedIndex];
              if (!selected) return;
              event.preventDefault();
              closeSlashMenu();
              slashCommandRef.current?.({
                command: selected,
                query: activeSlashMenu.query,
                replaceFrom: activeSlashMenu.replaceFrom,
                replaceTo: activeSlashMenu.replaceTo,
                anchor: {
                  left: activeSlashMenu.left,
                  top: activeSlashMenu.top,
                },
              });
              return;
            }
          }

          if (event.key === 'Backspace' || event.key === 'Delete') {
            const deleted = withEditorView((view) =>
              deleteTaskRefAtCursor(view, event.key === 'Backspace' ? 'backward' : 'forward'),
            );
            if (deleted) {
              event.preventDefault();
              closeAutocomplete();
              closeSlashMenu();
              return;
            }
          }

          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            submitShortcutRef.current?.();
          }
        };

        const handlePaste = (event: ClipboardEvent) => {
          pasteCaptureRef.current?.(event);
        };

        const handleClick = (event: MouseEvent) => {
          const target = event.target as HTMLElement | null;
          const refNode = target?.closest<HTMLElement>('.milkdown-task-ref');
          const shortId = refNode?.dataset.taskRefShortId;
          if (!shortId) return;
          const taskId = resolveTaskRefToId(shortId, useTaskStore.getState().tasks);
          if (!taskId) return;
          event.preventDefault();
          event.stopPropagation();
          useTaskStore.getState().selectTask(taskId);
        };

        const handleMouseup = () => scheduleSyncAutocomplete();
        const handleFocusin = () => scheduleSyncAutocomplete();
        const handleFocusout = () => {
          window.setTimeout(() => {
            const activeElement = document.activeElement;
            if (activeElement && wrapperRef.current?.contains(activeElement)) return;
            closeAutocomplete();
            closeSlashMenu();
          }, 0);
        };

        root.addEventListener('keydown', handleKeydown);
        root.addEventListener('paste', handlePaste);
        root.addEventListener('click', handleClick);
        root.addEventListener('mouseup', handleMouseup);
        root.addEventListener('focusin', handleFocusin);
        root.addEventListener('focusout', handleFocusout);

        if (autoFocus) {
          window.setTimeout(() => {
            const editorElement = root.querySelector<HTMLElement>('.ProseMirror');
            editorElement?.focus();
          }, 60);
        }

        return crepe;
      },
      [
        autoFocus,
        blockEdit,
        closeAutocomplete,
        editorId,
        getEditor,
        taskRefAutocomplete,
        taskRefs,
        toolbar,
        topBar,
        closeSlashMenu,
        slashCommands,
      ],
    );

    const insertText = useCallback(
      (text: string) => {
        const editor = getEditor();
        if (!editor || !text) return;
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const { state } = view;
          const { from } = state.selection;
          const tr = state.tr.insertText(text, from);
          view.dispatch(tr);
        });
      },
      [getEditor],
    );

    const focus = useCallback(() => {
      const editor = getEditor();
      if (!editor) return;
      editor.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.focus();
      });
    }, [getEditor]);

    useImperativeHandle(
      ref,
      () => ({
        insertText,
        replaceTextRange,
        replaceMarkdownRange,
        focus,
      }),
      [focus, insertText, replaceMarkdownRange, replaceTextRange],
    );

    const visibleCandidates = autocomplete.open
      ? buildAutocompleteCandidates(tasks, currentRoleId, autocomplete.query)
      : [];

    return (
      <div
        ref={wrapperRef}
        className={`${variantClassMap[variant]} ${
          taskRefs ? `task-ref-mode-${taskRefMode}` : ''
        } ${taskRefAutocomplete ? 'task-ref-autocomplete-enabled' : ''} ${
          nativeSlashUi === 'off' ? 'native-slash-ui-off' : ''
        } ${className}`.trim()}
        data-native-slash-ui={nativeSlashUi}
        style={{ position: 'relative' }}
      >
        {nativeSlashUi === 'off' ? (
          <style>{`
            .native-slash-ui-off .milkdown .milkdown-slash-menu {
              display: none !important;
              visibility: hidden !important;
              pointer-events: none !important;
            }
          `}</style>
        ) : null}
        <Milkdown />
        {taskRefAutocomplete && autocomplete.open && (
          <div
            className="task-ref-autocomplete-panel"
            style={{
              position: 'absolute',
              left: `${autocomplete.left}px`,
              top: `${autocomplete.top}px`,
              zIndex: 40,
            }}
          >
            <div className="task-ref-autocomplete-panel__grid">
              <div className="task-ref-autocomplete-panel__column">
                <p className="task-ref-autocomplete-panel__heading">
                  {t('autocomplete_existing_tasks')}
                </p>
                {visibleCandidates.length > 0 ? (
                  visibleCandidates.map((candidate, index) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={`task-ref-autocomplete-panel__item ${
                        index === autocomplete.selectedIndex ? 'is-active' : ''
                      }`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => insertCandidateById(candidate.id)}
                    >
                      <span className="task-ref-autocomplete-panel__title">{candidate.title}</span>
                      {candidate.roleMatch && (
                        <span className="task-ref-autocomplete-panel__badge">
                          {t('autocomplete_current_role')}
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="task-ref-autocomplete-panel__empty">
                    {t('autocomplete_empty')}
                  </div>
                )}
              </div>

              <div className="task-ref-autocomplete-panel__column task-ref-autocomplete-panel__column--action">
                <p className="task-ref-autocomplete-panel__heading">
                  {t('autocomplete_create_task')}
                </p>
                <button
                  type="button"
                  className="task-ref-autocomplete-panel__create"
                  disabled={!autocomplete.query.trim() || isCreatingTask}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handleCreateTaskFromAutocomplete()}
                >
                  <span className="task-ref-autocomplete-panel__title">
                    {autocomplete.query.trim() || t('autocomplete_create_placeholder')}
                  </span>
                  <span className="task-ref-autocomplete-panel__shortcut">Ctrl/Cmd + Enter</span>
                </button>
                <p className="task-ref-autocomplete-panel__hint">{t('autocomplete_hint')}</p>
              </div>
            </div>
          </div>
        )}
        {slashMenu.open && visibleSlashCommands.length > 0 && (
          <div
            className="task-ref-autocomplete-panel"
            style={{
              position: 'absolute',
              left: `${slashMenu.left}px`,
              top: `${slashMenu.top}px`,
              zIndex: 41,
            }}
          >
            <div className="flex min-w-[260px] flex-col gap-1 p-1">
              {visibleSlashCommands.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  className={`task-ref-autocomplete-panel__item ${
                    index === slashMenu.selectedIndex ? 'is-active' : ''
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    closeSlashMenu();
                    slashCommandRef.current?.({
                      command,
                      query: slashMenu.query,
                      replaceFrom: slashMenu.replaceFrom,
                      replaceTo: slashMenu.replaceTo,
                      anchor: {
                        left: slashMenu.left,
                        top: slashMenu.top,
                      },
                    });
                  }}
                >
                  <span className="task-ref-autocomplete-panel__title">{command.title}</span>
                  {command.description ? (
                    <span
                      className="block text-[10px]"
                      style={{ color: 'var(--color-text-tertiary)' }}
                    >
                      {command.description}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  },
);

export const RichMarkdownEditor = forwardRef<RichMarkdownEditorHandle, RichMarkdownEditorProps>(
  function RichMarkdownEditor(props, ref) {
    return (
      <MilkdownProvider key={props.editorId}>
        <RichMarkdownEditorInner ref={ref} {...props} />
      </MilkdownProvider>
    );
  },
);
