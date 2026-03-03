function buildTargetUrlForEmail(baseUrl, email) {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    throw new Error('Target URL is required to generate per-email link.');
  }

  if (typeof email !== 'string' || !email.trim()) {
    return baseUrl;
  }

  const encodedEmail = encodeURIComponent(email.trim());
  let generatedUrl = baseUrl.trim();

  generatedUrl = generatedUrl
    .replace(/\{\{\s*email\s*\}\}/gi, encodedEmail)
    .replace(/\{\s*email\s*\}/gi, encodedEmail);

  generatedUrl = generatedUrl
    .replace(/\{\{\s*email_raw\s*\}\}/gi, email.trim())
    .replace(/\{\s*email_raw\s*\}/gi, email.trim());

  generatedUrl = generatedUrl
    .replace(/\{\{\s*timestamp\s*\}\}/gi, String(Date.now()))
    .replace(/\{\s*timestamp\s*\}/gi, String(Date.now()));

  if (/([?&])subi=/i.test(generatedUrl)) {
    return generatedUrl.replace(/([?&]subi=)[^&]*/i, `$1${encodedEmail}`);
  }

  const joiner = generatedUrl.includes('?') ? '&' : '?';
  return `${generatedUrl}${joiner}subi=${encodedEmail}`;
}

module.exports = {
  buildTargetUrlForEmail
};
