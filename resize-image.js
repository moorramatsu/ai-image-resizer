import sharp from 'sharp';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get image data from request
    const { imageData } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    // Convert base64 to buffer
    const imageBuffer = Buffer.from(imageData, 'base64');
    
    // Resize to 16x16 and get RGB data
    const { data, info } = await sharp(imageBuffer)
      .resize(16, 16, { fit: 'cover' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    // Convert to RGB array (data is already in RGB format)
    const rgbArray = Array.from(data);
    
    return res.status(200).json({ 
      pixels: rgbArray,
      width: info.width,
      height: info.height 
    });
    
  } catch (error) {
    console.error('Image processing error:', error);
    return res.status(500).json({ error: 'Image processing failed' });
  }
}
