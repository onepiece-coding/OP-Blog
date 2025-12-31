const stream = require('stream');

// internal helpers
function makeUploadStream(opts, cb) {
  const pass = new stream.PassThrough();
  pass.on('finish', () => {
    cb(undefined, { public_id: opts.public_id ?? 'mock-id', secure_url: 'https://example.com/mock.jpg' });
  });
  return pass;
}

// Jest-friendly spies (if tests use require to access them)
const __uploadStreamSpy = jest.fn((opts, cb) => makeUploadStream(opts, cb));
const __destroySpy = jest.fn(async (publicId) => ({ result: 'ok', public_id: publicId }));
const __deleteResourcesSpy = jest.fn(async (ids) => {
  const out = {};
  ids.forEach((id) => (out[id] = 'deleted'));
  return { deleted: out };
});

const v2 = {
  uploader: {
    upload_stream: (opts, cb) => __uploadStreamSpy(opts, cb),
    destroy: (publicId) => __destroySpy(publicId),
  },
  api: {
    delete_resources: (ids) => __deleteResourcesSpy(ids),
  },
  config: () => {},
};

// exports compatible shape
module.exports = { v2 };
module.exports.v2 = v2;
module.exports.default = module.exports;

// expose spies so tests can clear/inspect them
module.exports.__uploadStreamSpy = __uploadStreamSpy;
module.exports.__destroySpy = __destroySpy;
module.exports.__deleteResourcesSpy = __deleteResourcesSpy;