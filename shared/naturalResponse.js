/**
 * ███╗   ██╗ █████╗ ████████╗██╗   ██╗██████╗  █████╗ ██╗     
 * ████╗  ██║██╔══██╗╚══██╔══╝██║   ██║██╔══██╗██╔══██╗██║     
 * ██╔██╗ ██║███████║   ██║   ██║   ██║██████╔╝███████║██║     
 * ██║╚██╗██║██╔══██║   ██║   ██║   ██║██╔══██╗██╔══██║██║     
 * ██║ ╚████║██║  ██║   ██║   ╚██████╔╝██║  ██║██║  ██║███████╗
 * ╚═╝  ╚═══╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝
 * 
 * NATURAL RESPONSE GENERATOR
 * 
 * Makes bots respond like REAL humans in a group chat:
 * - Single word reactions
 * - Short casual responses  
 * - Varied sentence structures
 * - Typos occasionally
 * - Actually uses lowercase
 * - Doesn't always use perfect grammar
 */

const Anthropic = require('@anthropic-ai/sdk');

class NaturalResponse {
  constructor(anthropic) {
    this.anthropic = anthropic || new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    
    // Micro responses - single words/reactions (no AI needed)
    this.microResponses = {
      positive: ['lol', 'nice', 'damn', 'fr', 'true', 'facts', 'bet', 'yea', 'yep', 'haha', 'w', 'dope', 'sick', 'fire'],
      negative: ['nah', 'bruh', 'bro', 'oof', 'rip', 'L', 'nope', 'eh', 'meh', 'idk', 'damn'],
      neutral: ['hmm', 'oh', 'huh', 'k', 'ok', 'word', 'aight', 'gotchu', 'heard', 'say less'],
      question: ['wym', 'huh', 'wait what', 'what', 'how', 'why tho', '?', 'u sure?'],
      acknowledgment: ['heard', 'gotcha', 'bet', 'say less', 'fs', 'ight', 'cool', 'word']
    };
    
    // Bot-specific micro responses
    this.botMicros = {
      lester: {
        positive: ['...acceptable', 'fine', 'not bad', 'hmph', 'decent'],
        negative: ['no', 'absolutely not', 'are you serious', 'ugh', 'typical'],
        neutral: ['...', 'whatever', 'sure', 'if you say so', 'noted']
      },
      pavel: {
        positive: ['da!', 'excellent!', 'is good!', 'magnificent', 'wonderful'],
        negative: ['nyet', 'hmm not so good', 'is problem', 'oh no'],
        neutral: ['ah', 'interesting', 'I see', 'okay okay']
      },
      cripps: {
        positive: ['well alright', 'not bad', 'hmm fine', 'suppose so'],
        negative: ['nah', 'dont think so', 'aint right', 'nope'],
        neutral: ['*grunts*', 'mmhm', 'reckon so', 'yep']
      },
      chief: {
        positive: ['noted', 'good', 'acceptable', 'approved'],
        negative: ['denied', 'negative', 'no', 'dont think so'],
        neutral: ['hmm', 'interesting', 'I see', 'understood']
      },
      nazar: {
        positive: ['the spirits approve', 'fate smiles', 'yes...', 'it is written'],
        negative: ['the cards say no', 'I sense... trouble', 'not wise'],
        neutral: ['perhaps...', 'the spirits are unclear', 'we shall see', 'interesting...']
      }
    };
  }

  /**
   * Generate a micro response (no AI, instant)
   */
  getMicroResponse(botId, sentiment = 'neutral') {
    // Bot-specific micros (50% chance)
    if (Math.random() < 0.5 && this.botMicros[botId]) {
      const botOptions = this.botMicros[botId][sentiment] || this.botMicros[botId].neutral;
      return botOptions[Math.floor(Math.random() * botOptions.length)];
    }
    
    // Generic micros
    const options = this.microResponses[sentiment] || this.microResponses.neutral;
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Generate a natural response using AI
   */
  async generateResponse(botId, personality, message, style, memoryContext = '') {
    // Micro responses don't need AI
    if (style.lengthType === 'micro') {
      const sentiment = this.detectSentiment(message.content);
      return this.getMicroResponse(botId, sentiment);
    }

    // Build the system prompt based on style
    const systemPrompt = this.buildSystemPrompt(botId, personality, style, memoryContext);
    
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: style.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: message.content }]
      });
      
      let reply = response.content[0].text;
      
      // Post-process for naturalness
      reply = this.makeNatural(reply, style);
      
      return reply;
    } catch (e) {
      console.error('[NATURAL] Generation error:', e.message);
      return this.getMicroResponse(botId, 'neutral');
    }
  }

  /**
   * Build system prompt based on style
   */
  buildSystemPrompt(botId, personality, style, memoryContext) {
    let prompt = personality + '\n\n';
    
    // Length instructions
    const lengthInstructions = {
      short: 'Respond in ONE short sentence only. Be casual. Like texting a friend.',
      medium: 'Respond in 2-3 sentences max. Keep it casual and natural.',
      full: 'You can respond more fully, but stay natural. No essays.'
    };
    
    prompt += `CRITICAL INSTRUCTIONS:
${lengthInstructions[style.lengthType] || lengthInstructions.short}

NATURALNESS RULES:
- Write like a real person texting, not a formal AI
- Use lowercase mostly (unless emphasizing)
- Short sentences. Fragments okay.
- Don't start with "Ah," every time
- Don't use *actions* unless style.includeAction is true
- Vary your responses - don't be predictable
- You can use "lol", "bruh", "nah", etc naturally
- Don't over-explain. People don't do that.
${style.includeAction ? '- You can include ONE brief *action* if it fits' : '- Do NOT use *actions* or roleplay formatting'}

TONE: ${style.tone}
${style.mood < 0.3 ? 'You are in a BAD MOOD. Be short, irritated.' : ''}
${style.mood > 0.7 ? 'You are in a GOOD MOOD. Be friendlier than usual.' : ''}
`;

    if (memoryContext) {
      prompt += `\n${memoryContext}`;
    }

    return prompt;
  }

  /**
   * Post-process response for naturalness
   */
  makeNatural(text, style) {
    // Remove leading "Ah, " or "Well, " sometimes
    if (Math.random() < 0.5) {
      text = text.replace(/^(Ah,?\s*|Well,?\s*|So,?\s*)/i, '');
    }
    
    // Remove asterisk actions if not wanted
    if (!style.includeAction) {
      text = text.replace(/\*[^*]+\*/g, '').trim();
    }
    
    // Occasionally add typos (rare)
    if (Math.random() < 0.03) {
      text = this.addTypo(text);
    }
    
    // Occasionally lowercase everything
    if (Math.random() < 0.2 && text.length < 100) {
      text = text.toLowerCase();
    }
    
    // Remove excessive punctuation
    text = text.replace(/\.{4,}/g, '...');
    text = text.replace(/!{2,}/g, '!');
    text = text.replace(/\?{2,}/g, '?');
    
    // Trim whitespace
    text = text.trim();
    
    // If still too formal, simplify
    if (style.lengthType === 'short' && text.split(' ').length > 15) {
      const sentences = text.split(/[.!?]+/);
      text = sentences[0].trim();
      if (!text.endsWith('.') && !text.endsWith('!') && !text.endsWith('?')) {
        text += '.';
      }
    }
    
    return text;
  }

  /**
   * Add a realistic typo
   */
  addTypo(text) {
    const typos = {
      'the': 'teh',
      'you': 'yuo',
      'that': 'taht',
      'with': 'wiht',
      'have': 'ahve',
      'this': 'tihs',
      'from': 'form',
      'just': 'jsut',
      'what': 'waht',
      'your': 'yuor'
    };
    
    for (const [correct, typo] of Object.entries(typos)) {
      if (text.toLowerCase().includes(correct) && Math.random() < 0.5) {
        const regex = new RegExp(`\\b${correct}\\b`, 'i');
        return text.replace(regex, typo);
      }
    }
    
    return text;
  }

  /**
   * Detect sentiment of message
   */
  detectSentiment(text) {
    const lower = text.toLowerCase();
    
    const positiveWords = ['nice', 'good', 'great', 'awesome', 'thanks', 'cool', 'love', 'yes', 'yea', 'lol', 'haha', 'amazing', 'perfect', 'sweet'];
    const negativeWords = ['bad', 'hate', 'sucks', 'terrible', 'awful', 'no', 'nope', 'damn', 'shit', 'fuck', 'crap', 'ugh', 'annoying'];
    const questionWords = ['?', 'what', 'how', 'why', 'when', 'where', 'who', 'which', 'can you', 'could you', 'would you'];
    
    let score = 0;
    
    for (const word of positiveWords) {
      if (lower.includes(word)) score++;
    }
    for (const word of negativeWords) {
      if (lower.includes(word)) score--;
    }
    
    // Check for questions
    for (const word of questionWords) {
      if (lower.includes(word)) return 'question';
    }
    
    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    return 'neutral';
  }

  /**
   * Should this message get an emoji reaction instead of text?
   */
  shouldReactWithEmoji(message) {
    // 10% chance to just react with emoji instead of text
    return Math.random() < 0.10;
  }

  /**
   * Get appropriate reaction emoji
   */
  getReactionEmoji(text) {
    const sentiment = this.detectSentiment(text);
    
    const emojis = {
      positive: ['👀', '😂', '💀', '🔥', '👍', '💯', '😎', '🙌'],
      negative: ['😬', '💀', '🤔', '😐', '👀'],
      neutral: ['👀', '🤔', '👍', '😐'],
      question: ['🤔', '👀', '❓']
    };
    
    const options = emojis[sentiment] || emojis.neutral;
    return options[Math.floor(Math.random() * options.length)];
  }
}

module.exports = { NaturalResponse };
