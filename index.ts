import 'expo-router/entry';
import './src/utils/notificationTask'; // lets reminder buttons (Skipped it, Mark done...) work while the app is closed

import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widgets/widget-task-handler';

registerWidgetTaskHandler(widgetTaskHandler);
