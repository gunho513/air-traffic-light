// 캐시 저장소 이름 정의
const CACHE_NAME = 'air-traffic-cache-v1';

// 오프라인 및 빠른 로딩을 위해 캐싱할 정적 파일 목록
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// 서비스 워커 설치 시 실행: 핵심 자원들을 캐시에 저장
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting(); // 새 서비스 워커 즉시 활성화
});

// 서비스 워커 활성화 시 실행: 구버전 캐시 삭제 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 브라우저 네트워크 요청 처리
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 실시간 대기오염 API(/api/dust)는 캐시를 타지 않고 항상 최신 네트워크 데이터 요청
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 화면 디자인 및 정적 파일은 캐시 우선 응답 (없으면 네트워크 호출)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
