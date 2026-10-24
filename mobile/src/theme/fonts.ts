import { Platform } from 'react-native';

/** Inter — как в вебе. Для каждого начертания в RN нужна своя семья. */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semi: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export type Weight = keyof typeof fonts;

export const mono = Platform.select({ ios: 'Menlo', default: 'monospace' });
