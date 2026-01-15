const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Policy Files API',
      version: '1.0.0',
      description: 'API for uploading policy files to Firebase Storage',
    },
    servers: [
      { url: `http://localhost:${process.env.PORT || 3000}`, description: 'Local server' }
    ],
  },
  apis: ['./src/server.js'],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
