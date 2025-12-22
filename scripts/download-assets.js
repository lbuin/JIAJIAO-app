import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

// ESM dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the public directory path
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// The images hosted on GitHub Raw (using the links you provided earlier)
const ASSETS = [
  {
    name: 'wechat-pay.jpg',
    url: 'https://github.com/lbuin/JIAJIAO-app/blob/main/163d0a18aa6260eaa1cabf21c2443afa.jpg?raw=true'
  },
  {
    name: 'alipay.jpg',
    url: 'https://github.com/lbuin/JIAJIAO-app/blob/main/39fa725bde6f1aaa2665d3fa68edd91f.jpg?raw=true'
  }
];

// Ensure public directory exists
if (!fs.existsSync(PUBLIC_DIR)) {
  console.log(`Creating directory: ${PUBLIC_DIR}`);
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

const downloadFile = (url, dest) => {
  return new Promise((resolve, reject) => {
    // If file exists and is larger than 0 bytes, skip download to save time
    if (fs.existsSync(dest)) {
        const stats = fs.statSync(dest);
        if (stats.size > 0) {
            console.log(`✅ Exists (Skipping): ${path.basename(dest)}`);
            resolve();
            return;
        }
    }

    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        // Consume response data to free up memory
        response.resume();
        reject(new Error(`Failed to download ${url}: Status Code ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          console.log(`✅ Downloaded: ${path.basename(dest)}`);
          resolve();
        });
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); // Delete partial file
      reject(err);
    });
  });
};

const run = async () => {
  console.log('🚀 Starting asset check/download...');
  
  for (const asset of ASSETS) {
    const destPath = path.join(PUBLIC_DIR, asset.name);
    try {
      await downloadFile(asset.url, destPath);
    } catch (err) {
      console.error(`❌ Error downloading ${asset.name}:`, err.message);
    }
  }
  
  console.log('✨ Assets check complete.');
};

run();