import fs from 'fs';
import path from 'path';

export interface StorageService {
  saveBase64(base64Data: string, fileName: string): Promise<string>;
}

class LocalStorageService implements StorageService {
  private uploadDir: string;

  constructor() {
    // Save uploads to parent directory or inside backend
    this.uploadDir = path.join(__dirname, '../../../uploads/patient-photos');
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async saveBase64(base64Data: string, fileName: string): Promise<string> {
    // Strip header if present (e.g. data:image/png;base64,)
    const base64ImageBytes = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64ImageBytes, 'base64');
    
    const filePath = path.join(this.uploadDir, fileName);
    await fs.promises.writeFile(filePath, buffer);

    // Return the relative URL served by static middleware
    return `/uploads/patient-photos/${fileName}`;
  }
}

export const storageService = new LocalStorageService();
