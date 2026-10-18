const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');

const R2_ENV = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
let client;

function isR2Configured() {
  return R2_ENV.every(name => Boolean(process.env[name]));
}

function getR2Client() {
  const missing = R2_ENV.filter(name => !process.env[name]);
  if (missing.length) {
    throw new Error(`Cloudflare R2 is not configured; missing ${missing.join(', ')}.`);
  }

  if (client) return client;
  client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
  });
  return client;
}

function normalizeKey(key) {
  const normalized = String(key || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (!normalized || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Invalid R2 object key.');
  }
  return normalized;
}

async function uploadObject(key, body, contentType, contentLength) {
  const normalizedKey = normalizeKey(key);
  const publicUrl = getPublicUrl(normalizedKey);
  const client = getR2Client();
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: normalizedKey,
    Body: body,
    ...(Number.isFinite(contentLength) ? { ContentLength: contentLength } : {}),
    ...(contentType ? { ContentType: contentType } : {})
  }));
  return publicUrl;
}

async function deleteObject(key) {
  if (!key) return;
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: normalizeKey(key)
  }));
}

async function downloadObject(key) {
  const client = getR2Client();
  const response = await client.send(new GetObjectCommand({
    Bucket: process.env.R2_BUCKET,
    Key: normalizeKey(key)
  }));
  if (!response.Body) throw new Error(`R2 returned an empty response for "${key}".`);
  return Buffer.from(await response.Body.transformToByteArray());
}

function getPublicUrl(key) {
  const baseUrl = process.env.R2_PUBLIC_URL;
  if (!baseUrl) {
    throw new Error('R2_PUBLIC_URL is required to serve uploaded files publicly.');
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(baseUrl);
  } catch {
    throw new Error('R2_PUBLIC_URL must be a valid HTTPS URL.');
  }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
    throw new Error('R2_PUBLIC_URL must be an HTTPS base URL without credentials, query, or fragment.');
  }
  const encodedKey = normalizeKey(key).split('/').map(encodeURIComponent).join('/');
  return `${parsedUrl.toString().replace(/\/+$/, '')}/${encodedKey}`;
}

module.exports = { isR2Configured, uploadObject, deleteObject, downloadObject, getPublicUrl, normalizeKey };
