import { GoogleGenAI, Type } from "@google/genai";

export const generateJobDetails = async (
  grade: string,
  subject: string,
  requirements: string
): Promise<{ title: string; priceSuggestion: string }> => {
  // Use process.env.API_KEY directly as per guidelines.
  // The client initialization must use the key from the environment.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    You are an assistant for a Tutor Matching Platform.
    Generate a catchy, professional Job Title (max 10 words) and a suggested Price Range (e.g., "$X - $Y / hour")
    for a tutor job with the following details:
    Grade: ${grade}
    Subject: ${subject}
    Extra Requirements: ${requirements}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            priceSuggestion: { type: Type.STRING },
          },
          required: ["title", "priceSuggestion"],
        },
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    return JSON.parse(text);
  } catch (error) {
    console.error("Error generating job details:", error);
    return {
      title: `${subject} Tutor for ${grade}`,
      priceSuggestion: "$20 - $50 / hour"
    };
  }
};