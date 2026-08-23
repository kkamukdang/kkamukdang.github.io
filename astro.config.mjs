// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  /**
   * GitHub Pages 주소에 맞춰 두 값을 바꿔주세요.
   *
   *  · 사용자 사이트 (아이디.github.io 저장소)
   *      site: 'https://아이디.github.io'
   *      base 는 지웁니다.
   *
   *  · 프로젝트 사이트 (아이디.github.io/kkamukdang)
   *      site: 'https://아이디.github.io'
   *      base: '/kkamukdang'
   */
  site: 'https://kkamukdang.github.io',
  // base: '/kkamukdang',

  trailingSlash: 'always',
  build: { format: 'directory' },
});
