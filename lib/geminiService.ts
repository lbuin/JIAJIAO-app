import { GoogleGenAI, Type } from "@google/genai";

export const generateJobDetails = async (
  grade: string,
  subject: string,
  requirements: string
): Promise<{ title: string; priceSuggestion: string }> => {
  // @ts-ignore
  const apiKey = process.env.API_KEY;
  
  if (!apiKey) {
    console.warn("Gemini API Key missing. Returning fallback.");
    // In production/China without proxy, this fallback is likely what will be shown
    return {
      title: `${grade}${subject}辅导`,
      priceSuggestion: "¥100 - ¥200 / 小时"
    };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `
      You are an assistant for a Tutor Matching Platform in China.
      Generate a catchy, professional Job Title (max 10 words, in Chinese) and a suggested Price Range (e.g., "¥X - ¥Y / 小时")
      for a tutor job with the following details:
      Grade: ${grade}
      Subject: ${subject}
      Extra Requirements: ${requirements}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                title: { type: Type.STRING },
                priceSuggestion: { type: Type.STRING }
            },
            required: ["title", "priceSuggestion"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    return JSON.parse(text);
  } catch (error) {
    console.error("Error generating job details:", error);
    return {
      title: `${grade}${subject}家教 (AI生成失败)`,
      priceSuggestion: "¥100 - ¥150 / 小时"
    };
  }
};