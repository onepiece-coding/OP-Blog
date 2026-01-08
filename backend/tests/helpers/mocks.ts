export function resetThirdPartyMocks() {
  try {
    const nodemailer = require('nodemailer');
    if (nodemailer && nodemailer.__mockSendMail && typeof nodemailer.__mockSendMail.mockClear === 'function') {
      nodemailer.__mockSendMail.mockClear();
    }
    if (nodemailer && nodemailer.__mockTransporter && nodemailer.__mockTransporter.sendMail && typeof nodemailer.__mockTransporter.sendMail.mockClear === 'function') {
      nodemailer.__mockTransporter.sendMail.mockClear();
    }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    // ignore if not present
  }

  try {
    const cloudinary = require('cloudinary');
    if (cloudinary && cloudinary.__uploadStreamSpy && typeof cloudinary.__uploadStreamSpy.mockClear === 'function') {
      cloudinary.__uploadStreamSpy.mockClear();
    }
    if (cloudinary && cloudinary.__destroySpy && typeof cloudinary.__destroySpy.mockClear === 'function') {
      cloudinary.__destroySpy.mockClear();
    }
    if (cloudinary && cloudinary.__deleteResourcesSpy && typeof cloudinary.__deleteResourcesSpy.mockClear === 'function') {
      cloudinary.__deleteResourcesSpy.mockClear();
    }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (err) {
    // ignore if not present
  }
}