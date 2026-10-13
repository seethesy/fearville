declare const __FEARVILLE_BUILD_ID__: string;
export const BUILD_ID = typeof __FEARVILLE_BUILD_ID__ === 'undefined' ? 'development' : __FEARVILLE_BUILD_ID__;
