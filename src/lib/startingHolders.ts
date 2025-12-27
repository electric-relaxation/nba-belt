const STARTING_HOLDERS: Record<number, string> = {
  2025: "OKC",
};

export const getStartingHolderAbbr = (seasonStartYear: number): string => {
  return STARTING_HOLDERS[seasonStartYear] ?? "OKC";
};
