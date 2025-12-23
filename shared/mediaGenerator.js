/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * KLING AI MEDIA GENERATION SYSTEM v1.0
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Generates images and videos for bot actions using Kling AI
 * - Detects *action* patterns in messages
 * - Decides image vs video based on action intensity
 * - Maintains character consistency
 * - Uploads directly to Discord
 * 
 * Each bot has a unique visual identity that stays consistent
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════════
// KLING AI CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const KLING_CONFIG = {
  accessKey: process.env.KLING_ACCESS_KEY,
  secretKey: process.env.KLING_SECRET_KEY,
  baseUrl: 'https://api.klingai.com',
  imageEndpoint: '/v1/images/generations',
  videoEndpoint: '/v1/videos/text2video',
  videoImageEndpoint: '/v1/videos/image2video',
  queryEndpoint: '/v1/images/generations/',
  videoQueryEndpoint: '/v1/videos/text2video/'
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHARACTER VISUAL IDENTITIES
// ═══════════════════════════════════════════════════════════════════════════════

const CHARACTER_PROFILES = {
  lester: {
    name: 'Lester Crest',
    basePrompt: `Middle-aged man with glasses, balding with remaining brown hair, slightly overweight, wearing a dark green jacket over a light shirt. Pale complexion, intelligent but tired eyes. Surrounded by multiple computer monitors in a dimly lit room filled with tech equipment. GTA V video game art style, cinematic lighting.`,
    setting: 'dark room with multiple computer screens, hacker setup, messy desk with energy drinks',
    mood: 'cynical, calculating, irritated but brilliant',
    style: 'GTA V cinematic, realistic game graphics, moody lighting'
  },
  
  pavel: {
    name: 'Pavel',
    basePrompt: `Russian submarine captain, middle-aged man with short dark hair and stubble, wearing a dark naval captain's uniform with cap. Weathered face with kind eyes, slight smile. Inside a submarine control room with sonar screens and naval equipment. GTA V video game art style, cinematic lighting.`,
    setting: 'submarine interior, periscope, sonar screens, naval control panels, dim red and blue lighting',
    mood: 'warm, supportive, professional, slight humor',
    style: 'GTA V cinematic, realistic game graphics, submarine atmosphere'
  },
  
  cripps: {
    name: 'Cripps',
    basePrompt: `Elderly man in his 60s-70s, gray hair and mustache, weathered tan face with wrinkles, wearing old western frontier clothes - brown vest, worn shirt, suspenders. Sitting by a campfire at a frontier trading camp. Red Dead Redemption 2 video game art style, cinematic lighting.`,
    setting: 'western frontier camp, campfire, wagon, animal pelts, wooden barrels, wilderness background',
    mood: 'grumpy, nostalgic, old-timer energy, storyteller',
    style: 'Red Dead Redemption 2 cinematic, realistic western, golden hour lighting'
  },
  
  madam: {
    name: 'Madam Nazar',
    basePrompt: `Mysterious Romani fortune teller woman, dark curly hair with headscarf, olive skin, piercing dark eyes with heavy eye makeup, wearing colorful bohemian clothes with gold jewelry and medallions. Sitting in an ornate wagon surrounded by mystical items, crystal balls, tarot cards. Red Dead Redemption 2 video game art style, mystical lighting.`,
    setting: 'fortune teller wagon interior, crystal ball, tarot cards, candles, mystical artifacts, purple and gold fabrics',
    mood: 'mysterious, all-knowing, ethereal, cryptic',
    style: 'Red Dead Redemption 2 cinematic, mystical atmosphere, candlelit'
  },
  
  chief: {
    name: 'Police Chief',
    basePrompt: `Stern law enforcement officer, middle-aged man with strong jaw, short graying hair, wearing a sheriff's badge and western law enforcement attire - tan shirt, vest with star badge, gun belt. Standing in a sheriff's office. Red Dead Redemption 2 video game art style, cinematic lighting.`,
    setting: 'sheriff office, wanted posters on wall, rifle rack, wooden desk, jail cells in background',
    mood: 'stern, authoritative, watchful, duty-bound',
    style: 'Red Dead Redemption 2 cinematic, western law enforcement, dramatic lighting'
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION DETECTION AND CLASSIFICATION
// ═══════════════════════════════════════════════════════════════════════════════

// Actions that warrant VIDEO generation (dramatic, motion-heavy)
const VIDEO_ACTIONS = [
  'slams', 'throws', 'storms', 'runs', 'jumps', 'dances', 'fights',
  'explodes', 'crashes', 'chases', 'flees', 'attacks', 'defends',
  'dramatically', 'violently', 'furiously', 'wildly', 'frantically',
  'bursts', 'charges', 'leaps', 'spins', 'collapses', 'breaks down',
  'walks away', 'storms off', 'paces', 'marches', 'sneaks',
  'celebrates', 'rages', 'panics', 'screams', 'laughs maniacally'
];

// Actions that warrant IMAGE generation (static, pose-based)
const IMAGE_ACTIONS = [
  'looks', 'glances', 'stares', 'gazes', 'watches', 'observes',
  'sits', 'stands', 'leans', 'crosses arms', 'shrugs', 'nods',
  'sighs', 'smiles', 'frowns', 'grins', 'smirks', 'grimaces',
  'thinks', 'ponders', 'contemplates', 'considers',
  'holds', 'grabs', 'picks up', 'puts down', 'examines',
  'adjusts', 'checks', 'reads', 'types', 'scrolls',
  'drinks', 'eats', 'smoking', 'lighting',
  'points', 'waves', 'gestures', 'motions'
];

// Rare epic actions that get LONG videos
const EPIC_ACTIONS = [
  'tells the story', 'recounts the tale', 'remembers when',
  'has a vision', 'sees the future', 'prophesies',
  'complete breakdown', 'loses it completely', 'snaps',
  'epic', 'legendary', 'historic', 'unforgettable'
];

/**
 * Detects if a message contains an action in *asterisks*
 * @param {string} content - Message content
 * @returns {object|null} - Action details or null
 */
function detectAction(content) {
  // Match text between asterisks
  const actionMatch = content.match(/\*([^*]+)\*/);
  if (!actionMatch) return null;
  
  const action = actionMatch[1].toLowerCase();
  const fullAction = actionMatch[1]; // Preserve original case
  
  // Determine action type
  let actionType = 'none';
  let intensity = 'low';
  
  // Check for epic actions first (long video)
  for (const epic of EPIC_ACTIONS) {
    if (action.includes(epic)) {
      actionType = 'epic_video';
      intensity = 'epic';
      break;
    }
  }
  
  // Check for video actions
  if (actionType === 'none') {
    for (const videoAction of VIDEO_ACTIONS) {
      if (action.includes(videoAction)) {
        actionType = 'video';
        intensity = 'high';
        break;
      }
    }
  }
  
  // Check for image actions
  if (actionType === 'none') {
    for (const imageAction of IMAGE_ACTIONS) {
      if (action.includes(imageAction)) {
        actionType = 'image';
        intensity = 'medium';
        break;
      }
    }
  }
  
  // Default to image for any other action
  if (actionType === 'none' && action.length > 2) {
    actionType = 'image';
    intensity = 'low';
  }
  
  if (actionType === 'none') return null;
  
  return {
    action: fullAction,
    type: actionType,
    intensity
  };
}

/**
 * Decides if media should be generated (rate limiting, randomness)
 * @param {string} actionType - Type of action
 * @returns {boolean}
 */
function shouldGenerateMedia(actionType) {
  // Rate limiting map
  if (!global.lastMediaGeneration) {
    global.lastMediaGeneration = new Map();
  }
  
  const now = Date.now();
  const lastGen = global.lastMediaGeneration.get('last') || 0;
  
  // Minimum 2 minutes between generations to save credits
  if (now - lastGen < 2 * 60 * 1000) {
    return false;
  }
  
  // Probability based on action type
  const probabilities = {
    'epic_video': 0.90,  // 90% chance for epic moments
    'video': 0.40,       // 40% chance for videos
    'image': 0.30        // 30% chance for images
  };
  
  const chance = probabilities[actionType] || 0.20;
  
  if (Math.random() < chance) {
    global.lastMediaGeneration.set('last', now);
    return true;
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KLING AI API AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generates JWT token for Kling API authentication
 */
function generateJWT() {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: KLING_CONFIG.accessKey,
    exp: now + 1800, // 30 minutes
    nbf: now - 5
  };
  
  const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', KLING_CONFIG.secretKey)
    .update(`${base64Header}.${base64Payload}`)
    .digest('base64url');
  
  return `${base64Header}.${base64Payload}.${signature}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT BUILDING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Builds a detailed prompt for image/video generation
 * @param {string} botId - Bot identifier
 * @param {string} action - The action to depict
 * @param {string} type - 'image' or 'video'
 */
function buildPrompt(botId, action, type) {
  const character = CHARACTER_PROFILES[botId];
  if (!character) {
    console.error(`[MEDIA] Unknown bot: ${botId}`);
    return null;
  }
  
  let prompt = '';
  
  if (type === 'image') {
    prompt = `${character.basePrompt}

ACTION: ${action}

SETTING: ${character.setting}

MOOD: ${character.mood}

STYLE: ${character.style}, highly detailed, 4K quality, dramatic composition`;
  } else {
    // Video prompt - more dynamic
    prompt = `${character.basePrompt}

PERFORMING ACTION: ${action}

The character is ${action} with ${character.mood} energy.

SETTING: ${character.setting}

CAMERA: Cinematic shot, slight movement, dramatic angles

STYLE: ${character.style}, smooth motion, professional cinematography`;
  }
  
  return prompt;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API CALLS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Makes authenticated request to Kling API
 */
async function klingRequest(endpoint, method, body = null) {
  return new Promise((resolve, reject) => {
    const jwt = generateJWT();
    const url = new URL(KLING_CONFIG.baseUrl + endpoint);
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    
    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

/**
 * Generates an image using Kling AI
 */
async function generateImage(botId, action) {
  const prompt = buildPrompt(botId, action, 'image');
  if (!prompt) return null;
  
  console.log(`[MEDIA] Generating image for ${botId}: ${action}`);
  
  try {
    const response = await klingRequest(KLING_CONFIG.imageEndpoint, 'POST', {
      model: 'kling-v1',
      prompt: prompt,
      negative_prompt: 'blurry, low quality, distorted face, bad anatomy, watermark, text, signature',
      n: 1,
      image_size: '1024x1024',
      style: 'realistic'
    });
    
    if (response.code !== 0 && response.code !== undefined) {
      console.error('[MEDIA] Kling API error:', response);
      return null;
    }
    
    // If we get a task_id, we need to poll for results
    if (response.data?.task_id) {
      return await pollForResult(response.data.task_id, 'image');
    }
    
    // Direct result
    if (response.data?.images?.[0]?.url) {
      return {
        type: 'image',
        url: response.data.images[0].url
      };
    }
    
    return null;
  } catch (error) {
    console.error('[MEDIA] Image generation error:', error);
    return null;
  }
}

/**
 * Generates a video using Kling AI
 */
async function generateVideo(botId, action, duration = 5) {
  const prompt = buildPrompt(botId, action, 'video');
  if (!prompt) return null;
  
  console.log(`[MEDIA] Generating video for ${botId}: ${action}`);
  
  try {
    const response = await klingRequest(KLING_CONFIG.videoEndpoint, 'POST', {
      model: 'kling-v1',
      prompt: prompt,
      negative_prompt: 'blurry, low quality, distorted, glitchy, watermark',
      duration: duration.toString(),
      aspect_ratio: '16:9',
      mode: 'std' // standard quality
    });
    
    if (response.code !== 0 && response.code !== undefined) {
      console.error('[MEDIA] Kling API error:', response);
      return null;
    }
    
    // Videos always need polling
    if (response.data?.task_id) {
      return await pollForResult(response.data.task_id, 'video');
    }
    
    return null;
  } catch (error) {
    console.error('[MEDIA] Video generation error:', error);
    return null;
  }
}

/**
 * Polls Kling API for task completion
 */
async function pollForResult(taskId, type, maxAttempts = 60) {
  const endpoint = type === 'image' 
    ? `${KLING_CONFIG.queryEndpoint}${taskId}`
    : `${KLING_CONFIG.videoQueryEndpoint}${taskId}`;
  
  console.log(`[MEDIA] Polling for ${type} result: ${taskId}`);
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds between polls
    
    try {
      const response = await klingRequest(endpoint, 'GET');
      
      if (response.data?.task_status === 'completed' || response.data?.task_status === 'succeed') {
        if (type === 'image' && response.data?.task_result?.images?.[0]?.url) {
          return {
            type: 'image',
            url: response.data.task_result.images[0].url
          };
        }
        if (type === 'video' && response.data?.task_result?.videos?.[0]?.url) {
          return {
            type: 'video',
            url: response.data.task_result.videos[0].url
          };
        }
      }
      
      if (response.data?.task_status === 'failed') {
        console.error('[MEDIA] Task failed:', response.data?.task_status_msg);
        return null;
      }
      
      console.log(`[MEDIA] Polling attempt ${i + 1}/${maxAttempts}, status: ${response.data?.task_status}`);
    } catch (error) {
      console.error('[MEDIA] Polling error:', error);
    }
  }
  
  console.error('[MEDIA] Polling timed out');
  return null;
}

/**
 * Downloads media from URL to buffer for Discord upload
 */
async function downloadMedia(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    
    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadMedia(response.headers.location).then(resolve).catch(reject);
      }
      
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN GENERATION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main function to handle media generation for a bot message
 * @param {string} botId - Bot identifier (lester, pavel, cripps, madam, chief)
 * @param {string} messageContent - The message content to check for actions
 * @param {object} channel - Discord channel to send media to
 * @returns {object|null} - Media result or null
 */
async function handleBotMedia(botId, messageContent, channel) {
  // Check if API keys are configured
  if (!KLING_CONFIG.accessKey || !KLING_CONFIG.secretKey) {
    console.log('[MEDIA] Kling API keys not configured');
    return null;
  }
  
  // Detect action in message
  const actionInfo = detectAction(messageContent);
  if (!actionInfo) return null;
  
  console.log(`[MEDIA] Detected action: "${actionInfo.action}" (${actionInfo.type})`);
  
  // Decide if we should generate
  if (!shouldGenerateMedia(actionInfo.type)) {
    console.log('[MEDIA] Skipping generation (rate limit or probability)');
    return null;
  }
  
  let result = null;
  
  try {
    // Generate based on action type
    if (actionInfo.type === 'image') {
      result = await generateImage(botId, actionInfo.action);
    } else if (actionInfo.type === 'video') {
      result = await generateVideo(botId, actionInfo.action, 5);
    } else if (actionInfo.type === 'epic_video') {
      result = await generateVideo(botId, actionInfo.action, 10);
    }
    
    // Send to Discord if we got a result
    if (result && result.url && channel) {
      console.log(`[MEDIA] Sending ${result.type} to Discord`);
      
      const buffer = await downloadMedia(result.url);
      const extension = result.type === 'video' ? 'mp4' : 'png';
      const filename = `${botId}_${Date.now()}.${extension}`;
      
      await channel.send({
        files: [{
          attachment: buffer,
          name: filename
        }]
      });
      
      return result;
    }
  } catch (error) {
    console.error('[MEDIA] Error in handleBotMedia:', error);
  }
  
  return null;
}

/**
 * Generates a welcome video for new members (special feature)
 */
async function generateWelcomeMedia(botId, memberName) {
  const character = CHARACTER_PROFILES[botId];
  if (!character) return null;
  
  const prompt = `${character.basePrompt}

ACTION: Welcoming someone new, friendly wave and smile

The character warmly welcomes "${memberName}" with a friendly gesture.

SETTING: ${character.setting}

STYLE: ${character.style}, warm and inviting atmosphere`;

  try {
    const response = await klingRequest(KLING_CONFIG.imageEndpoint, 'POST', {
      model: 'kling-v1',
      prompt: prompt,
      negative_prompt: 'blurry, low quality, distorted face, bad anatomy',
      n: 1,
      image_size: '1024x1024'
    });
    
    if (response.data?.task_id) {
      return await pollForResult(response.data.task_id, 'image');
    }
    
    return null;
  } catch (error) {
    console.error('[MEDIA] Welcome media error:', error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  detectAction,
  shouldGenerateMedia,
  handleBotMedia,
  generateImage,
  generateVideo,
  generateWelcomeMedia,
  downloadMedia,
  buildPrompt,
  CHARACTER_PROFILES,
  VIDEO_ACTIONS,
  IMAGE_ACTIONS,
  EPIC_ACTIONS
};
