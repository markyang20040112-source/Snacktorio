import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

// Custom plugin to handle local data saving via POST /api/save-data
function localSavePlugin() {
  return {
    name: 'local-save-plugin',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        if (req.url === '/api/save-data' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const dataDir = path.resolve(__dirname, 'src/data');
              if (data.machines) {
                fs.writeFileSync(path.join(dataDir, 'machines.json'), JSON.stringify(data.machines, null, 2), 'utf-8');
              }
              if (data.items) {
                fs.writeFileSync(path.join(dataDir, 'items.json'), JSON.stringify(data.items, null, 2), 'utf-8');
              }
              if (data.intermediateRecipes) {
                fs.writeFileSync(path.join(dataDir, 'intermediateRecipes.json'), JSON.stringify(data.intermediateRecipes, null, 2), 'utf-8');
              }
              if (data.recipes) {
                fs.writeFileSync(path.join(dataDir, 'recipes.json'), JSON.stringify(data.recipes, null, 2), 'utf-8');
              }
              if (data.calculatorDb) {
                fs.writeFileSync(path.join(dataDir, 'calculatorDb.json'), JSON.stringify(data.calculatorDb, null, 2), 'utf-8');
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, message: 'Local files updated successfully!' }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), localSavePlugin()],
  base: './', // Relative base for GitHub Pages support
  server: {
    port: 3000,
    open: true
  }
});
