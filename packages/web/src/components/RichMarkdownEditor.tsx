import { Crepe, CrepeFeature } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import { editorViewCtx } from '@milkdown/core';
import type { Ctx } from '@milkdown/ctx';
import { TextSelection } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react';
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
import {
  findTaskRefDeleteRange,
  formatTaskRefMarkdown,
  resolveTaskRefToId,
} from '../utils/taskRefs';

export type MarkdownEditorVariant = 'compact' | 'standard' | 'immersive';
export type MarkdownTaskRefMode = 'inline-chip' | 'mini-card' | 'highlight-only';

export type RichMarkdownEditorHandle = {
  insertText: (text: string) => void;
  focus: () => void;
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

const EMPTY_AUTOCOMPLETE: TaskRefAutocompleteState = {
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

function getEditorView(ctx: Ctx): EditorView {
  return ctx.get(editorViewCtx);
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

    const [, getEditor] = useInstance();
    const wrapperRef = useRef<HTMLDivElement>(null);
    const syncAutocompleteRef = useRef<(() => void) | null>(null);
    const autocompleteRef = useRef<TaskRefAutocompleteState>(EMPTY_AUTOCOMPLETE);
    const [autocomplete, setAutocomplete] = useState<TaskRefAutocompleteState>(EMPTY_AUTOCOMPLETE);
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

    useEffect(() => {
      autocompleteRef.current = autocomplete;
    }, [autocomplete]);

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

    const withEditorView = useCallback(
      <T,>(run: (view: EditorView) => T): T | undefined => {
        const editor = getEditor();
        if (!editor) return undefined;
        return editor.action((ctx) => run(getEditorView(ctx)));
      },
      [getEditor],
    );

    const replaceAutocompleteRange = useCallback(
      (replacement: string) => {
        withEditorView((view) => {
          const { replaceFrom, replaceTo } = autocompleteRef.current;
          const tr = view.state.tr.insertText(replacement, replaceFrom, replaceTo);
          tr.setSelection(TextSelection.create(tr.doc, replaceFrom + replacement.length));
          view.dispatch(tr);
          view.focus();
        });
        closeAutocomplete();
      },
      [closeAutocomplete, withEditorView],
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
          if (!taskRefAutocomplete) return;
          const editorElement = root.querySelector<HTMLElement>('.ProseMirror');
          if (!editorElement || document.activeElement !== editorElement) {
            closeAutocomplete();
            return;
          }
          const editor = getEditor();
          if (!editor) return;
          const next = editor.action((ctx) => getAutocompleteContext(getEditorView(ctx)));
          if (!next) {
            closeAutocomplete();
            return;
          }
          const wrapperRect = wrapperRef.current?.getBoundingClientRect();
          const nextState: TaskRefAutocompleteState = {
            open: true,
            query: next.query,
            replaceFrom: next.replaceFrom,
            replaceTo: next.replaceTo,
            left: Math.max(12, next.left - (wrapperRect?.left ?? 0)),
            top: Math.max(24, next.top - (wrapperRect?.top ?? 0)),
            selectedIndex:
              autocompleteRef.current.open && autocompleteRef.current.query === next.query
                ? autocompleteRef.current.selectedIndex
                : 0,
          };
          autocompleteRef.current = nextState;
          setAutocomplete(nextState);
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

          if (event.key === 'Backspace' || event.key === 'Delete') {
            const deleted = withEditorView((view) =>
              deleteTaskRefAtCursor(view, event.key === 'Backspace' ? 'backward' : 'forward'),
            );
            if (deleted) {
              event.preventDefault();
              closeAutocomplete();
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

    useImperativeHandle(ref, () => ({ insertText, focus }), [insertText, focus]);

    const visibleCandidates = autocomplete.open
      ? buildAutocompleteCandidates(tasks, currentRoleId, autocomplete.query)
      : [];

    return (
      <div
        ref={wrapperRef}
        className={`${variantClassMap[variant]} ${
          taskRefs ? `task-ref-mode-${taskRefMode}` : ''
        } ${taskRefAutocomplete ? 'task-ref-autocomplete-enabled' : ''} ${className}`.trim()}
        style={{ position: 'relative' }}
      >
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
