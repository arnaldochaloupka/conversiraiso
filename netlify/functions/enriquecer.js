// netlify/functions/enriquecer.js

const MODELO = 'gemini-3.5-flash';

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

const systemPrompt = `Sos un asistente de catalogación bibliotecaria. El sistema de destino es Aguapey, el cual tiene reglas estrictas de etiquetas y puntuación.

Tu tarea principal es ENRIQUECER los registros MARC21 de entrada aportando datos descriptivos y técnicos faltantes, basándote en tu conocimiento interno de las obras (a partir del ISBN, título o autor), respetando siempre la estructura original de los datos que ya vienen cargados.

REGLAS ESTRICTAS (SIN EXCEPCIONES):
1. INTOCABLE: NO modifiques ni corrijas la puntuación ISBD, ni los espacios, ni los subcampos que ya existen en el registro de entrada. Dejá los campos cargados exactamente como llegaron.
2. ETIQUETAS DE AGUAPEY: NO cambies las etiquetas originales. (Ej: si hay un 659, dejalo como 659).
3. COMPLETAR DATOS FALTANTES: Si el registro carece de estos campos, y vos conocés el dato verídico para esta obra/edición, AGREGALOS:
   - =250  \\\\$a (Mención de edición)
   - =300  \\\\$a (Extensión/cantidad de páginas)
   - =440  \\\\$a (Mención de serie)
4. ENRIQUECER CONTENIDO: Agregá estos campos al final (antes de los campos locales 9XX) para mejorar el descubrimiento de la obra:
   - =520  \\\\$a (Resumen descriptivo o sinopsis de la obra)
   - =500  \\\\$a (Notas generales sobre el contenido)
   - =653  \\\\$a (Términos propuestos o palabras clave, creando una línea =653 por cada término)
5. REGLA DE ORO ANTIALUCINACIÓN: Si no estás 100% seguro de un dato técnico (por ejemplo, la cantidad exacta de páginas o la edición), NO LO INVENTES. Es preferible que el campo quede vacío a ingresar un dato falso en el catálogo.
6. FORMATO DE SALIDA: Devolvé ÚNICAMENTE el texto en formato MARC21 plano, con los registros separados por una línea en blanco. No agregues saludos, ni explicaciones, ni markdown.`;

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
