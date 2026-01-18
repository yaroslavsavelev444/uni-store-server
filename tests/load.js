import http from 'k6/http';
import { check, group, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 100 },  // Ramp-up to 100 users
    { duration: '5m', target: 100 },  // Steady state
    { duration: '1m', target: 0 },    // Ramp-down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<1000'],  // 95% запросов <1s
    'http_req_failed': ['rate<0.01'],     // Ошибок <1%
    'checks': ['rate>0.99'],              // 99% проверок успешны
  },
};

const BASE_URL = 'http://api.npo-polet.ru';  // Замени на свой VPS URL
const endpoints = [
  '/api/login',    // POST для аутентификации
  '/api/users',    // GET для списка пользователей
  '/api/posts',    // POST для создания поста
  '/api/search',   // GET с параметрами
];

export default function () {
  // Группа: Аутентификация (один раз на пользователя)
  group('Auth Scenario', function () {
    let payload = JSON.stringify({ username: 'testuser', password: 'pass' });
    let params = { headers: { 'Content-Type': 'application/json' } };
    let res = http.post(`${BASE_URL}/login`, payload, params);  // Замени на реальный эндпоинт
    check(res, { 'login success': (r) => r.status === 200 });
    sleep(1 + Math.random());  // Случайная пауза 1-2s
  });

  // Группа: Пользовательские действия (несколько запросов)
  group('User Actions', function () {
    // GET на /api/users
    let res1 = http.get(`${BASE_URL}/products`);
    check(res1, { 'get products success': (r) => r.status === 200 && r.json().length > 0 });

    // POST на /api/posts с рандомным payload
    let postPayload = JSON.stringify({ title: `Post ${Math.random()}`, content: 'Test content' });
    let res2 = http.get(`${BASE_URL}/consents`, postPayload, { headers: { 'Content-Type': 'application/json' } });
    check(res2, { 'create post success': (r) => r.status === 201 });

    // GET на /api/search с параметрами
    let searchParams = { tags: ['param1=value1', 'param2=value2'] };
    let res3 = http.get(`${BASE_URL}/categories`, { params: searchParams });
    check(res3, { 'search success': (r) => r.status === 200 });

    sleep(Math.random() * 3 + 1);  // Паузы между действиями 1-4s
  });

  // Цикл по случайным эндпоинтам (для разнообразия)
  let randomEndpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
  http.get(`${BASE_URL}${randomEndpoint}`);
  sleep(0.5);
}