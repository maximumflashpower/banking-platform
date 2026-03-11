function log(level, message, context = {}) {
  const record = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context
  };
  console.log(JSON.stringify(record));
}

module.exports = {
  info: (message, context) => log('info', message, context),
  warn: (message, context) => log('warn', message, context),
  error: (message, context) => log('error', message, context)
};