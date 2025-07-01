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
    console.log('Received image processing request');
    
    // Get image data from request body
    const imageData = req.body;
    
    if (!imageData || imageData.length === 0) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    console.log('Image data size:', imageData.length, 'bytes');
    
    // Simple pixel sampling approach (since we can't use sharp on Vercel Edge)
    // Sample every Nth byte to get 768 values (256 pixels * 3 colors)
    const targetPixels = 768; // 16x16 * 3 colors
    const step = Math.floor(imageData.length / targetPixels);
    const pixels = [];
    
    let sampleCount = 0;
    for (let i = 100; i < imageData.length && pixels.length < targetPixels; i += step) {
      const byte = imageData[i];
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
    
    console.log('Generated pixel array:', pixels.length, 'values');
    
    return res.status(200).json({ 
      pixels: pixels,
      width: 16,
      height: 16,
      message: 'Image processed successfully'
    });
    
  } catch (error) {
    console.error('Image processing error:', error);
    return res.status(500).json({ 
      error: 'Image processing failed',
      details: error.message 
    });
  }
}
