// Reexport the native module. On web, it will be resolved to AuraNativeModule.web.ts
// and on native platforms to AuraNativeModule.ts
export { default } from './src/AuraNativeModule';
export { default as AuraNativeView } from './src/AuraNativeView';
export * from  './src/AuraNative.types';
