import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

// Store the last generated image for display
let lastImageData = {
  originalImageBase64: null,
  scaledPixels: null,
  prompt: null,
  timestamp: null
};

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Enhanced homepage with image preview
app.get('/', (req, res) => {
  console.log('Homepage accessed');
  
  let imagePreview = '';
  if (lastImageData.originalImageBase64 && lastImageData.scaledPixels) {
    // Create 16x16 canvas visualization
    let canvasHtml = '<canvas id="scaledImage" width="320" height="320" style="border: 1px solid #ccc; image-rendering: pixelated;"></canvas>';
    
    imagePreview = `
      <h3>Last Generated Image:</h3>
      <p><strong>Prompt:</strong> ${lastImageData.prompt}</p>
      <p><strong>Generated:</strong> ${lastImageData.timestamp}</p>
      
      <div style="display: flex; gap: 20px; align-items: flex-start;">
        <div>
          <h4>Original AI Image (32x32)</h4>
          <img src="data:image/jpeg;base64,${lastImageData.originalImageBase64}" 
               style="width: 320px; height: 320px; image-rendering: pixelated; border: 1px solid #ccc;">
        </div>
        <div>
          <h4>Scaled for ESP32 (16x16)</h4>
          ${canvasHtml}
        </div>
      </div>
      
      <script>
        // Draw the 16x16 pixel array on canvas
        const canvas = document.getElementById('scaledImage');
        const ctx = canvas.getContext('2d');
        const pixels = ${JSON.stringify(lastImageData.scaledPixels)};
        
        // Clear canvas
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 320, 320);
        
        // Draw each pixel as a 20x20 square
        for (let i = 0; i < 256; i++) {
          const x = (i % 16) * 20;
          const y = Math.floor(i / 16) * 20;
          const r = pixels[i * 3] || 0;
          const g = pixels[i * 3 + 1] || 0;
          const b = pixels[i * 3 + 2] || 0;
          
          ctx.fillStyle = \`rgb(\${r}, \${g}, \${b})\`;
          ctx.fillRect(x, y, 20, 20);
        }
      </script>
    `;
  } else {
    imagePreview = '<p><em>No images generated yet. Send a request from your ESP32 to see preview here!</em></p>';
  }
  
  res.send(`
    <html>
      <body style="font-family: Arial, sans-serif; max-width: 1000px; margin: 0 auto; padding: 20px;">
        <h1>🎨 AI Image Resizer API</h1>
        <p>This service generates AI images and resizes them for ESP32 16x16 LED matrices.</p>
        <p><strong>API Endpoint:</strong> <code>/api/resize-image</code></p>
        <p><strong>Status:</strong> ✅ Running on Railway</p>
        <p><strong>Server time:</strong> ${new Date().toISOString()}</p>
        
        ${imagePreview}
        
        <hr>
        <h3>Usage:</h3>
        <p>POST to <code>/api/resize-image</code> with JSON: <code>{"prompt": "your prompt here"}</code></p>
      </body>
    </html>
  `);
});

// API endpoint with image storage
app.post('/api/resize-image', async (req, res) => {
  try {
    console.log('API request received');
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
    }

    console.log('Processing prompt:', prompt);

    // Call Stability AI
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('aspect_ratio', '1:1');
    formData.append('width', '32');
    formData.append('height', '32');
    formData.append('output_format', 'jpeg');

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

    // Get image as buffer and convert to base64 for display
    const imageBuffer = await stabilityResponse.arrayBuffer();
    const imageBytes = new Uint8Array(imageBuffer);
    const base64Image = Buffer.from(imageBytes).toString('base64');
    
    console.log('Image size:', imageBytes.length, 'bytes');

    // Sample the image data to create 16x16 representation
    const targetPixels = 768; // 16x16 * 3 colors
    const sampleRate = Math.floor(imageBytes.length / (targetPixels * 2));
    const pixels = [];
    
    // Skip JPEG header and sample
    let sampleCount = 0;
    for (let i = 100; i < imageBytes.length && pixels.length < targetPixels; i += sampleRate) {
      const byte = imageBytes[i];
      if (byte >= 20 && byte <= 235) {
        pixels.push(byte);
        sampleCount++;
      }
    }
    
    // Fill remaining pixels
    while (pixels.length < targetPixels) {
      const sourceIndex = pixels.length % (sampleCount || 1);
      pixels.push(pixels[sourceIndex] || 100);
    }
    
    // Store for web display
    lastImageData = {
      originalImageBase64: base64Image,
      scaledPixels: pixels,
      prompt: prompt,
      timestamp: new Date().toISOString()
    };
    
    console.log('Generated', pixels.length, 'pixel values');
    console.log('Image stored for web preview');
    
    res.json({ 
      pixels: pixels,
      width: 16,
      height: 16,
      message: 'AI image processed successfully',
      originalSize: imageBytes.length
    });
    
  } catch (error) {
    console.error('Processing error:', error);
    res.status(500).json({ 
      error: 'Image processing failed',
      details: error.message 
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on 0.0.0.0:${PORT}`);
});
