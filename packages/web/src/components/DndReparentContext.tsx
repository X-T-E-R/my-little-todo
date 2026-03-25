import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { Task } from '@my-little-todo/core';
import { motion } from 'framer-motion';
import { Check, GripVertical } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTaskStore } from '../stores/taskStore';

interface DndReparentProviderProps {
  children: ReactNode;
}

export function DndReparentProvider({ children }: DndReparentProviderProps) {
  const reparentTask = useTaskStore((s) => s.reparentTask);
  const tasks = useTaskStore((s) => s.tasks);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 300,
        tolerance: 8,
      },
    }),
  );

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;
    setActiveId(id);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const childId = active.id as string;
    const parentId = over.id as string;

    const parent = tasks.find((t) => t.id === parentId);
    if (!parent) return;

    await reparentTask(childId, parentId);
  };

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      {children}
      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease' }}>
        {activeTask && <DragPreview task={activeTask} />}
      </DragOverlay>
    </DndContext>
  );
}

function DragPreview({ task }: { task: Task }) {
  const done = task.status === 'completed';
  return (
    <motion.div
      initial={{ scale: 1 }}
      animate={{ scale: 1.02 }}
      className="rounded-xl px-3 py-2 shadow-2xl"
      style={{
        background: 'var(--color-surface)',
        border: '2px solid var(--color-accent)',
        opacity: 0.9,
        maxWidth: 320,
      }}
    >
      <div className="flex items-center gap-2">
        <GripVertical size={14} style={{ color: 'var(--color-accent)' }} />
        <div
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
          style={{
            borderColor: done ? 'var(--color-success)' : 'var(--color-border)',
            background: done ? 'var(--color-success)' : 'transparent',
          }}
        >
          {done && <Check size={10} className="text-white" />}
        </div>
        <span
          className="text-[13px] truncate"
          style={{
            color: done ? 'var(--color-text-tertiary)' : 'var(--color-text)',
            textDecoration: done ? 'line-through' : 'none',
          }}
        >
          {task.title}
        </span>
      </div>
    </motion.div>
  );
}

export function DndTaskWrapper({
  taskId,
  children,
}: {
  taskId: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: taskId });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: taskId });

  const ref = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  return (
    <div
      ref={ref}
      {...listeners}
      {...attributes}
      style={{
        opacity: isDragging ? 0.4 : 1,
        outline: isOver ? '2px solid var(--color-accent)' : 'none',
        outlineOffset: 2,
        borderRadius: 12,
        transition: 'outline 0.15s ease, opacity 0.15s ease',
      }}
    >
      {children}
    </div>
  );
}

export { useDraggable, useDroppable } from '@dnd-kit/core';
