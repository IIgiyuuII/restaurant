import { registerRootComponent } from 'expo';

// Порядок важен: фоновая задача и обработчик уведомлений должны быть определены в модульной области
// ДО старта приложения — ОС может запустить JS в фоне, не показывая ни одного экрана.
import './src/notifications/notify';
import './src/notifications/background';

import App from './App';

registerRootComponent(App);
