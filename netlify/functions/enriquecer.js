// netlify/functions/enriquecer.js

const MODELO = 'gemini-1.5-flash'; // El modelo con mayor cuota gratuita garantizada

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return respuesta(405, { error: 'Método no permitido' });
  }

  let registrosTexto;
  try {
    const body = JSON.parse(event.body || '{}');
    registrosTexto = body.registrosTexto;
  } catch (e) {
    return respuesta(400, { error: 'JSON inválido en la solicitud' });
  }

  if (!registrosTexto || !registrosTexto.trim()) {
    return respuesta(400, { error: 'No se recibió texto para enriquecer' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return respuesta(500, { error: 'Falta configurar GEMINI_API_KEY en Netlify.' });
  }

  const systemPrompt = `Sos un experto catalogador en formato MARC21. 
Tu tarea es revisar estos registros y corregir errores evidentes o completar datos básicos faltantes si los deducís de la información presente.
Reglas:
1. Mantené EXACTAMENTE el mismo formato de texto plano MARC21 de entrada.
2. Respondé ÚNICAMENTE con el texto MARC21 resultante, sin comentarios extra.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;
    const apiResp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          { parts: [{ text: `Enriquecé estos registros MARC21:\n\n${registrosTexto}` }] },
        ],
        // ATENCIÓN: Comento la herramienta de búsqueda para evitar el bloqueo 429
        // tools: [{ google_search: {} }], 
      }),
    });

    if (!apiResp.ok) {
      const detalle = await apiResp.text();
      return respuesta(502, { error: 'Error en Gemini API', detalle });
    }

    const datos = await apiResp.json();
    const texto = datos.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!texto) {
      return respuesta(502, { error: 'La IA no devolvió texto', detalle: JSON.stringify(datos) });
    }

    return respuesta(200, { resultado: texto });
  } catch (err) {
    return respuesta(500, { error: err.message });
  }
};

function respuesta(statusCode, dataObj) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dataObj),
  };
}
