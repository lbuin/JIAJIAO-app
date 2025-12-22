// AI functionality has been removed.
// This file is kept as a placeholder to prevent import errors if referenced elsewhere,
// but it strictly returns empty data now.

export const generateJobDetails = async (
  grade: string,
  subject: string,
  requirements: string
): Promise<{ title: string; priceSuggestion: string }> => {
  return {
    title: "",
    priceSuggestion: ""
  };
};