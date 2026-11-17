// Opcional: si defines SUPABASE_URL y SUPABASE_ANON_KEY en Netlify, genera config.js con ellas.
// Si no están definidas, se conserva el config.js que ya trae el proyecto.
const fs = require('fs');
const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
if (url && key) {
  fs.writeFileSync('config.js', `window.MIO_CONFIG = ${JSON.stringify({ SUPABASE_URL: url, SUPABASE_ANON_KEY: key })};\n`);
  console.log('config.js generado desde variables de entorno');
} else console.log('Sin variables de entorno: se usa config.js existente');
