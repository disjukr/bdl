const table = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
];

export function encodeBase64(data: Uint8Array): string {
  let i;
  const l = data.length;
  const result = [];
  for (i = 2; i < l; i += 3) {
    result.push(
      table[data[i - 2] >> 2],
      table[((data[i - 2] & 0x03) << 4) | (data[i - 1] >> 4)],
      table[((data[i - 1] & 0x0f) << 2) | (data[i] >> 6)],
      table[data[i] & 0x3f],
    );
  }
  if (i === l) {
    result.push(
      table[data[i - 2] >> 2],
      table[((data[i - 2] & 0x03) << 4) | (data[i - 1] >> 4)],
      table[(data[i - 1] & 0x0f) << 2],
      "=",
    );
  } else if (i === l + 1) {
    result.push(
      table[data[i - 2] >> 2],
      table[(data[i - 2] & 0x03) << 4],
      "==",
    );
  }
  return result.join("");
}

export function decodeBase64(b64: string): Uint8Array {
  const binString = atob(b64);
  const size = binString.length;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; ++i) bytes[i] = binString.charCodeAt(i);
  return bytes;
}
