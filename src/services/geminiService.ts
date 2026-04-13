import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export const getStyleSuggestion = async (preference: string) => {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Você é um barbeiro especialista. Sugira um corte de cabelo ou estilo de barba baseado na seguinte preferência do cliente: "${preference}". Responda em português, de forma curta e estilosa, como se estivesse conversando com o cliente na barbearia.`,
  });

  return response.text;
};
