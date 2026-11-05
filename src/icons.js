// Bộ icon duy nhất của giao diện: SVG nét phẳng, lưới 24, nét 2, đầu bo tròn, tô theo màu chữ (currentColor).
// Không dùng emoji (mỗi hệ điều hành vẽ emoji một kiểu: iOS 3D, Android phẳng...). Style nằm ở CSS (.ic).
const P = {
  heart: 'M12 20.5s-8-4.7-8-10.6A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 8 2.5c0 5.9-8 10.6-8 10.6z',
  flag: 'M5 21V4M5 4.5h12l-2.5 4 2.5 4H5',
  star: 'M12 3.5l2.5 5.3 5.8.7-4.3 4 1.1 5.8L12 16.4 6.9 19.3 8 13.5 3.7 9.5l5.8-.7z',
  shield: 'M12 3l7.5 3v5.5c0 4.6-3.1 8.2-7.5 9.5-4.4-1.3-7.5-4.9-7.5-9.5V6z',
  sword: 'M12 2.5l3 3.2V14H9V5.7zM6 14h12M12 14v5M12 21.5v.01',
  foot: 'M5 3.5h7v8l6.5 3.2a2 2 0 0 1 1.5 1.9v2.4a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 5 19.5zM5 17h15',
  bow: 'M5 3.5c10 3 10 14 0 17M5 3.5v17M2.5 12H21M17.5 8.5L21 12l-3.5 3.5',
  plus: 'M12 5v14M5 12h14',
  ban: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM6 6l12 12',
  sound: 'M4 9.5v5h4l5 4v-13l-5 4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11',
  'sound-off': 'M4 9.5v5h4l5 4v-13l-5 4H4zM16.5 9.5l5 5M21.5 9.5l-5 5',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  x: 'M6 6l12 12M18 6L6 18',
  undo: 'M4 10.5h10a5 5 0 0 1 0 10h-3M8.5 6L4 10.5 8.5 15',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  tent: 'M3 20.5L12 4l9 16.5zM10 20.5l2-4.5 2 4.5',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  play: 'M7 4.5l12 7.5-12 7.5z',
};
const FILLED = new Set(['play']);

// Trả về chuỗi <svg>. cls: lớp CSS thêm (vd 'lg', 'gold'); 'fill' tô đặc thay vì nét.
export function icon(name, cls = '') {
  const d = P[name];
  if (!d) return '';
  const fill = FILLED.has(name) || /\bfill\b/.test(cls);
  return `<svg class="ic ${fill ? 'fill ' : ''}${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
}
export const ICON_NAMES = Object.keys(P);
