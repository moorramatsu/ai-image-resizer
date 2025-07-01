import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint (Railway needs this)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Homepage
app.get('/', (req, res) => {
  console.log('Homepage accessed');
  res.send(`
    <html>
      <body>
        <h1>AI Image Resizer API</h1>
        <p>This service resizes images for ESP32 AI picture frames.</p>
        <p><strong>API Endpoint:</strong> <code>/api/resize-image</code></p>
        <p>Status: ✅ Running on Railway</p>
        <p>Server time: ${new Date().toISOString()}</p>
      </body>
    </html>
  `);
});

// Simplified API endpoint for testing
app.post('/api/resize-image', async (req, res) => {
  try {
    console.log('API request received');
    console.log('Request body:', req.body);
    
    const { prompt } = req.body;
    
    if (!prompt) {
      console.log('No prompt provided');
      return res.status(400).json({ error: 'No prompt provided' });
    }

    console.log('Processing prompt:', prompt);

    // For now, return test data to verify the connection works
    const testPixels = [];
    for (let i = 0; i < 768; i++) {
      testPixels.push(Math.floor(Math.random() * 200) + 30); // Random colors 30-230
    }
    
    console.log('Sending test response with', testPixels.length, 'pixels');
    
    res.json({ 
      pixels: testPixels,
      width: 16,
      height: 16,
      message: 'Test response - Railway connection working!',
      originalSize: 12345,
      prompt: prompt
    });
    
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ 
      error: 'Processing failed',
      details: error.message 
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server - IMPORTANT: bind to 0.0.0.0, not localhost
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on 0.0.0.0:${PORT}`);
  console.log(`✅ Railway should be able to health check this server`);
});
