import { GoogleGenAI, Type } from "@google/genai";
import { QuizQuestion } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const modelName = 'gemini-2.5-flash';

// Helper to handle potential JSON parsing errors from markdown blocks
const cleanAndParseJSON = (text: string) => {
  try {
    // Remove markdown code blocks if present
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/```\n([\s\S]*?)\n```/);
    let jsonString = jsonMatch ? jsonMatch[1] : text;
    
    // Clean potential control characters
    jsonString = jsonString.trim();
    
    return JSON.parse(jsonString);
  } catch (e) {
    console.error("Failed to parse JSON", e);
    return null;
  }
};

export const generateStudyOutline = async (topicTitle: string, userQuery?: string): Promise<string> => {
  const prompt = userQuery 
    ? `Actúa como un preparador personal de oposiciones experto. El alumno está en la fase de estudio de "${topicTitle}" y tiene esta duda concreta: "${userQuery}". Responde de forma pedagógica, estructurada y enlazando con la normativa.`
    : `Actúa como un preparador de oposiciones de alto nivel.
    
    TU OBJETIVO: Crear un PLAN DE ESTUDIO GUIADO paso a paso para el tema: "${topicTitle}".
    No quiero un simple resumen. Quiero una GUÍA DE PREPARACIÓN que me lleve de la mano.

    Estructura la respuesta en Markdown estrictamente así:

    # Guía de Estudio: ${topicTitle}

    ## 🎯 Objetivos del Tema
    (Qué debo saber al terminar)

    ## 🧠 Fase 1: Mapa Mental y Conceptos Clave
    (Explica los pilares fundamentales del tema antes de entrar en leyes. Usa analogías si es útil).

    ## 📖 Fase 2: Análisis Normativo (Paso a Paso)
    (Desglosa el contenido. No copies los artículos, explícalos y agrúpalos lógicamente para estudiarlos).
    * **Bloque A:** ...
    * **Bloque B:** ...

    ## 💡 Fase 3: Reglas Mnemotécnicas y Trucos
    (Daur reglas para memorizar listas, plazos o mayorías difíciles de este tema específico).

    ## ⚠️ Puntos Críticos de Examen
    (Qué suelen preguntar los tribunales sobre este tema. Dónde están las "trampas").`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    return response.text || "Hubo un error generando el plan de estudio.";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error de conexión con la IA. Por favor verifica tu clave API.";
  }
};

export interface InteractiveDiagram {
  mermaidCode: string;
  nodeDetails: Record<string, string>;
}

export const generateInteractiveDiagram = async (topicTitle: string): Promise<InteractiveDiagram | null> => {
  const sanitizedTitle = topicTitle.replace(/[^a-zA-Z0-9 áéíóúÁÉÍÓÚñÑ]/g, '').substring(0, 25);
  
  const prompt = `Actúa como un experto en visualización de datos.
  Crea un MAPA MENTAL JERÁRQUICO (Mermaid.js) para estudiar: "${topicTitle}".

  OBJETIVO: Un esquema visual ROBUSTO y SIN ERRORES DE SINTAXIS.

  REGLAS OBLIGATORIAS (SINTAXIS MERMAID):
  1. LA PRIMERA LÍNEA DEL CÓDIGO DEBE SER EXACTAMENTE: graph LR
  2. Nodos: Usa IDs simples (N1, N2, N3...) y texto entre comillas dobles y corchetes.
     Ejemplo: N1["Titulo Principal"]
  3. Texto de nodos: 
     - Solo letras y números.
     - MÁXIMO 4 palabras.
     - ELIMINA: comillas, paréntesis, corchetes, puntos, comas.
  4. NODO RAÍZ (N1): Su texto DEBE SER EXACTAMENTE: "${sanitizedTitle}"
  5. CLASES: NO definas 'classDef' al principio. Defínelos AL FINAL.

  PLANTILLA OBLIGATORIA (Usa saltos de línea \\n explícitos):
  graph LR
  N1["${sanitizedTitle}"]:::main
  N1 --> N2["Conceptos"]:::sub
  N2 --> N3["Detalle"]:::detail
  
  %% Estilos
  classDef main fill:#AA151B,stroke:#F1BF00,stroke-width:4px,color:white;
  classDef sub fill:#1e293b,stroke:#F1BF00,stroke-width:2px,color:#F1BF00;
  classDef detail fill:#0f172a,stroke:#334155,stroke-width:1px,color:#cbd5e1,stroke-dasharray: 5 5;

  Debes devolver un OBJETO JSON:
  {
    "mermaidCode": "graph LR\\nN1[\\"${sanitizedTitle}\\"]:::main --> N2[\\"Conceptos\\"]:::sub\\n...\\nclassDef main...",
    "nodeDetails": { "N1": "Explicación...", "N2": "Explicación..." }
  }

  IMPORTANTE:
  - Usa saltos de línea explicitos (\\n) en el string JSON.
  - Asegúrate de que hay un salto de línea antes de 'classDef'.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });
    
    const data = cleanAndParseJSON(response.text || "{}");
    return data as InteractiveDiagram;
  } catch (error) {
    console.error("Gemini Diagram Error:", error);
    return null;
  }
};

export const generateQuizQuestions = async (topicTitle: string, count: number = 5): Promise<QuizQuestion[]> => {
  const prompt = `Genera un examen tipo test de ${count} preguntas sobre "${topicTitle}" basado estrictamente en el temario oficial de oposiciones (Constitución, Estatuto Andalucía, Régimen Local, etc).
  Las preguntas deben ser técnicas y rigurosas.
  
  Devuelve SOLO un JSON válido con la siguiente estructura (Schema):
  [
    {
      "question": "Enunciado de la pregunta",
      "options": ["Opción A", "Opción B", "Opción C", "Opción D"],
      "correctAnswerIndex": 0, (índice 0-3)
      "explanation": "Breve explicación jurídica de por qué es la correcta."
    }
  ]`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              options: { 
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              correctAnswerIndex: { type: Type.INTEGER },
              explanation: { type: Type.STRING }
            }
          }
        }
      }
    });

    const data = cleanAndParseJSON(response.text || "[]");
    return data || [];
  } catch (error) {
    console.error("Gemini Quiz Error:", error);
    return [];
  }
};

export const chatWithTutor = async (message: string, history: {role: 'user' | 'model', text: string}[]): Promise<string> => {
  try {
    const chat = ai.chats.create({
      model: modelName,
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
      })),
      config: {
        systemInstruction: "Eres un tutor experto en la preparación de oposiciones para administraciones locales en Andalucía. Responde basándote en la Constitución Española, el Estatuto de Andalucía, la Ley de Bases de Régimen Local y demás normativa específica del temario. Sé pedagógico y cita artículos. Si el usuario te pide repasar fallos, analiza las preguntas que falló, explica por qué la respuesta correcta es la que es, y da reglas mnemotécnicas para recordarlo."
      }
    });

    const result = await chat.sendMessage({ message });
    return result.text || "Lo siento, no pude generar una respuesta.";
  } catch (error) {
    console.error("Chat Error:", error);
    return "Lo siento, ha ocurrido un error al procesar tu consulta.";
  }
};