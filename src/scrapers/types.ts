export interface Performance {
  source: "fandango" | "amc";
  theater: string;
  perfId: string;
  localDate: string; // YYYY-MM-DD, PT
  localTime: string; // HH:mm, PT
  format: string; // raw label from the source
  buyUrl: string;
  soldOut?: boolean;
}

export interface SourceError {
  source: string;
  message: string;
}

export interface FetchResult {
  performances: Performance[];
  errors: SourceError[];
}
