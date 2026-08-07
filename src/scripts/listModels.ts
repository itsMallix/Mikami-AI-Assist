import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';

async function listModels() {
  let pageToken = '';
  const allModels: string[] = [];

  do {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url);
    const data = (await res.json()) as any;
    if (data.models) {
      for (const m of data.models) {
        allModels.push(`${m.name} -> ${m.supportedGenerationMethods?.join(', ')}`);
      }
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  console.log('--- ALL AVAILABLE MODELS ---');
  allModels.forEach((m) => console.log(m));
}

listModels();
