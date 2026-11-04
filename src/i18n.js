// Đa ngôn ngữ: mỗi ngôn ngữ một file JSON phẳng trong lang/. Thêm ngôn ngữ = thêm file + khai báo ở LANGS.
// Chuỗi dùng {tên} làm placeholder. Thiếu key thì lùi về tiếng Việt, rồi về chính key.
export const LANGS = ['vi', 'en'];
let dict = {}, fallback = {}, current = 'vi';

// Bản đóng gói một file nhúng sẵn chuỗi vào window.__LANG_DATA__ (không cần fetch)
async function load(code) {
  const emb = globalThis.__LANG_DATA__;
  if (emb && emb[code]) return emb[code];
  const res = await fetch(`lang/${code}.json`);
  if (!res.ok) throw new Error('Không tải được ngôn ngữ ' + code);
  return res.json();
}

export async function initI18n(code = 'vi') {
  fallback = await load('vi');
  await setLang(code);
}

export async function setLang(code) {
  current = LANGS.includes(code) ? code : 'vi';
  dict = current === 'vi' ? fallback : await load(current);
  document.documentElement.lang = current;
}

export const getLang = () => current;
export const langName = (code) => (code === current ? dict : code === 'vi' ? fallback : {})._meta?.name || code;

export function t(key, params) {
  let s = dict[key] ?? fallback[key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, v);
  return s;
}
