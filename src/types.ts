export type AnnotationStatus = "open" | "resolved";
export type AnnotationKind = "element" | "text" | "pin" | "rectangle" | "circle" | "freehand";

export interface AnnotationGeometry {
  type: "rectangle" | "circle" | "freehand";
  x: number;
  y: number;
  width?: number;
  height?: number;
  points?: Array<{ x: number; y: number }>;
}

export interface Annotation {
  id: string;
  projectId: string;
  comment: string;
  status: AnnotationStatus;
  createdAt: string;
  updatedAt?: string;
  anchor: {
    selector: string;
    label: string;
    text: string;
    position: { x: number; y: number };
    kind?: AnnotationKind;
    quote?: string;
    geometry?: AnnotationGeometry;
  };
  page: {
    url: string;
    path: string;
    viewport: { width: number; height: number };
  };
}

export interface Project {
  id: string;
  name: string;
  allowedOrigins: string[];
  createdAt: string;
  annotationCount: number;
}
