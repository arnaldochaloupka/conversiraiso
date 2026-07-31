const { GoogleGenAI } = require('@google/genai');

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { registrosTexto } = JSON.parse(event.body);
        
        if (!registrosTexto) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Faltan registros' }) };
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const prompt = `Actúa como un catalogador bibliotecario experto en formato MARC21 e ISBD. 
Te voy a pasar un lote de registros bibliográficos en formato de texto mnemónico MARC. 
Tu tarea para CADA uno de los registros es:
1. Corregir y perfeccionar la puntuación ISBD (títulos, mención de responsabilidad, edición, pie de imprenta y dimensiones en el campo 300).
2. Asegurar que los campos 490 sean convertidos a 440 si corresponde.
3. Enriquecer el registro agregando o mejorando el campo 520 (un resumen sintético del libro) y el campo 653 (términos de indización libre separados por $a, por ejemplo: $aPOLITICA$aHISTORIA).
4. No alteres los números de control ni los códigos locales (como el 952 o 942).
Devuélveme estrictamente el texto MARC21 resultante de todos los registros, manteniendo la estructura de etiquetas separadas por saltos de línea y el formato original de bloques MARC21.

Aquí están los registros:
${registrosTexto}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ resultado: response.text })
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};
