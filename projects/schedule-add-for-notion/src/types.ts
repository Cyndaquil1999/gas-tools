type NotionColumnMapping = {
  title: string;
  date: string;
  status: string;
  timeEstimated: string;
};

type SubmitResult = {
  ok: boolean;
  count: number;
  results: Array<{ index: number; ok: boolean; id?: string; error?: string }>;
};
