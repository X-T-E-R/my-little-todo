import { create } from 'zustand';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  action?: ToastAction;
  duration?: number;
}

interface ToastState {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;
}

let _id = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  showToast: (toast) => {
    const id = `toast-${++_id}`;
    const item: ToastItem = { ...toast, id };
    set((s) => ({ toasts: [...s.toasts, item] }));

    const duration = toast.duration ?? (toast.type === 'error' ? 5000 : 3500);
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
