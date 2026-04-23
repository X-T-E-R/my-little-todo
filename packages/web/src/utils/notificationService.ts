import { displayTaskTitle } from '@my-little-todo/core';
import i18n from '../locales';
import { useTaskStore } from '../stores';

let checkInterval: ReturnType<typeof setInterval> | null = null;

function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

// Use variable to prevent Vite from statically analyzing the Tauri import
const TAURI_NOTIFICATION_PKG = '@tauri-apps/' + 'plugin-notification';

type TauriNotificationPermission = 'granted' | 'denied' | 'default' | 'prompt';

type TauriNotificationModule = {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<TauriNotificationPermission>;
  sendNotification(options: { title: string; body: string }): Promise<void> | void;
};

async function loadTauriNotification(): Promise<TauriNotificationModule | null> {
  if (!isTauriEnv()) return null;
  try {
    return (await import(
      /* @vite-ignore */ TAURI_NOTIFICATION_PKG
    )) as unknown as TauriNotificationModule;
  } catch {
    return null;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const tauri = await loadTauriNotification();
  if (tauri) {
    try {
      let granted = await tauri.isPermissionGranted();
      if (!granted) {
        const perm = await tauri.requestPermission();
        granted = perm === 'granted';
      }
      return granted;
    } catch {
      return false;
    }
  }

  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

async function sendNotification(title: string, body: string): Promise<void> {
  const tauri = await loadTauriNotification();
  if (tauri) {
    try {
      tauri.sendNotification({ title, body });
      return;
    } catch {
      // fall through to web notification
    }
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/pwa-192.png',
      tag: `reminder-${Date.now()}`,
    });
  }
}

function checkReminders(): void {
  const { tasks, updateTask } = useTaskStore.getState();
  const now = new Date();

  for (const task of tasks) {
    if (!task.reminders?.length) continue;

    let hasChanges = false;
    const updatedReminders = task.reminders.map((r) => {
      if (r.notified) return r;
      if (r.time.getTime() <= now.getTime()) {
        sendNotification(
          i18n.t('notifications.Reminder: {{title}}', {
            ns: 'common',
            title: displayTaskTitle(task),
          }),
          r.label || i18n.t('notifications.You set a task reminder', { ns: 'common' }),
        );
        hasChanges = true;
        return { ...r, notified: true };
      }
      return r;
    });

    if (hasChanges) {
      updateTask({ ...task, reminders: updatedReminders });
    }
  }
}

export function startReminderService(): void {
  if (checkInterval) return;
  requestNotificationPermission();
  checkReminders();
  checkInterval = setInterval(checkReminders, 60_000);
}

export function stopReminderService(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
