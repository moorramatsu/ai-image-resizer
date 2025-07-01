import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import sharp from 'sharp';

const app = express();
const PORT = process.env.PORT || 3000;

// Store the last generated image for display
let lastImageData = {
  originalImageBase64: null,
  resized16x16Base64: null,
  scaledPixels: null,
  prompt: null,
  timestamp: null,
  debugInfo: null
};

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Enhanced homepage with better image preview
app.get('/', (req, res) => {
  console.log('Homepage accessed');
  
  let imagePreview = '';
  if (lastImageData.originalImageBase64 && lastImageData.scaledPixels) {
    imagePreview = `
      <h3>Last Generated Image:</h3>
      <p><strong>Prompt:</strong> "${lastImageData.prompt}"</p>
      <p><strong>Generated:</strong> ${lastImageData.timestamp}</p>
      
      <div style="display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap;">
        <div>
          <h4>1. Original AI Image (32x32)</h4>
          <img src="data:image/jpeg;base64,${lastImageData.originalImageBase64}" 
               style="width: 256px; height: 256px; image-rendering: pixelated; border: 1px solid #ccc;">
          <p style="font-size: 12px;">From Stability AI</p>
        </div>
        
        <div>
          <h4>2. Resized to 16x16</h4>
          <img src="data:image/png;base64,${lastImageData.resized16x16Base64}" 
               style="width: 256px; height: 256px; image-rendering: pixelated; border: 1px solid #ccc;">
          <p style="font-size: 12px;">Processed with Sharp</p>
        </div>
        
        <div>
          <h4>3. RGB Data for ESP32</h4>
          <canvas id="espPreview" width="256" height="256" style="border: 1px solid #ccc; image-rendering: pixelated;"></canvas>
          <p style="font-size: 12px;">What ESP32 receives</p>
        </div>
      </div>
      
      <div style="margin-top: 20px;">
        <h4>Debug Info:</h4>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(lastImageData.debugInfo, null, 2)}</pre>
      </div>
      
      <div style="margin-top: 20px;">
        <h4>First 48 RGB Values (16 pixels):</h4>
        <div style="display: flex; flex-wrap: wrap; gap: 5px;">
          ${lastImageData.scaledPixels.slice(0, 48).map((val, i) => {
            const colorType = ['R', 'G', 'B'][i % 3];
            const pixelNum = Math.floor(i / 3);
            return `<span style="background: ${colorType === 'R' ? '#ffcccc' : colorType === 'G' ? '#ccffcc' : '#ccccff'}; padding: 2px 4px; font-size: 11px;">${colorType}${pixelNum}: ${val}</span>`;
          }).join('')}
        </div>
      </div>
      
      <script>
        // Draw the RGB pixel data exactly as ESP32 would see it
        const canvas = document.getElementById('espPreview');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          const pixels = ${JSON.stringify(lastImageData.scaledPixels)};
          
          // Clear canvas
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, 256, 256);
          
          // Draw each pixel as a 16x16 square (256/16 = 16px per LED)
          for (let i = 0; i < 256; i++) {
            const x = (i % 16) * 16;
            const y = Math.floor(i / 16) * 16;
            const r = pixels[i * 3] || 0;
            const g = pixels[i * 3 + 1] || 0;
            const b = pixels[i * 3 + 2] || 0;
            
            ctx.fillStyle = \`rgb(\${r}, \${g}, \${b})\`;
            ctx.fillRect(x, y, 16, 16);
          }
          
          // Add grid lines
          ctx.strokeStyle = '#333';
          ctx.lineWidth = 0.5;
          for (let i = 0; i <= 16; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 16, 0);
            ctx.lineTo(i * 16, 256);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(0, i * 16);
            ctx.lineTo(256, i * 16);
            ctx.stroke();
          }
        }
      </script>
    `;
  } else {
    imagePreview = '<p><em>No images generated yet. Send a request from your ESP32 to see preview here!</em></p>';
  }
  
  res.send(`
    <html>
      <head>
        <title>AI Image Frame - Railway Service</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
          .status { background: #e8f5e8; padding: 10px; border-radius: 4px; margin: 10px 0; }
          .endpoint { background: #f0f0f0; padding: 10px; border-radius: 4px; font-family: monospace; }
        </style>
      </head>
      <body>
        <h1>🎨 AI Image Frame - Railway Service</h1>
        <div class="status">
          <p><strong>Status:</strong> ✅ Running on Railway</p>
          <p><strong>Server time:</strong> ${new Date().toISOString()}</p>
        </div>
        
        ${imagePreview}
        
        <hr>
        <h3>API Usage:</h3>
        <div class="endpoint">
          POST /api/resize-image<br>
          Content-Type: application/json<br>
          {"prompt": "your prompt here"}
        </div>
      </body>
    </html>
  `);
});

// FIXED API endpoint with proper image processing
app.post('/api/resize-image', async (req, res) => {
  try {
    console.log('🎨 API request received');
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
    }

    console.log('📝 Processing prompt:', prompt);

    // Call Stability AI
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('aspect_ratio', '1:1');
    formData.append('width', '32');  // Start with 32x32 for better quality
    formData.append('height', '32');
    formData.append('output_format', 'jpeg');

    console.log('🤖 Calling Stability AI...');
    const stabilityResponse = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer sk-sMtfZJ36PpX7GgvgF3jn8dN772qImkFKAbZCDqxHwRNNGL82',
        'Accept': 'image/*'
      },
      body: formData
    });

    if (!stabilityResponse.ok) {
      console.error('❌ Stability AI error:', stabilityResponse.status);
      const errorText = await stabilityResponse.text();
      console.error('Error details:', errorText);
      return res.status(500).json({ error: 'Stability AI request failed', details: errorText });
    }

    // Get image as buffer
    const imageBuffer = await stabilityResponse.arrayBuffer();
    const originalImageBase64 = Buffer.from(imageBuffer).toString('base64');
    
    console.log('📷 Original image size:', imageBuffer.byteLength, 'bytes');

    // PROPER IMAGE PROCESSING: Use Sharp to resize and extract RGB pixels
    const resizedBuffer = await sharp(Buffer.from(imageBuffer))
      .resize(16, 16, { 
        kernel: sharp.kernel.nearest,  // Preserve sharp edges for pixel art
        fit: 'fill'  // Fill the entire 16x16 space
      })
      .png()  // Convert to PNG for lossless processing
      .toBuffer();

    // Get the resized image as base64 for web display
    const resized16x16Base64 = resizedBuffer.toString('base64');

    // Extract raw RGB pixel data
    const rawPixelData = await sharp(Buffer.from(imageBuffer))
      .resize(16, 16, { 
        kernel: sharp.kernel.nearest,
        fit: 'fill'
      })
      .raw()  // Get raw RGB data
      .toBuffer();

    console.log('🔍 Raw pixel data length:', rawPixelData.length, '(should be 768 = 16x16x3)');

    // Convert to array of RGB values
    const pixels = Array.from(rawPixelData);
    
    // Create debug info
    const debugInfo = {
      originalImageSize: imageBuffer.byteLength,
      resizedBufferSize: resizedBuffer.length,
      rawPixelDataSize: rawPixelData.length,
      finalPixelsCount: pixels.length,
      expectedPixelCount: 768, // 16x16x3
      firstPixel: {
        r: pixels[0],
        g: pixels[1], 
        b: pixels[2]
      },
      averageValues: {
        r: Math.round(pixels.filter((_, i) => i % 3 === 0).reduce((a, b) => a + b, 0) / 256),
        g: Math.round(pixels.filter((_, i) => i % 3 === 1).reduce((a, b) => a + b, 0) / 256),
        b: Math.round(pixels.filter((_, i) => i % 3 === 2).reduce((a, b) => a + b, 0) / 256)
      }
    };
    
    // Store for web display
    lastImageData = {
      originalImageBase64,
      resized16x16Base64,
      scaledPixels: pixels,
      prompt: prompt,
      timestamp: new Date().toISOString(),
      debugInfo
    };
    
    console.log('✅ Generated', pixels.length, 'pixel values');
    console.log('📊 Debug info:', debugInfo);
    
    res.json({ 
      pixels: pixels,
      width: 16,
      height: 16,
      message: 'AI image processed successfully with Sharp',
      debug: debugInfo
    });
    
  } catch (error) {
    console.error('❌ Processing error:', error);
    res.status(500).json({ 
      error: 'Image processing failed',
      details: error.message 
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on 0.0.0.0:${PORT}`);
  console.log(`🌐 Visit your Railway URL to see image previews`);
});
