function normalizeProxy(rawProxy) {
  if (!rawProxy) {
    return null;
  }

  let proxyText = rawProxy.trim();
  if (!proxyText) {
    return null;
  }

  if (!/^https?:\/\//i.test(proxyText) && !/^socks[45]:\/\//i.test(proxyText)) {
    proxyText = `http://${proxyText}`;
  }

  const parsedUrl = new URL(proxyText);
  return {
    server: `${parsedUrl.protocol}//${parsedUrl.hostname}${parsedUrl.port ? `:${parsedUrl.port}` : ''}`,
    username: parsedUrl.username || undefined,
    password: parsedUrl.password || undefined,
    raw: rawProxy
  };
}

function getProxyForIndex(proxies, index) {
  if (!Array.isArray(proxies) || proxies.length === 0) {
    return null;
  }

  const proxyRaw = proxies[index % proxies.length];
  return normalizeProxy(proxyRaw);
}

function getRotatingValue(values, index) {
  if (!Array.isArray(values) || values.length === 0) {
    return null;
  }

  const value = values[index % values.length];
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

module.exports = {
  normalizeProxy,
  getProxyForIndex,
  getRotatingValue
};
