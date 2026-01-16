const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Policy Files API',
      version: '1.0.0',
      description: 'API for uploading policy files to Firebase or Supabase Storage',
    },
    servers: [
      // Prefer explicit swagger server URL from environment (Render sets RENDER_EXTERNAL_URL),
      // otherwise fall back to localhost with the configured PORT.
      { url: process.env.SWAGGER_SERVER_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`, description: 'API server' }
    ],
  },
  apis: ['./src/server.js', './src/documents.js'],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
