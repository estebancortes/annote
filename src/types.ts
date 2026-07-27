export type AnnotationStatus = "open" | "resolved";

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
    kind?: "element" | "text";
    quote?: string;
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
