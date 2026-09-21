const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper to get Groq API key dynamically (from process.env or re-reading .env)
function getGroqApiKey(clientKey) {
  if (clientKey && clientKey.trim()) {
    return clientKey.trim();
  }
  const envKey = process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim();
  if (envKey && envKey.length > 5 && !envKey.startsWith('your_')) {
    return envKey;
  }
  // Try reading directly from .env in case user just pasted it without restarting
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('GROQ_API_KEY=')) {
          const rawVal = trimmed.slice('GROQ_API_KEY='.length).trim();
          const key = rawVal.replace(/^["']|["']$/g, '').trim();
          if (key && !key.startsWith('#') && !key.startsWith('your_') && key.length > 5) {
            process.env.GROQ_API_KEY = key;
            return key;
          }
        }
      }
    }
  } catch (err) {
    console.error('Error reading .env dynamically:', err.message);
  }
  return null;
}

// Helper to get Groq Model dynamically
function getGroqModel(clientModel) {
  if (clientModel && clientModel.trim()) {
    return clientModel.trim();
  }
  try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('GROQ_MODEL=')) {
          const rawVal = trimmed.slice('GROQ_MODEL='.length).trim();
          const model = rawVal.replace(/^["']|["']$/g, '').trim();
          if (model && !model.startsWith('#')) {
            process.env.GROQ_MODEL = model;
            return model;
          }
        }
      }
    }
  } catch (err) {
    console.error('Error reading GROQ_MODEL dynamically:', err.message);
  }
  return process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
}

// Free models supported on Groq
const FREE_MODELS = [
  { id: 'openai/gpt-oss-120b', name: 'OpenAI GPT OSS 120B (Free - Full Itineraries, Recommended)', badge: 'Recommended' },
  { id: 'openai/gpt-oss-20b', name: 'OpenAI GPT OSS 20B (Free - Fast & Full)', badge: 'Fast' },
  { id: 'qwen/qwen3.8-27b', name: 'Qwen 3.8 27B (Free - Fast, 1k Token Limit)', badge: 'Compact' },
  { id: 'qwen/qwen3.6-27b', name: 'Qwen 3.6 27B (Free - Fast, 1k Token Limit)', badge: 'Compact' }
];

// System Prompt for WanderAI Trip Planner
const SYSTEM_PROMPT = `You are "WanderAI", a world-class AI travel concierge and expert trip planner.
Your goal is to craft memorable, realistic, and COMPLETELY FINISHED travel itineraries.

Guidelines:
1. **Completeness & Structure**:
   - Always complete the ENTIRE itinerary from Day 1 through the final day. Never stop halfway.
   - Start with a quick Trip Overview (Best Season, Vibe, Daily Cost).
   - Keep daily entries punchy and structured using bullet points for **🌅 Morning**, **☀️ Afternoon**, **🌙 Evening**, and **🍽️ Food Pick** (mention iconic dishes and recommended local eateries).
   - Conclude with a clean **💰 Estimated Budget Breakdown Table** (Stay, Food, Transport, Activities) and essential **🎒 Logistics & Packing Tips**.

2. **Tone & Style**:
   - Knowledgeable, organized, and helpful.
   - Use specific names of neighborhoods, beaches, landmarks, and authentic local eateries.
   - Use emojis tastefully for scannability.`;

// GET /api/config - check key status & model
app.get('/api/config', (req, res) => {
  const key = getGroqApiKey();
  const currentModel = getGroqModel();
  res.json({
    hasApiKey: Boolean(key && key.length > 5),
    model: currentModel,
    availableModels: FREE_MODELS
  });
});

// POST /api/chat - Streaming Groq Chat Completion
app.post('/api/chat', async (req, res) => {
  const { messages, model, apiKey: clientApiKey } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required.' });
  }

  const apiKey = getGroqApiKey(clientApiKey);

  if (!apiKey) {
    return res.status(401).json({
      error: 'GROQ_API_KEY is not set.',
      message: 'Please paste your Groq API key in the .env file (GROQ_API_KEY=gsk_...) or click Settings in the top bar to set it directly.'
    });
  }

  const selectedModel = getGroqModel(model);
  const maxTokens = selectedModel.includes('qwen') ? 1000 : 3000;

  // Build full message history with system prompt
  const fullMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
  ];

  // Set SSE streaming headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: fullMessages,
        temperature: 0.7,
        max_tokens: maxTokens,
        stream: true
      })
    });

    if (!groqResponse.ok) {
      const errorData = await groqResponse.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `Groq API returned status ${groqResponse.status}: ${groqResponse.statusText}`;
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    const reader = groqResponse.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;

        if (trimmed === 'data: [DONE]') {
          res.write('data: [DONE]\n\n');
          continue;
        }

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6);
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              res.write(`data: ${JSON.stringify({ content })}\n\n`);
            }
          } catch {
            // Ignore parse errors on partial lines
          }
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Groq streaming error:', err);
    res.write(`data: ${JSON.stringify({ error: err.message || 'An unexpected error occurred while contacting Groq.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

// Fallback to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`=============================================`);
  console.log(`✈️  WanderAI Trip Planner is running!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`🔑 Groq API Key: ${getGroqApiKey() ? 'Configured ✅' : 'Missing ⚠️ (Add to .env)'}`);
  console.log(`=============================================`);
});
