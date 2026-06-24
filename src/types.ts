export type AspectRatio = "16:9" | "9:16";
export type Resolution = "720p" | "1080p";

export interface ImageInput {
  data: string; // Base64 representation
  mimeType: string;
  previewUrl: string;
}

export interface VideoMetadata {
  uri?: string;
  mimeType?: string;
}

export interface MovieScene {
  id: string;
  title: string;
  tagline: string;
  description: string;
  presetPrompt: string;
  aspectRatio: AspectRatio;
  colorTheme: string;
  imageThumbnail: string; // Placeholder CSS or icon representation
  badge: string;
}

export interface VideoGeneration {
  id: string;
  operationName: string;
  title: string;
  prompt: string;
  aspectRatio: AspectRatio;
  resolution: Resolution;
  timestamp: number;
  videoUrl: string; // The download proxy URL on our server
  videoMetadata?: VideoMetadata | null;
  baseImagePreview?: string; // Optional starting image
  isExtension?: boolean;
  parentId?: string; // If this was extended from another scene
}
