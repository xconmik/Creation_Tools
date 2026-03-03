function assertRawUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    throw new Error('Target URL must be a string.');
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Target URL is empty.');
  }

  return trimmed;
}

function ensureHttpScheme(candidate) {
  if (!/^https?:\/\//i.test(candidate)) {
    return `https://${candidate}`;
  }

  return candidate;
}

function sanitizeUrlInput(rawUrl) {
  const raw = assertRawUrl(rawUrl);
  let candidate = ensureHttpScheme(raw);

  candidate = candidate.replace(/[\r\n\t]+/g, '');
  candidate = candidate.replace(/\s/g, '%20');
  candidate = candidate.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');

  const firstQueryIndex = candidate.indexOf('?');
  if (firstQueryIndex >= 0) {
    const beforeQuery = candidate.slice(0, firstQueryIndex + 1);
    const queryPart = candidate.slice(firstQueryIndex + 1).replace(/\?/g, '&');
    candidate = `${beforeQuery}${queryPart}`;
  }

  candidate = candidate.replace(/&&+/g, '&');
  candidate = candidate.replace(/\?&/g, '?');
  candidate = candidate.replace(/[?&]$/g, '');

  return candidate;
}

function validateHttpUrl(candidate) {
  const parsed = new URL(candidate);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Target URL must use http or https.');
  }

  if (!parsed.hostname) {
    throw new Error('Target URL hostname is missing.');
  }

  return parsed;
}

function normalizeUrl(rawUrl) {
  const sanitized = sanitizeUrlInput(rawUrl);

  try {
    return validateHttpUrl(sanitized).toString();
  } catch {
    try {
      const encodedFallback = encodeURI(sanitized);
      return validateHttpUrl(encodedFallback).toString();
    } catch {
      throw new Error('Target URL could not be normalized. Please provide a reachable link.');
    }
  }
}

function getNavigationCandidates(rawUrl) {
  const directCandidate = sanitizeUrlInput(rawUrl);
  const normalizedUrl = normalizeUrl(rawUrl);
  const parsed = new URL(normalizedUrl);

  const candidates = [directCandidate, normalizedUrl];

  const withoutQuery = `${parsed.origin}${parsed.pathname}`;
  if (!candidates.includes(withoutQuery)) {
    candidates.push(withoutQuery);
  }

  const registerUrl = `${parsed.origin}/register`;
  if (!candidates.includes(registerUrl)) {
    candidates.push(registerUrl);
  }

  const homeUrl = `${parsed.origin}/`;
  if (!candidates.includes(homeUrl)) {
    candidates.push(homeUrl);
  }

  return candidates;
}

function getRedirectAssessment(candidateUrl, finalUrl) {
  if (typeof finalUrl !== 'string' || !finalUrl) {
    return { redirected: false, suspicious: false };
  }

  if (candidateUrl === finalUrl) {
    return { redirected: false, suspicious: false };
  }

  const loginLike = /\/login|signin|sign-in|kirjaudu/i.test(finalUrl);
  return {
    redirected: true,
    suspicious: loginLike
  };
}

module.exports = {
  sanitizeUrlInput,
  normalizeUrl,
  getNavigationCandidates,
  getRedirectAssessment
};
