const fs = require('fs');
const path = require('path');

function isLoopback(ip = '') {
  const value = String(ip || '').trim();
  if (!value) return false;
  if (value === '127.0.0.1' || value === '::1') return true;
  if (value.startsWith('::ffff:127.0.0.1')) return true;
  return false;
}

function safeSlug(input, fallback = 'unknown') {
  const raw = String(input || '').trim();
  if (!raw) return fallback;
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

module.exports = async function textmodeRoutes(fastify) {
  const BODY_LIMIT_SAVE = 5 * 1024 * 1024; // 5MB
  const BODY_LIMIT_AI = 256 * 1024; // 256KB
  const token = String(process.env.WOJAK_TEXTMODE_TOKEN || '').trim();

  const isAllowedOrigin = (originHeader) => {
    const origin = String(originHeader || '').trim();
    if (!origin) return true; // non-browser/curl
    try {
      const u = new URL(origin);
      const host = (u.hostname || '').toLowerCase();
      return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
    } catch (err) {
      return false;
    }
  };

  const contentLengthTooLarge = (request, limit) => {
    const raw = request && request.headers ? request.headers['content-length'] : null;
    if (raw == null) return false;
    const n = Number(raw);
    if (!Number.isFinite(n)) return false;
    return n > limit;
  };

  // Lightweight local rate limit (prevents runaway token burn if a page spams localhost).
  const rate = {
    windowMs: 60_000,
    max: 300,
    byKey: new Map() // key -> { count, resetAt }
  };

  fastify.addHook('onRequest', async (request, reply) => {
    const ip = request.ip || (request.socket && request.socket.remoteAddress) || '';
    if (!isLoopback(ip)) {
      reply.code(403).send({ ok: false, error: 'forbidden' });
      return;
    }

    // Block cross-site requests early (helps even without token configured).
    if (!isAllowedOrigin(request.headers && request.headers.origin)) {
      reply.code(403).send({ ok: false, error: 'forbidden_origin' });
      return;
    }

    // Optional shared-secret token (recommended). When configured, must be provided by the client.
    if (token) {
      const hdr = request.headers && (request.headers['x-textmode-token'] || request.headers['x-wojak-textmode-token']);
      if (String(hdr || '').trim() !== token) {
        reply.code(401).send({ ok: false, error: 'missing_or_invalid_token' });
        return;
      }
    }

    // Body size guardrails (based on Content-Length when present).
    const url = String(request.url || '');
    if (url.startsWith('/api/textmode/save') && contentLengthTooLarge(request, BODY_LIMIT_SAVE)) {
      reply.code(413).send({ ok: false, error: 'payload_too_large' });
      return;
    }
    if (url.startsWith('/api/textmode/ai/') && contentLengthTooLarge(request, BODY_LIMIT_AI)) {
      reply.code(413).send({ ok: false, error: 'payload_too_large' });
      return;
    }

    // Rate limit AI endpoints.
    if (url.startsWith('/api/textmode/ai/')) {
      const now = Date.now();
      const key = `${ip}|${token ? 'token' : 'no_token'}`;
      const entry = rate.byKey.get(key);
      if (!entry || now >= entry.resetAt) {
        rate.byKey.set(key, { count: 1, resetAt: now + rate.windowMs });
      } else {
        entry.count += 1;
        if (entry.count > rate.max) {
          reply.code(429).send({ ok: false, error: 'rate_limited' });
          return;
        }
      }
    }
  });

  fastify.get('/api/textmode/ping', async () => ({ ok: true }));

  fastify.post('/api/textmode/save', { bodyLimit: BODY_LIMIT_SAVE }, async (request, reply) => {
    const body = request.body || {};
    const run = body.run;
    if (!run || typeof run !== 'object') {
      reply.code(400).send({ ok: false, error: 'bad_payload' });
      return;
    }
    const meta = (run.meta && typeof run.meta === 'object') ? run.meta : {};
    const seed = safeSlug(meta.seed, 'na');
    const provider = safeSlug(meta.provider, 'local');
    const model = safeSlug(meta.model, 'textmode');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `run-${provider}-${model}-seed-${seed}-${ts}.json`;

    const runsDir = path.join(__dirname, '..', 'runs');
    fs.mkdirSync(runsDir, { recursive: true });
    const absPath = path.join(runsDir, file);
    fs.writeFileSync(absPath, JSON.stringify(run, null, 2), 'utf8');

    reply.send({ ok: true, path: path.join('runs', file) });
  });

	  const extractResponseText = (payload) => {
	    if (!payload || typeof payload !== 'object') return '';
	    if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
	    const out = payload.output;
	    if (Array.isArray(out)) {
	      const texts = [];
	      for (const item of out) {
	        const content = item && item.content;
	        if (!Array.isArray(content)) continue;
	        for (const c of content) {
	          if (!c || typeof c !== 'object') continue;
	          // Responses API commonly uses: {type:"output_text", text:"..."}
	          if (typeof c.text === 'string') {
	            texts.push(c.text);
	            continue;
	          }
	          // Some variants may nest the text value.
	          if (c.text && typeof c.text === 'object') {
	            if (typeof c.text.value === 'string') {
	              texts.push(c.text.value);
	              continue;
	            }
	            if (typeof c.text.text === 'string') {
	              texts.push(c.text.text);
	              continue;
	            }
	          }
	        }
	      }
	      const joined = texts.join('\n').trim();
	      if (joined) return joined;
	    }
	    // Fallback: try common chat format
	    const choices = payload.choices;
	    if (Array.isArray(choices) && choices[0]?.message?.content) {
	      return String(choices[0].message.content || '').trim();
	    }
	    // Last-resort: some SDKs wrap output under `response.output[0].content[0].text`.
	    return '';
	  };

		  const summarizeResponseShape = (payload) => {
		    try {
		      const out = payload && payload.output;
		      const outputTypes = Array.isArray(out) ? out.map(o => o && o.type).filter(Boolean) : [];
		      const contentTypes = [];
		      if (Array.isArray(out)) {
		        for (const item of out) {
		          const content = item && item.content;
		          if (!Array.isArray(content)) continue;
		          for (const c of content) {
		            if (c && typeof c === 'object' && c.type) contentTypes.push(c.type);
		          }
		        }
		      }
		      return {
		        status: payload?.status || null,
		        incomplete_details: payload?.incomplete_details || null,
		        hasOutputText: typeof payload?.output_text === 'string',
		        outputCount: Array.isArray(out) ? out.length : 0,
		        outputTypes,
		        contentTypes
		      };
		    } catch (err) {
		      return { error: String(err?.message || err) };
		    }
		  };

  fastify.post('/api/textmode/ai/openai', { bodyLimit: BODY_LIMIT_AI }, async (request, reply) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      reply.code(500).send({ ok: false, error: 'missing_openai_api_key' });
      return;
    }
	    const body = request.body || {};
		    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'gpt-5-mini';
		    const temperatureRaw = Number(body.temperature);
		    const temperature = Number.isFinite(temperatureRaw) ? Math.max(0, Math.min(2, temperatureRaw)) : 1;
		    const effortRaw = typeof body.reasoningEffort === 'string' ? body.reasoningEffort.trim().toLowerCase() : '';
		    const reasoningEffort = ['low', 'medium', 'high'].includes(effortRaw) ? effortRaw : 'medium';
		    const maxTokensByEffort = reasoningEffort === 'high' ? 10000 : (reasoningEffort === 'medium' ? 8000 : 5000);
		    const maxOutputTokensRaw = Number(body.maxOutputTokens);
		    const max_output_tokens = Number.isFinite(maxOutputTokensRaw)
		      ? Math.max(200, Math.min(4000, Math.floor(maxOutputTokensRaw)))
		      : maxTokensByEffort;
		    const phase = typeof body.phase === 'string' ? body.phase : 'act';
		    const snapshot = typeof body.snapshot === 'string' ? body.snapshot : '';
		    const peeks = Array.isArray(body.peeks) ? body.peeks : [];
		    const errors = Array.isArray(body.errors) ? body.errors : [];
		    const executed = Array.isArray(body.executed) ? body.executed : [];

	    const rules = [
	      'You are playing Wojak Investor Sim as a yearly decision agent.',
	      '',
	      'Goal: maximize final net worth by the end of the run. You are competing against other LLMs.',
	      '',
	      'Money formatting:',
	      '- All money values in the snapshot are exact USD with cents (e.g. $2,241.24).',
	      '- When you output command amounts, use $<amount> (commas optional).',
	      '',
	      'Strategy Notebook:',
	      '- A Strategy Notebook (0-6) is included in the snapshot each turn; use it to keep your plan consistent across years.',
	      '- You may update it with /strategy update <index> <note> and /strategy clear <index>.',
	      '',
	      'Turn structure:',
	      '- Each call represents decisions on January 1 of the current year.',
	      '- You may issue multiple commands for that date.',
	      '- After you output /endyear, the year advances and you will receive a new snapshot next call.',
	      '- Treat each year independently: do not rely on memory of past years unless it is included in the current snapshot.',
      '',
	      'Commands you may use:',
	      '/strategy update <0-6> <note>',
	      '/strategy clear <0-6>',
	      '/peek <company name>',
	      '/buy <company name> $<amount>',
	      '/sell <company name> $<amount>',
      '/buymax <company name>',
      '/sellmax <company name>',
      '/borrow $<amount>',
      '/repay $<amount>',
      '/drip on|off',
      '/vcbuy <venture name> full|tenth|hundredth|thousandth',
      '/endyear',
      '',
      'Constraints:',
      '- Never invent company or venture names. Only use names that appear in the provided snapshot/peek results.',
      '- Follow the command syntax exactly.',
      '',
	      'Output format:',
	      '- First line: Rationale: 1–3 short sentences.',
	      '- Then output ONLY valid commands, one per line.',
	      '- If you choose to take no actions, output /endyear as your only command.',
	      '- Important: Every line starting with "/" will be executed. Never start an explanatory sentence with "/".',
	      '- No extra text, headers, code blocks, or commentary.',
	      '',
	      '————————————————'
	    ].join('\n');

    const userParts = [];
	    if (phase === 'peek') {
	      userParts.push(
	        'PHASE: PEEK',
	        'Task: request any needed info using /peek, and optionally update your Strategy Notebook using /strategy. Do not trade, borrow/repay, change drip, buy VC, or /endyear.',
	        'SNAPSHOT:',
	        snapshot
	      );
	    } else {
	      userParts.push(
	        'PHASE: ACT',
	        'Task: output final action commands and end with /endyear.',
	        '',
	        'SNAPSHOT:',
	        snapshot
	      );
	      if (peeks.length) {
	        userParts.push('', 'PEEK_RESULTS:', ...peeks.map(p => String(p || '')));
	      }
	      if (errors.length) {
	        userParts.push(
	          '',
	          'LAST_ERRORS:',
	          ...errors.map(e => String(e || '')),
	          '',
	          'Task update: Fix the errors above. Do not repeat already-executed actions. Only output commands; end with /endyear only if all actions you output would succeed.'
	        );
	      }
	      if (executed.length) {
	        userParts.push('', 'ALREADY_EXECUTED_ACTIONS:', ...executed.map(c => String(c || '')));
	      }
	    }
	    const userText = userParts.join('\n');

		    const payload = {
		      model,
		      input: [
		        { role: 'system', content: [{ type: 'input_text', text: rules }] },
		        { role: 'user', content: [{ type: 'input_text', text: userText }] }
		      ],
		      temperature,
		      reasoning: { effort: reasoningEffort },
		      max_output_tokens
		    };

    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      reply.code(res.status).send({ ok: false, error: 'openai_http_error', status: res.status, message: msg });
      return;
    }
	    const data = await res.json();
	    const text = extractResponseText(data);
	    reply.send({
	      ok: true,
	      text,
	      debug: text ? null : summarizeResponseShape(data),
	      usage: data.usage || null,
	      responseId: data.id || null
	    });
	  });

	  const extractGeminiText = (payload) => {
	    try {
	      const candidates = payload && payload.candidates;
	      if (!Array.isArray(candidates) || !candidates.length) return '';
	      const parts = candidates[0]?.content?.parts;
	      if (!Array.isArray(parts) || !parts.length) return '';
	      const texts = [];
	      for (const p of parts) {
	        if (p && typeof p.text === 'string') texts.push(p.text);
	      }
	      return texts.join('\n').trim();
	    } catch (err) {
	      return '';
	    }
	  };

	  const summarizeGeminiShape = (payload) => {
	    try {
	      const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
	      const first = candidates[0] || null;
	      const parts = Array.isArray(first?.content?.parts) ? first.content.parts : [];
	      const finishReason = first?.finishReason || null;
	      const safetyRatings = Array.isArray(first?.safetyRatings) ? first.safetyRatings : [];
	      return {
	        candidates: candidates.length,
	        finishReason,
	        partsCount: parts.length,
	        hasTextPart: parts.some(p => p && typeof p.text === 'string' && p.text.trim()),
	        promptFeedback: payload?.promptFeedback || null,
	        safetyRatings
	      };
	    } catch (err) {
	      return { error: String(err?.message || err) };
	    }
	  };

	  fastify.post('/api/textmode/ai/google', { bodyLimit: BODY_LIMIT_AI }, async (request, reply) => {
	    const apiKey = process.env.GOOGLE_API_KEY;
	    if (!apiKey) {
	      reply.code(500).send({ ok: false, error: 'missing_google_api_key' });
	      return;
	    }
	    const body = request.body || {};
	    const modelRaw = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : 'gemini-2.0-flash';
	    const modelPath = modelRaw.startsWith('models/') ? modelRaw : `models/${modelRaw}`;
	    const temperatureRaw = Number(body.temperature);
	    const temperature = Number.isFinite(temperatureRaw) ? Math.max(0, Math.min(2, temperatureRaw)) : 1;
	    const phase = typeof body.phase === 'string' ? body.phase : 'act';
	    const snapshot = typeof body.snapshot === 'string' ? body.snapshot : '';
	    const peeks = Array.isArray(body.peeks) ? body.peeks : [];
	    const errors = Array.isArray(body.errors) ? body.errors : [];
	    const executed = Array.isArray(body.executed) ? body.executed : [];

	    // Reuse the same rules + user message as OpenAI so behavior matches across providers.
	    const rules = [
	      'You are playing Wojak Investor Sim as a yearly decision agent.',
	      '',
	      'Goal: maximize final net worth by the end of the run. You are competing against other LLMs.',
	      '',
	      'Money formatting:',
	      '- All money values in the snapshot are exact USD with cents (e.g. $2,241.24).',
	      '- When you output command amounts, use $<amount> (commas optional).',
	      '',
	      'Strategy Notebook:',
	      '- A Strategy Notebook (0-6) is included in the snapshot each turn; use it to keep your plan consistent across years.',
	      '- You may update it with /strategy update <index> <note> and /strategy clear <index>.',
	      '',
	      'Turn structure:',
	      '- Each call represents decisions on January 1 of the current year.',
	      '- You may issue multiple commands for that date.',
	      '- After you output /endyear, the year advances and you will receive a new snapshot next call.',
	      '- Treat each year independently: do not rely on memory of past years unless it is included in the current snapshot.',
	      '',
	      'Commands you may use:',
	      '/strategy update <0-6> <note>',
	      '/strategy clear <0-6>',
	      '/peek <company name>',
	      '/buy <company name> $<amount>',
	      '/sell <company name> $<amount>',
	      '/buymax <company name>',
	      '/sellmax <company name>',
	      '/borrow $<amount>',
	      '/repay $<amount>',
	      '/drip on|off',
	      '/vcbuy <venture name> full|tenth|hundredth|thousandth',
	      '/endyear',
	      '',
	      'Constraints:',
	      '- Never invent company or venture names. Only use names that appear in the provided snapshot/peek results.',
	      '- Follow the command syntax exactly.',
	      '',
	      'Output format:',
	      '- First line: Rationale: 1–3 short sentences.',
	      '- Then output ONLY valid commands, one per line.',
	      '- If you choose to take no actions, output /endyear as your only command.',
	      '- Important: Every line starting with "/" will be executed. Never start an explanatory sentence with "/".',
	      '- No extra text, headers, code blocks, or commentary.',
	      '',
	      '————————————————'
	    ].join('\n');

	    const userParts = [];
	    if (phase === 'peek') {
	      userParts.push(
	        'PHASE: PEEK',
	        'Task: request any needed info using /peek, and optionally update your Strategy Notebook using /strategy. Do not trade, borrow/repay, change drip, buy VC, or /endyear.',
	        'SNAPSHOT:',
	        snapshot
	      );
	    } else {
	      userParts.push(
	        'PHASE: ACT',
	        'Task: output final action commands and end with /endyear.',
	        '',
	        'SNAPSHOT:',
	        snapshot
	      );
	      if (peeks.length) {
	        userParts.push('', 'PEEK_RESULTS:', ...peeks.map(p => String(p || '')));
	      }
	      if (errors.length) {
	        userParts.push(
	          '',
	          'LAST_ERRORS:',
	          ...errors.map(e => String(e || '')),
	          '',
	          'Task update: Fix the errors above. Do not repeat already-executed actions. Only output commands; end with /endyear only if all actions you output would succeed.'
	        );
	      }
	      if (executed.length) {
	        userParts.push('', 'ALREADY_EXECUTED_ACTIONS:', ...executed.map(c => String(c || '')));
	      }
	    }
	    const userText = userParts.join('\n');

	    const payload = {
	      systemInstruction: { parts: [{ text: rules }] },
	      contents: [{ role: 'user', parts: [{ text: userText }] }],
	      generationConfig: {
	        temperature,
	        maxOutputTokens: 1000
	      }
	    };

	    const url = `https://generativelanguage.googleapis.com/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(apiKey)}`;
	    const res = await fetch(url, {
	      method: 'POST',
	      headers: { 'Content-Type': 'application/json' },
	      body: JSON.stringify(payload)
	    });
	    if (!res.ok) {
	      const msg = await res.text().catch(() => '');
	      reply.code(res.status).send({ ok: false, error: 'google_http_error', status: res.status, message: msg });
	      return;
	    }
	    const data = await res.json().catch(() => ({}));
	    const text = extractGeminiText(data);
	    const usage = data?.usageMetadata
	      ? {
	          input_tokens: data.usageMetadata.promptTokenCount ?? null,
	          output_tokens: data.usageMetadata.candidatesTokenCount ?? null,
	          total_tokens: data.usageMetadata.totalTokenCount ?? null
	        }
	      : null;
	    reply.send({
	      ok: true,
	      text,
	      debug: text ? null : summarizeGeminiShape(data),
	      usage,
	      responseId: null
	    });
	  });
	};
