'use strict';

const { ExternalTimeoutError } = require('./errorTypes');

async function withTimeout(promiseFactory, timeoutMs, meta = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new ExternalTimeoutError(
          `external_timeout_after_${timeoutMs}ms`,
          meta
        )
      );
    }, timeoutMs);

    Promise.resolve()
      .then(() => promiseFactory())
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

module.exports = {
  withTimeout,
};
