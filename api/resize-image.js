export default async function handler(req, res) {
  // Enable CORS for ESP32
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('Received AI image request');
    
    // Get prompt from ESP32
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
    }

    console.log('Processing prompt:', prompt);

    // Call Stability AI API
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('aspect_ratio', '1:1');
    formData.append('width', '32');
    formData.append('height', '32');
    formData.append('output_format', 'jpeg');

    console.log('Calling Stability AI...');
    
    const stabilityResponse = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer sk-sMtfZJ36PpX7GgvgF3jn8dN772qImkFKAbZCDqxHwRNNGL82',
        'Accept': 'image/*'
      },
      body: formData
    });

    if (!stabilityResponse.ok) {
      console.error('Stability AI error:', stabilityResponse.status);
      return res.status(500).json({ error: 'Stability AI request failed' });
    }

    console.log('Got image from Stability AI, processing...');

    // Get image as buffer
    const imageBuffer = await stabilityResponse.arrayBuffer();
    const imageBytes = new Uint8Array(imageBuffer);
    
    console.log('Image size:', imageBytes.length, 'bytes');

    // Sample the image data to create 16x16 representation
    const targetPixels = 768; // 16x16 * 3 colors
    const sampleRate = Math.floor(imageBytes.length / (targetPixels * 2));
    const pixels = [];
    
    // Skip JPEG header (first 100 bytes)
    let sampleCount = 0;
    for (let i = 100; i < imageBytes.length && pixels.length < targetPixels; i += sampleRate) {
      const byte = imageBytes[i];
      // Filter for reasonable color values
      if (byte >= 20 && byte <= 235) {
        pixels.push(byte);
        sampleCount++;
      }
    }
    
    // Fill remaining pixels if needed
    while (pixels.length < targetPixels) {
      const sourceIndex = pixels.length % (sampleCount || 1);
      pixels.push(pixels[sourceIndex] || 100);
    }
    
    console.log('Generated', pixels.length, 'pixel values');
    
    return res.status(200).json({ 
      pixels: pixels,
      width: 16,
      height: 16,
      message: 'AI image processed successfully',
      originalSize: imageBytes.length
    });
    
  } catch (error) {
    console.error('Processing error:', error);
    return res.status(500).json({ 
      error: 'Image processing failed',
      details: error.message 
    });
  }
}
