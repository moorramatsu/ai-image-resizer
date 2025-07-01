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
  processedImageBase64: null,
  scaledPixels: null,
  prompt: null,
  timestamp: null,
  debugInfo: null
};

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Enhanced color processing functions
function gammaCorrection(value, gamma = 2.2) {
  return Math.round(255 * Math.pow(value / 255, 1 / gamma));
}

function enhanceContrast(r, g, b, factor = 1.3) {
  // Convert to perceived brightness
  const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
  const mid = 128;
  
  // Apply contrast enhancement
  const newR = Math.max(0, Math.min(255, mid + factor * (r - mid)));
  const newG = Math.max(0, Math.min(255, mid + factor * (g - mid)));
  const newB = Math.max(0, Math.min(255, mid + factor * (b - mid)));
  
  return [Math.round(newR), Math.round(newG), Math.round(newB)];
}

function optimizeForLEDs(r, g, b) {
  // Step 1: Gamma correction for LED response
  let newR = gammaCorrection(r, 2.2);
  let newG = gammaCorrection(g, 2.2);
  let newB = gammaCorrection(b, 2.2);
  
  // Step 2: Enhance contrast
  [newR, newG, newB] = enhanceContrast(newR, newG, newB, 1.4);
  
  // Step 3: Boost saturation for more vivid colors
  const max = Math.max(newR, newG, newB);
  const min = Math.min(newR, newG, newB);
  const saturation = max === 0 ? 0 : (max - min) / max;
  
  if (saturation > 0.1) {
    const saturationBoost = 1.3;
    const avg = (newR + newG + newB) / 3;
    newR = Math.max(0, Math.min(255, avg + saturationBoost * (newR - avg)));
    newG = Math.max(0, Math.min(255, avg + saturationBoost * (newG - avg)));
    newB = Math.max(0, Math.min(255, avg + saturationBoost * (newB - avg)));
  }
  
  // Step 4: Minimum brightness threshold (LEDs need some minimum power)
  const minBrightness = 8;
  if (newR < minBrightness && newG < minBrightness && newB < minBrightness) {
    const scale = minBrightness / Math.max(newR, newG, newB, 1);
    newR *= scale;
    newG *= scale;
    newB *= scale;
  }
  
  return [Math.round(newR), Math.round(newG), Math.round(newB)];
}

function createProcessedImageBuffer(pixels) {
  // Create a PNG buffer from processed pixel data for preview
  const width = 16;
  const height = 16;
  const channels = 3;
  
  const buffer = Buffer.alloc(width * height * channels);
  for (let i = 0; i < pixels.length; i++) {
    buffer[i] = pixels[i];
  }
  
  return sharp(buffer, {
    raw: {
      width: width,
      height: height,
      channels: channels
    }
  }).png().toBuffer();
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Enhanced homepage with color processing preview
app.get('/', (req, res) => {
  console.log('Homepage accessed');
  
  let imagePreview = '';
  if (lastImageData.originalImageBase64 && lastImageData.scaledPixels) {
    imagePreview = `
      <h3>Last Generated Image:</h3>
      <p><strong>Prompt:</strong> "${lastImageData.prompt}"</p>
      <p><strong>Generated:</strong> ${lastImageData.timestamp}</p>
      
      <div style="display: flex; gap: 15px; align-items: flex-start; flex-wrap: wrap;">
        <div>
          <h4>1. Original AI Image</h4>
          <img src="data:image/jpeg;base64,${lastImageData.originalImageBase64}" 
               style="width: 200px; height: 200px; image-rendering: pixelated; border: 1px solid #ccc;">
          <p style="font-size: 11px; margin: 5px 0;">32x32 from Stability AI</p>
        </div>
        
        <div>
          <h4>2. Raw Resize</h4>
          <img src="data:image/png;base64,${lastImageData.resized16x16Base64}" 
               style="width: 200px; height: 200px; image-rendering: pixelated; border: 1px solid #ccc;">
          <p style="font-size: 11px; margin: 5px 0;">16x16 basic resize</p>
        </div>
        
        <div>
          <h4>3. LED-Optimized</h4>
          <img src="data:image/png;base64,${lastImageData.processedImageBase64}" 
               style="width: 200px; height: 200px; image-rendering: pixelated; border: 1px solid #ccc;">
          <p style="font-size: 11px; margin: 5px 0;">Gamma + Contrast + Saturation</p>
        </div>
        
        <div>
          <h4>4. ESP32 Matrix Preview</h4>
          <canvas id="espPreview" width="200" height="200" style="border: 1px solid #ccc; image-rendering: pixelated;"></canvas>
          <p style="font-size: 11px; margin: 5px 0;">Exact LED output</p>
        </div>
      </div>
      
      <div style="margin-top: 20px;">
        <h4>🎨 Color Processing Stats:</h4>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
            <div>
              <strong>Brightness Range:</strong><br>
              Min: ${lastImageData.debugInfo.brightnessRange.min}<br>
              Max: ${lastImageData.debugInfo.brightnessRange.max}<br>
              Avg: ${lastImageData.debugInfo.brightnessRange.avg}
            </div>
            <div>
              <strong>Color Distribution:</strong><br>
              Red avg: ${lastImageData.debugInfo.colorStats.avgRed}<br>
              Green avg: ${lastImageData.debugInfo.colorStats.avgGreen}<br>
              Blue avg: ${lastImageData.debugInfo.colorStats.avgBlue}
            </div>
            <div>
              <strong>Processing Applied:</strong><br>
              ✅ Gamma correction (2.2)<br>
              ✅ Contrast enhancement (1.4x)<br>
              ✅ Saturation boost (1.3x)<br>
              ✅ Minimum brightness (8)
            </div>
          </div>
        </div>
      </div>
      
      <div style="margin-top: 20px;">
        <h4>🔍 First 12 Pixels Comparison:</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div>
            <strong>Before Processing:</strong>
            <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 10px;">
              ${lastImageData.debugInfo.beforeProcessing.slice(0, 36).map((val, i) => {
                const pixelNum = Math.floor(i / 3);
                const colorType = ['R', 'G', 'B'][i % 3];
                const bgColor = colorType === 'R' ? '#ffe6e6' : colorType === 'G' ? '#e6ffe6' : '#e6e6ff';
                return `<span style="background: ${bgColor}; padding: 2px 4px; font-size: 10px; border-radius: 2px;">${val}</span>`;
              }).join('')}
            </div>
          </div>
          <div>
            <strong>After Processing:</strong>
            <div style="display: flex; flex-wrap: wrap; gap: 3px; margin-top: 10px;">
              ${lastImageData.scaledPixels.slice(0, 36).map((val, i) => {
                const pixelNum = Math.floor(i / 3);
                const colorType = ['R', 'G', 'B'][i % 3];
                const bgColor = colorType === 'R' ? '#ffcccc' : colorType === 'G' ? '#ccffcc' : '#ccccff';
                return `<span style="background: ${bgColor}; padding: 2px 4px; font-size: 10px; border-radius: 2px;">${val}</span>`;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
      
      <script>
        // Draw the final processed RGB pixel data
        const canvas = document.getElementById('espPreview');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          const pixels = ${JSON.stringify(lastImageData.scaledPixels)};
          
          // Clear canvas
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, 200, 200);
          
          // Draw each pixel as a 12.5x12.5 square (200/16 = 12.5px per LED)
          for (let i = 0; i < 256; i++) {
            const x = (i % 16) * 12.5;
            const y = Math.floor(i / 16) * 12.5;
            const r = pixels[i * 3] || 0;
            const g = pixels[i * 3 + 1] || 0;
            const b = pixels[i * 3 + 2] || 0;
            
            ctx.fillStyle = \`rgb(\${r}, \${g}, \${b})\`;
            ctx.fillRect(x, y, 12.5, 12.5);
          }
          
          // Add subtle grid
          ctx.strokeStyle = 'rgba(128, 128, 128, 0.3)';
          ctx.lineWidth = 0.5;
          for (let i = 0; i <= 16; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 12.5, 0);
            ctx.lineTo(i * 12.5, 200);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(0, i * 12.5);
            ctx.lineTo(200, i * 12.5);
            ctx.stroke();
          }
        }
      </script>
    `;
  } else {
    imagePreview = '<p><em>No images generated yet. Send a request to see color processing preview!</em></p>';
  }
  
  res.send(`
    <html>
      <head>
        <title>AI Image Frame - Enhanced Color Processing</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 1400px; margin: 0 auto; padding: 20px; }
          .status { background: #e8f5e8; padding: 15px; border-radius: 8px; margin: 15px 0; }
          .endpoint { background: #f0f0f0; padding: 15px; border-radius: 8px; font-family: monospace; }
          h4 { margin: 10px 0 5px 0; color: #333; }
        </style>
      </head>
      <body>
        <h1>🎨 AI Image Frame - Enhanced Color Processing</h1>
        <div class="status">
          <p><strong>Status:</strong> ✅ Running with LED color optimization</p>
          <p><strong>Server time:</strong> ${new Date().toISOString()}</p>
          <p><strong>Features:</strong> Gamma correction, contrast enhancement, saturation boost, brightness normalization</p>
        </div>
        
        ${imagePreview}
        
        <hr>
        <h3>🚀 Color Processing Pipeline:</h3>
        <ol>
          <li><strong>Generate:</strong> Stability AI creates 32x32 image</li>
          <li><strong>Resize:</strong> Sharp scales to 16x16 with nearest-neighbor</li>
          <li><strong>Gamma correct:</strong> Compensate for LED non-linear response</li>
          <li><strong>Enhance contrast:</strong> Make details more visible</li>
          <li><strong>Boost saturation:</strong> More vivid colors on LEDs</li>
          <li><strong>Normalize brightness:</strong> Ensure minimum LED visibility</li>
        </ol>
        
        <div class="endpoint">
          POST /api/resize-image<br>
          Content-Type: application/json<br>
          {"prompt": "your prompt here"}
        </div>
      </body>
    </html>
  `);
});

// Enhanced API endpoint with advanced color processing
app.post('/api/resize-image', async (req, res) => {
  try {
    console.log('🎨 API request received with enhanced color processing');
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'No prompt provided' });
    }

    console.log('📝 Processing prompt:', prompt);

    // Call Stability AI
    const formData = new FormData();
    formData.append('prompt', prompt + ', vibrant colors, high contrast'); // Enhance prompt for better LED display
    formData.append('aspect_ratio', '1:1');
    formData.append('width', '32');
    formData.append('height', '32');
    formData.append('output_format', 'jpeg');

    console.log('🤖 Calling Stability AI with enhanced prompt...');
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
      return res.status(500).json({ error: 'Stability AI request failed', details: errorText });
    }

    // Get original image
    const imageBuffer = await stabilityResponse.arrayBuffer();
    const originalImageBase64 = Buffer.from(imageBuffer).toString('base64');
    
    // Basic resize for comparison
    const resizedBuffer = await sharp(Buffer.from(imageBuffer))
      .resize(16, 16, { kernel: sharp.kernel.nearest, fit: 'fill' })
      .png()
      .toBuffer();
    const resized16x16Base64 = resizedBuffer.toString('base64');

    // Extract raw RGB pixel data (before processing)
    const rawPixelData = await sharp(Buffer.from(imageBuffer))
      .resize(16, 16, { kernel: sharp.kernel.nearest, fit: 'fill' })
      .raw()
      .toBuffer();

    const beforeProcessing = Array.from(rawPixelData);
    
    // ENHANCED COLOR PROCESSING
    console.log('🎨 Applying LED-optimized color processing...');
    const enhancedPixels = [];
    
    for (let i = 0; i < rawPixelData.length; i += 3) {
      const r = rawPixelData[i];
      const g = rawPixelData[i + 1];
      const b = rawPixelData[i + 2];
      
      // Apply LED optimization
      const [newR, newG, newB] = optimizeForLEDs(r, g, b);
      
      enhancedPixels.push(newR, newG, newB);
    }

    // Create processed image buffer for preview
    const processedImageBuffer = await createProcessedImageBuffer(enhancedPixels);
    const processedImageBase64 = processedImageBuffer.toString('base64');
    
    // Calculate debug statistics
    const debugInfo = {
      originalImageSize: imageBuffer.byteLength,
      pixelCount: enhancedPixels.length / 3,
      beforeProcessing: beforeProcessing,
      brightnessRange: {
        min: Math.min(...enhancedPixels),
        max: Math.max(...enhancedPixels),
        avg: Math.round(enhancedPixels.reduce((a, b) => a + b, 0) / enhancedPixels.length)
      },
      colorStats: {
        avgRed: Math.round(enhancedPixels.filter((_, i) => i % 3 === 0).reduce((a, b) => a + b, 0) / 256),
        avgGreen: Math.round(enhancedPixels.filter((_, i) => i % 3 === 1).reduce((a, b) => a + b, 0) / 256),
        avgBlue: Math.round(enhancedPixels.filter((_, i) => i % 3 === 2).reduce((a, b) => a + b, 0) / 256)
      },
      processingApplied: {
        gammaCorrection: '2.2',
        contrastEnhancement: '1.4x',
        saturationBoost: '1.3x',
        minimumBrightness: '8'
      }
    };
    
    // Store for web display
    lastImageData = {
      originalImageBase64,
      resized16x16Base64,
      processedImageBase64,
      scaledPixels: enhancedPixels,
      prompt: prompt,
      timestamp: new Date().toISOString(),
      debugInfo
    };
    
    console.log('✅ Enhanced color processing complete!');
    console.log('📊 Brightness range:', debugInfo.brightnessRange);
    console.log('🎨 Color averages:', debugInfo.colorStats);
    
    res.json({ 
      pixels: enhancedPixels,
      width: 16,
      height: 16,
      message: 'AI image processed with LED-optimized color enhancement',
      debug: debugInfo
    });
    
  } catch (error) {
    console.error('❌ Processing error:', error);
    res.status(500).json({ 
      error: 'Enhanced image processing failed',
      details: error.message 
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Enhanced color processing server running on 0.0.0.0:${PORT}`);
  console.log(`🎨 Features: Gamma correction, contrast enhancement, saturation boost`);
});
