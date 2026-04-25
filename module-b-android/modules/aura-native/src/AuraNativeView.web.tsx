import * as React from 'react';

import { AuraNativeViewProps } from './AuraNative.types';

export default function AuraNativeView(props: AuraNativeViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad?.({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
