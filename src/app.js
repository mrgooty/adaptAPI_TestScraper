const express = require('express');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');
const dataRoutes = require('./routes/dataRoutes');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// On serverless hosts the swagger-ui-dist static assets don't reliably make
// it into the function bundle (blank /api-docs page), so point the UI at
// CDN-hosted assets there. Locally everything is served from node_modules.
const swaggerUiOptions = process.env.VERCEL
  ? {
      customCssUrl: 'https://unpkg.com/swagger-ui-dist@5/swagger-ui.css',
      customJs: [
        'https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js',
        'https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js',
      ],
    }
  : {};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

app.get('/', (req, res) => {
  res.json({ message: 'Hello, Express!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

app.use('/api', dataRoutes);

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: err.message });
});

module.exports = app;
