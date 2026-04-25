import { requireNativeView } from 'expo';
import * as React from 'react';

import { AuraNativeViewProps } from './AuraNative.types';

const NativeView: React.ComponentType<AuraNativeViewProps> =
  requireNativeView('AuraNative');

export default function AuraNativeView(props: AuraNativeViewProps) {
  return <NativeView {...props} />;
}
