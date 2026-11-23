const HttpError = require('../utils/httpError');

const notFound = (req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });

// Turns MySQL errors into sensible HTTP responses.
// Business-rule errors raised by the stored procedures use SQLSTATE 45000 (SIGNAL), e.g.
// "Train has already departed", "Invalid origin/destination for this train".
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  if (err.sqlState === '45000') return res.status(400).json({ error: err.sqlMessage });

  switch (err.errno) {
    case 1062: {
      const key = /for key '(?:[^.']+\.)?([^']+)'/.exec(err.sqlMessage || '');
      return res.status(409).json({ error: `Already exists${key ? ` (${key[1]})` : ''}` });
    }
    case 1452:
      return res.status(400).json({ error: 'A referenced record does not exist' });
    case 1451:
      return res.status(409).json({ error: 'This record is still referenced by other data' });
    case 3819:
    case 4025:
      return res.status(400).json({ error: 'Value violates a table constraint' });
    case 1213:
    case 1205:
      return res.status(503).json({ error: 'Database is busy, please retry' });
    default:
      console.error(err);
      return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { notFound, errorHandler };
