import { ExternalLink, FolderPlus, Pin, Plus } from 'lucide-react';
import { useEffect } from 'react';

export interface MaterialSidebarContextAction {
  id: string;
  label: string;
  icon: 'insert' | 'open' | 'thread' | 'pin';
  onSelect: () => void;
}

function Icon({ kind }: { kind: MaterialSidebarContextAction['icon'] }) {
  if (kind === 'open') return <ExternalLink size={14} />;
  if (kind === 'thread') return <FolderPlus size={14} />;
  if (kind === 'pin') return <Pin size={14} />;
  return <Plus size={14} />;
}

export function MaterialSidebarContextMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: MaterialSidebarContextAction[];
  onClose: () => void;
}) {
  useEffect(() => {
    const handlePointer = () => onClose();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handlePointer);
    window.addEventListener('contextmenu', handlePointer);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handlePointer);
      window.removeEventListener('contextmenu', handlePointer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed z-[80] min-w-[190px] rounded-2xl border p-1.5 shadow-2xl"
      style={{
        left: x,
        top: y,
        borderColor: 'var(--color-border)',
        background: 'color-mix(in srgb, var(--color-surface) 96%, var(--color-bg))',
      }}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => {
            action.onSelect();
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-[var(--color-bg)]"
          style={{ color: 'var(--color-text)' }}
        >
          <Icon kind={action.icon} />
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
}
