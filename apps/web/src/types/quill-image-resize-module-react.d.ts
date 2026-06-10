declare module "quill-image-resize-module-react" {
  import type Quill from "quill";

  export interface ImageResizeOptions {
    displaySize?: boolean;
    modules?: string[];
    handleStyles?: Record<string, string>;
  }

  export interface ImageResizeModuleInstance {
    attach?: () => void;
    detach?: () => void;
    onCreate?: () => void;
    onDestroy?: () => void;
  }

  export interface ImageResizeModuleStatic {
    new (
      quill: Quill,
      options?: ImageResizeOptions
    ): ImageResizeModuleInstance;
  }

  const ImageResize: ImageResizeModuleStatic;

  export default ImageResize;
}