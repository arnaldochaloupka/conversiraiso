// netlify/functions/enriquecer.js
//
// Recibe el texto plano MARC21 (uno o varios registros, separados por
// línea en blanco) y le pide a Gemini (nivel gratuito de Google AI
// Studio) que complete los datos faltantes (autor, editorial, año,
// lugar, materias, etc.), buscando en internet a partir del ISBN u
// otros datos disponibles. Devuelve el mismo texto MARC21, enriquecido,
// listo para que el front-end lo vuelva a parsear.
//
// Requiere la variable de entorno GEMINI_API_KEY configurada en
// Netlify (Site configuration → Environment variables). Se consigue
// gratis, sin tarjeta, en https://aistudio.google.com

const MODELO = 'gemini-2.5-flash'; //

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

  if (registrosTexto.length > 60000) {
    return respuesta(400, { error: 'El texto es demasiado largo. Probá con menos registros por lote.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return respuesta(500, { error: 'Falta configurar GEMINI_API_KEY en las variables de entorno de Netlify.' });
  }

  const systemPrompt = `Sos un asistente de catalogación bibliotecaria especializado en formato MARC21.

Vas a recibir uno o varios registros bibliográficos en formato MARC21 de texto plano (formato .mrk), con líneas como:
=245  10$aTítulo$bSubtítulo$cAutor
=100  1\\$aApellido, Nombre
=020  \\\\$aISBN

Tu tarea es COMPLETAR los datos que falten en cada registro (autor, editorial, año, lugar de edición, cantidad de páginas, materias, etc.). Para eso, USÁ TU HERRAMIENTA DE BÚSQUEDA en internet:
- Si hay ISBN (campo 020 $a), buscá por ese ISBN como dato principal.
- Si no hay ISBN, buscá por título + autor.

Reglas estrictas, sin excepciones:
1. NUNCA inventes ni completes de memoria un dato que no puedas verificar con la búsqueda. Si no encontrás información confiable, dejá ese campo tal como está (o vacío). Es preferible un campo vacío a un dato incorrecto en un catálogo de biblioteca.
2. NO borres ni modifiques los datos que ya están presentes y correctos en el registro original, salvo errores evidentes de tipeo.
3. Mantené EXACTAMENTE el mismo formato de texto plano MARC21 de entrada (líneas "=TAG  ind1ind2$a...$b..."), un campo por línea.
4. Si el texto de entrada tiene varios registros (separados por línea en blanco), procesalos TODOS y devolvé TODOS, separados también por una línea en blanco, en el mismo orden en que llegaron.
5. No agregues explicaciones, comentarios, markdown, ni texto fuera de los registros MARC. Tu respuesta debe ser ÚNICAMENTE el texto MARC21 resultante, nada más.`;

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
        tools: [{ google_search: {} }],
      }),
    });

    if (!apiResp.ok) {
      const detalle = await apiResp.text();
      return respuesta(502, { error: 'Error al llamar a la API de Gemini', detalle });
    }

    const datos = await apiResp.json();
    const candidato = datos.candidates && datos.candidates[0];
    const partes = candidato && candidato.content && candidato.content.parts;
    const texto = partes ? partes.map((p) => p.text || '').join('').trim() : '';

    if (!texto) {
      return respuesta(502, { error: 'La IA no devolvió texto utilizable', detalle: JSON.stringify(datos).slice(0, 500) });
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
