/// <reference types="vite/client" />

declare module "*/oat.min.js";
declare const ot: {
  toast: ((msg: string, title?: string, opts?: Record<string, unknown>) => void) & {
    clear: (placement?: string) => void;
  };
};
