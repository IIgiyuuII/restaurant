import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { fetchAll, initApi } from '../api';
import { BACKGROUND_INTERVAL_MIN } from '../config';
import { processData } from './engine';

export const CHECK_TASK = 'restaurant-check';

/**
 * Задачу нужно определить в модульной области — поэтому этот файл импортируется в index.ts,
 * ДО регистрации приложения: ОС может поднять JS в фоне, не открывая ни одного экрана.
 */
TaskManager.defineTask(CHECK_TASK, async () => {
  try {
    await initApi();
    await processData(await fetchAll());
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** Включает/выключает периодическую проверку. Возвращает false, если ОС не даёт фоновые задачи. */
export async function syncBackgroundTask(enabled: boolean): Promise<boolean> {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(CHECK_TASK);
    if (!enabled) {
      if (registered) await BackgroundTask.unregisterTaskAsync(CHECK_TASK);
      return false;
    }
    const status = await BackgroundTask.getStatusAsync();
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) return false;
    if (!registered) await BackgroundTask.registerTaskAsync(CHECK_TASK, { minimumInterval: BACKGROUND_INTERVAL_MIN });
    return true;
  } catch {
    return false;
  }
}
