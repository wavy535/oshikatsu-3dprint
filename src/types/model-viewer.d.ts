import type { DetailedHTMLProps, HTMLAttributes } from "react";

// <model-viewer>（@google/model-viewer）を JSX で使うための型。使う属性だけを書く
type ModelViewerAttributes = {
  src?: string;
  alt?: string;
  ar?: boolean;
  "ar-modes"?: string;
  "ar-scale"?: "auto" | "fixed";
  "ar-placement"?: "floor" | "wall";
  "camera-controls"?: boolean;
  "touch-action"?: string;
  "shadow-intensity"?: string;
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & ModelViewerAttributes;
    }
  }
}
