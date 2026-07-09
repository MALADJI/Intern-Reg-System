import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

console.log('🚀 Starting application bootstrap...');

bootstrapApplication(App, appConfig)
  .then(() => {
    console.log('✅ Application bootstrapped successfully');
  })
  .catch((err) => {
    console.error('❌ Error bootstrapping application:', err);
    console.error('Error stack:', err.stack);
    // Display error on page if bootstrap fails
    document.body.innerHTML = `
      <div style="padding: 20px; font-family: Arial, sans-serif;">
        <h1 style="color: red;">Application Error</h1>
        <p>Failed to start the application. Please check the browser console for details.</p>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto;">${err.toString()}\n\n${err.stack || ''}</pre>
      </div>
    `;
  });
