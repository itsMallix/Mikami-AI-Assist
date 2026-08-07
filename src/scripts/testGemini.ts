import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

async function test() {
  const modelsToTest = [
    'gemini-2.0-flash',
    'gemini-flash-latest',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
  ];

  for (const m of modelsToTest) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const res = await model.generateContent('Say hello in 3 words');
      console.log(`✅ ${m} output:`, res.response.text().trim());
    } catch (err: any) {
      console.error(`❌ ${m} Error:`, err.message);
    }
  }
}

test();
